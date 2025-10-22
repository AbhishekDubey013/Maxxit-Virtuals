/**
 * Trade Execution Coordinator
 * Routes signals to appropriate venue adapters and manages trade lifecycle
 */

import { PrismaClient, Signal, Venue, AgentDeployment } from '@prisma/client';
import { createSafeWallet, getChainIdForVenue, SafeWalletService } from './safe-wallet';
import { createSpotAdapter, SpotAdapter } from './adapters/spot-adapter';
import { createHyperliquidAdapter, HyperliquidAdapter } from './adapters/hyperliquid-adapter';
import { SafeModuleService, createSafeModuleService } from './safe-module-service';
import { createSafeTransactionService } from './safe-transaction-service';
import { createACPService, isACPEnabled } from './acp-service';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  positionId?: string;
  error?: string;
  reason?: string;
  executionSummary?: any;
}

export interface ExecutionContext {
  signal: Signal;
  deployment: AgentDeployment;
  safeWallet: SafeWalletService;
}

/**
 * Trade Executor - Coordinates signal execution across venues
 */
export class TradeExecutor {
  /**
   * Execute a signal for a SPECIFIC deployment
   * Used for manual Telegram trades to ensure correct user's Safe is used
   */
  async executeSignalForDeployment(signalId: string, deploymentId: string): Promise<ExecutionResult> {
    try {
      // Fetch signal with specific deployment
      const signal = await prisma.signal.findUnique({
        where: { id: signalId },
        include: {
          agent: true,
        },
      });

      if (!signal) {
        return {
          success: false,
          error: 'Signal not found',
        };
      }

      // Fetch specific deployment
      const deployment = await prisma.agentDeployment.findUnique({
        where: { id: deploymentId },
        include: {
          agent: true,
        },
      });

      if (!deployment) {
        return {
          success: false,
          error: 'Deployment not found',
        };
      }

      // Merge signal.agent with deployment data for executeSignalInternal
      const signalWithDeployment = {
        ...signal,
        agent: {
          ...signal.agent,
          deployments: [deployment],
        },
      };

      return this.executeSignalInternal(signalWithDeployment as any);
    } catch (error: any) {
      console.error('[TradeExecutor] Execute signal for deployment error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute a signal (auto trading - uses first active deployment)
   */
  async executeSignal(signalId: string): Promise<ExecutionResult> {
    try {
      // Fetch signal with related data
      const signal = await prisma.signal.findUnique({
        where: { id: signalId },
        include: {
          agent: {
            include: {
              deployments: {
                where: { status: 'ACTIVE' },
                orderBy: { subStartedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });

      if (!signal) {
        return {
          success: false,
          error: 'Signal not found',
        };
      }

      if (signal.agent.deployments.length === 0) {
        return {
          success: false,
          error: 'No active deployment found for agent',
        };
      }

      return this.executeSignalInternal(signal as any);
    } catch (error: any) {
      console.error('[TradeExecutor] Execute signal error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Internal method to execute signal with deployment
   */
  private async executeSignalInternal(signal: any): Promise<ExecutionResult> {
    try {
      const deployment = signal.agent.deployments[0];

      // Validate Safe wallet
      const chainId = getChainIdForVenue(signal.venue);
      const safeWallet = createSafeWallet(deployment.safeWallet, chainId);
      
      const validation = await safeWallet.validateSafe();
      if (!validation.valid) {
        return {
          success: false,
          error: `Safe wallet validation failed: ${validation.error}`,
        };
      }

      // NOTE: Module auto-initializes on first trade (handled by smart contract)

      // Pre-trade validations
      const preCheck = await this.preTradeValidation(signal, deployment, safeWallet);
      if (!preCheck.canExecute) {
        return {
          success: false,
          error: 'Pre-trade validation failed',
          reason: preCheck.reason,
          executionSummary: preCheck,
        };
      }

      // Route to appropriate venue
      const result = await this.routeToVenue({
        signal,
        deployment,
        safeWallet,
      });

      return result;
    } catch (error: any) {
      console.error('[TradeExecutor] Execution failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Pre-trade validation
   */
  private async preTradeValidation(
    signal: Signal,
    deployment: AgentDeployment,
    safeWallet: SafeWalletService
  ): Promise<{
    canExecute: boolean;
    reason?: string;
    usdcBalance?: number;
    tokenAvailable?: boolean;
  }> {
    try {
      // Strip _MANUAL_timestamp suffix if present (from Telegram manual trades)
      const actualTokenSymbol = signal.tokenSymbol.split('_MANUAL_')[0];
      
      // 1. Check venue availability
      const venueStatus = await prisma.venueStatus.findUnique({
        where: {
          venue_tokenSymbol: {
            venue: signal.venue,
            tokenSymbol: actualTokenSymbol,
          },
        },
      });

      if (!venueStatus) {
        return {
          canExecute: false,
          reason: `${actualTokenSymbol} not available on ${signal.venue}`,
          tokenAvailable: false,
        };
      }

      // 2. Check USDC balance
      const usdcBalance = await safeWallet.getUSDCBalance();
      
      if (usdcBalance === 0) {
        return {
          canExecute: false,
          reason: 'No USDC balance in Safe wallet',
          usdcBalance,
          tokenAvailable: true,
        };
      }

      // 3. Check position size requirements
      const sizeModel = signal.sizeModel as any;
      const requiredCollateral = (usdcBalance * sizeModel.value) / 100;

      if (requiredCollateral === 0) {
        return {
          canExecute: false,
          reason: 'Position size too small',
          usdcBalance,
          tokenAvailable: true,
        };
      }

      // 4. For SPOT, check token registry
      if (signal.venue === 'SPOT') {
        const chainId = getChainIdForVenue(signal.venue);
        const chain = chainId === 42161 ? 'arbitrum' : chainId === 8453 ? 'base' : 'sepolia';
        
        const tokenRegistry = await prisma.tokenRegistry.findUnique({
          where: {
            chain_tokenSymbol: {
              chain,
              tokenSymbol: actualTokenSymbol,
            },
          },
        });

        if (!tokenRegistry) {
          return {
            canExecute: false,
            reason: `Token ${actualTokenSymbol} not found in registry for ${chain}`,
            usdcBalance,
            tokenAvailable: false,
          };
        }
      }

      return {
        canExecute: true,
        usdcBalance,
        tokenAvailable: true,
      };
    } catch (error: any) {
      return {
        canExecute: false,
        reason: error.message,
      };
    }
  }

  /**
   * Route to appropriate venue adapter
   */
  private async routeToVenue(ctx: ExecutionContext): Promise<ExecutionResult> {
    switch (ctx.signal.venue) {
      case 'SPOT':
        return this.executeSpotTrade(ctx);
      case 'GMX':
        return {
          success: false,
          error: 'GMX perpetuals coming soon on Base! Stay tuned for updates.',
        };
      case 'HYPERLIQUID':
        return {
          success: false,
          error: 'Hyperliquid perpetuals coming soon on Base! Stay tuned for updates.',
        };
      default:
        return {
          success: false,
          error: `Unsupported venue: ${ctx.signal.venue}`,
        };
    }
  }

  /**
   * Execute SPOT trade
   */
  private async executeSpotTrade(ctx: ExecutionContext): Promise<ExecutionResult> {
    try {
      const chainId = getChainIdForVenue(ctx.signal.venue);
      const adapter = createSpotAdapter(ctx.safeWallet, chainId);

      // Get execution summary
      const summary = await adapter.getExecutionSummary({
        signal: ctx.signal,
        safeAddress: ctx.deployment.safeWallet,
      });

      if (!summary.canExecute) {
        return {
          success: false,
          error: 'Cannot execute SPOT trade',
          reason: summary.reason,
          executionSummary: summary,
        };
      }

      // Get token addresses
      // Strip _MANUAL_timestamp suffix if present (from Telegram manual trades)
      const actualTokenSymbol = ctx.signal.tokenSymbol.split('_MANUAL_')[0];
      
      const chain = chainId === 42161 ? 'arbitrum' : chainId === 8453 ? 'base' : 'sepolia';
      const tokenRegistry = await prisma.tokenRegistry.findUnique({
        where: {
          chain_tokenSymbol: {
            chain,
            tokenSymbol: actualTokenSymbol,
          },
        },
      });

      if (!tokenRegistry) {
        return {
          success: false,
          error: `Token ${actualTokenSymbol} not found in registry`,
        };
      }

      // Calculate amounts based on size model type
      const usdcBalance = summary.usdcBalance || 0;
      const sizeModel = ctx.signal.sizeModel as any;
      
      let positionSize: number;
      
      if (sizeModel.type === 'fixed-usdc') {
        // Manual trades: Use exact USDC amount specified by user
        positionSize = sizeModel.value || 0;
        console.log('[TradeExecutor] Position sizing (MANUAL):', {
          walletBalance: usdcBalance,
          requestedAmount: positionSize + ' USDC',
          type: 'fixed-usdc'
        });
      } else {
        // Auto trades: Use percentage of actual balance (default 5% if not specified)
        const percentageToUse = sizeModel.value || 5;
        positionSize = (usdcBalance * percentageToUse) / 100;
        console.log('[TradeExecutor] Position sizing (AUTO):', {
          walletBalance: usdcBalance,
          percentage: percentageToUse + '%',
          positionSize: positionSize.toFixed(2) + ' USDC',
          type: 'balance-percentage'
        });
      }
      
      // Minimum position size check (0.1 USDC minimum)
      if (positionSize < 0.1) {
        return {
          success: false,
          error: `Position size too small: ${positionSize.toFixed(2)} USDC (min: 0.1 USDC)`,
          reason: 'Insufficient balance for minimum trade size',
        };
      }
      
      // Check if user has enough balance for manual trade
      if (sizeModel.type === 'fixed-usdc' && positionSize > usdcBalance) {
        return {
          success: false,
          error: `Insufficient balance: Need ${positionSize} USDC, have ${usdcBalance.toFixed(2)} USDC`,
          reason: 'Requested amount exceeds wallet balance',
        };
      }
      
      const amountIn = ethers.utils.parseUnits(positionSize.toFixed(6), 6); // USDC has 6 decimals

      // Get USDC address
      const USDC_ADDRESSES: Record<number, string> = {
        11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia testnet
        42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum
        8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
      };
      const usdcAddress = USDC_ADDRESSES[chainId];

      // Get quote
      const quote = await adapter.getQuote({
        tokenIn: usdcAddress,
        tokenOut: tokenRegistry.tokenAddress,
        amountIn: amountIn.toString(),
      });

      // TEMPORARY: Disable slippage check for testing (50% tolerance)
      // TODO: Re-enable with proper slippage after confirming this is the issue
      const minAmountOut = adapter.calculateMinAmountOut(quote.amountOut, 5000); // 50% slippage (effectively disabled)

      // Build transactions
      const approvalTx = await adapter.buildApprovalTx(
        usdcAddress,
        amountIn.toString()
      );

      const swapTx = await adapter.buildSwapTx({
        tokenIn: usdcAddress,
        tokenOut: tokenRegistry.tokenAddress,
        amountIn: amountIn.toString(),
        minAmountOut,
        deadline: Math.floor(Date.now() / 1000) + 1200, // 20 minutes
        recipient: ctx.deployment.safeWallet,
      });

      // Use Safe Module Service for gasless execution
      const moduleAddress = process.env.TRADING_MODULE_ADDRESS || process.env.MODULE_ADDRESS || '0x74437d894C8E8A5ACf371E10919c688ae79E89FA';
      const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;
      
      if (!executorPrivateKey) {
        return {
          success: false,
          error: 'EXECUTOR_PRIVATE_KEY not configured',
        };
      }
      
      const moduleService = new SafeModuleService({
        moduleAddress,
        chainId,
        executorPrivateKey,
      });
      
      const routerAddress = SpotAdapter.getRouterAddress(chainId);
      if (!routerAddress) {
        return {
          success: false,
          error: `Router not configured for chain ${chainId}`,
        };
      }
      
      // AUTO-SETUP: Ensure Safe is fully configured (one-time operations)
      console.log('[TradeExecutor] 🔧 Running auto-setup checks...');
      
      // Step 1: Initialize capital tracking (if not already done)
      try {
        const stats = await moduleService.getSafeStats(ctx.deployment.safeWallet);
        if (!stats.initialized) {
          console.log('[TradeExecutor] 📋 Capital not initialized - initializing now...');
          const initResult = await moduleService.initializeCapital(ctx.deployment.safeWallet);
          if (initResult.success) {
            console.log('[TradeExecutor] ✅ Capital initialized:', initResult.txHash);
          } else {
            console.warn('[TradeExecutor] ⚠️  Capital init failed (might be racing):', initResult.error);
          }
        } else {
          console.log('[TradeExecutor] ✅ Capital already initialized');
        }
      } catch (error: any) {
        console.warn('[TradeExecutor] ⚠️  Could not check/init capital:', error.message);
        // Continue anyway - might be a transient issue
      }
      
      // Step 2: Ensure token is whitelisted
      console.log('[TradeExecutor] 📋 Checking token whitelist for', ctx.signal.tokenSymbol);
      try {
        const isWhitelisted = await moduleService.checkTokenWhitelist(
          ctx.deployment.safeWallet,
          tokenRegistry.tokenAddress
        );
        
        if (!isWhitelisted) {
          console.log('[TradeExecutor] 📋 Token not whitelisted - whitelisting now...');
          const whitelistResult = await moduleService.setTokenWhitelist(
            ctx.deployment.safeWallet,
            tokenRegistry.tokenAddress,
            true
          );
          if (whitelistResult.success) {
            console.log('[TradeExecutor] ✅ Token whitelisted:', whitelistResult.txHash);
          } else {
            console.warn('[TradeExecutor] ⚠️  Whitelist failed:', whitelistResult.error);
          }
        } else {
          console.log('[TradeExecutor] ✅ Token already whitelisted');
        }
      } catch (error: any) {
        console.warn('[TradeExecutor] ⚠️  Could not check/whitelist token:', error.message);
        // Continue anyway
      }
      
      // Step 3: Ensure USDC is approved to router
      console.log('[TradeExecutor] 📋 Ensuring USDC approval...');
      const approvalResult = await moduleService.approveTokenForDex(
        ctx.deployment.safeWallet,
        usdcAddress,
        routerAddress
      );
      
      if (!approvalResult.success) {
        console.warn('[TradeExecutor] ⚠️  Approval failed, but continuing (might already be approved)');
        // Don't fail here - approval might already exist
      } else {
        console.log('[TradeExecutor] ✅ USDC approved:', approvalResult.txHash);
      }
      
      console.log('[TradeExecutor] 🎉 Auto-setup complete!');
      
      // Calculate Proof of Intent hash for transparency
      const signalHash = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['string', 'string', 'address', 'uint256', 'uint256'],
          [
            ctx.signal.side,
            ctx.signal.tokenSymbol,
            ctx.signal.agent.creatorWallet,
            amountIn.toString(),
            Date.now(),
          ]
        )
      );
      
      console.log('[TradeExecutor] 🔒 Proof of Intent calculated:', {
        signalId: ctx.signal.id,
        signalHash,
        creator: ctx.signal.agent.creatorWallet,
      });

      // Execute trade through module with Proof of Intent (gasless!)
      const result = await moduleService.executeTrade({
        safeAddress: ctx.deployment.safeWallet,
        fromToken: usdcAddress,
        toToken: tokenRegistry.tokenAddress,
        amountIn: amountIn.toString(),
        dexRouter: routerAddress,
        swapData: swapTx.data as string,
        minAmountOut,
        profitReceiver: ctx.signal.agent.profitReceiverAddress,
        signalHash, // Proof of Intent
        creatorAddress: ctx.signal.agent.creatorWallet, // Agent creator
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Transaction submission failed',
        };
      }

      // Parse actual amounts from result
      const actualAmountOut = result.amountOut ? parseFloat(ethers.utils.formatUnits(result.amountOut, 18)) : 0;
      const actualEntryPrice = actualAmountOut > 0 ? parseFloat(positionSize.toString()) / actualAmountOut : 0;

      // Update signal with Proof of Intent data
      await prisma.signal.update({
        where: { id: ctx.signal.id },
        data: {
          signalHash,
          creatorAddress: ctx.signal.agent.creatorWallet,
          proofOfIntentTxHash: result.txHash,
        },
      });

      console.log('[TradeExecutor] ✅ Proof of Intent stored in database:', {
        signalId: ctx.signal.id,
        signalHash,
        txHash: result.txHash,
      });

      // Create position record with REAL transaction hash
      const position = await prisma.position.create({
        data: {
          deploymentId: ctx.deployment.id,
          signalId: ctx.signal.id,
          venue: ctx.signal.venue,
          tokenSymbol: actualTokenSymbol, // Use actual token symbol (stripped _MANUAL_ suffix)
          side: ctx.signal.side,
          entryPrice: actualEntryPrice,
          qty: actualAmountOut,
          entryTxHash: result.txHash, // ⚡ REAL ON-CHAIN TX HASH
          trailingParams: {
            enabled: true,
            trailingPercent: 1, // 1% trailing stop
            highestPrice: null, // Will be set on first monitor check
          },
        },
      });

      console.log('[TradeExecutor] ✅ SPOT trade executed on-chain!', {
        positionId: position.id,
        txHash: result.txHash,
        token: ctx.signal.tokenSymbol,
        qty: actualAmountOut,
        entryPrice: actualEntryPrice,
        explorerLink: `https://arbiscan.io/tx/${result.txHash}`,
      });

      return {
        success: true,
        txHash: result.txHash,
        positionId: position.id,
      };
    } catch (error: any) {
      console.error('[TradeExecutor] SPOT execution failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute Hyperliquid trade
   */
  private async executeHyperliquidTrade(ctx: ExecutionContext): Promise<ExecutionResult> {
    try {
      const adapter = createHyperliquidAdapter(ctx.safeWallet);
      const chainId = getChainIdForVenue(ctx.signal.venue);

      // Get execution summary
      const summary = await adapter.getExecutionSummary({
        signal: ctx.signal,
        safeAddress: ctx.deployment.safeWallet,
      });

      if (!summary.canExecute) {
        return {
          success: false,
          error: 'Cannot execute Hyperliquid trade',
          reason: summary.reason,
          executionSummary: summary,
        };
      }

      // If bridge is needed, execute bridge transaction
      if (summary.needsBridge && summary.bridgeAmount) {
        const bridgeAmountWei = ethers.utils.parseUnits(
          summary.bridgeAmount.toFixed(6),
          6
        );

        // Build bridge approval
        const approvalTx = await adapter.buildBridgeApprovalTx(bridgeAmountWei.toString());

        // Build bridge transaction
        const bridgeTx = await adapter.buildBridgeTx(
          bridgeAmountWei.toString(),
          ctx.deployment.safeWallet
        );

        // Create Safe transaction service
        const txService = createSafeTransactionService(
          ctx.deployment.safeWallet,
          chainId,
          process.env.EXECUTOR_PRIVATE_KEY
        );

        // Submit batch transaction (approval + bridge)
        const result = await txService.batchTransactions([approvalTx, bridgeTx]);

        if (!result.success) {
          return {
            success: false,
            error: `Bridge failed: ${result.error}`,
          };
        }

        console.log('[TradeExecutor] Hyperliquid bridge submitted:', {
          amount: summary.bridgeAmount,
          safeTxHash: result.safeTxHash,
          txHash: result.txHash,
        });

        // Note: Actual trading on Hyperliquid requires EIP-1271 or dedicated wallet
        // For now, just record that bridge was initiated
        return {
          success: true,
          txHash: result.txHash,
          reason: 'Bridge initiated. Hyperliquid trading requires dedicated wallet setup.',
        };
      }

      // If no bridge needed but we have balance, we still need dedicated wallet for trading
      return {
        success: false,
        error: 'Hyperliquid trading requires EIP-1271 signature verification or dedicated trading wallet',
        reason: 'Direct trading from Safe wallet not yet supported on Hyperliquid',
        executionSummary: summary,
      };
    } catch (error: any) {
      console.error('[TradeExecutor] Hyperliquid execution failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Close a position
   */
  async closePosition(positionId: string): Promise<ExecutionResult> {
    try {
      const position = await prisma.position.findUnique({
        where: { id: positionId },
        include: {
          deployment: {
            include: {
              agent: true,
            },
          },
        },
      });

      if (!position) {
        return {
          success: false,
          error: 'Position not found',
        };
      }

      if (position.closedAt) {
        return {
          success: false,
          error: `Position already closed at ${position.closedAt.toISOString()}`,
        };
      }

      const chainId = getChainIdForVenue(position.venue);
      const safeWallet = createSafeWallet(position.deployment.safeWallet, chainId);

      // Route to appropriate venue for closing
      if (position.venue === 'SPOT') {
        return await this.closeSpotPosition(position, safeWallet, chainId);
      } else {
        return {
          success: false,
          error: `Position closing not implemented for ${position.venue}`,
        };
      }
    } catch (error: any) {
      console.error('[TradeExecutor] Close position failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Close SPOT position (swap token back to USDC)
   */
  private async closeSpotPosition(
    position: any,
    safeWallet: SafeWalletService,
    chainId: number
  ): Promise<ExecutionResult> {
    try {
      const adapter = createSpotAdapter(safeWallet, chainId);
      
      // Get token address
      const chain = chainId === 42161 ? 'arbitrum' : 'base';
      const tokenRegistry = await prisma.tokenRegistry.findUnique({
        where: {
          chain_tokenSymbol: {
            chain,
            tokenSymbol: position.tokenSymbol,
          },
        },
      });

      if (!tokenRegistry) {
        return {
          success: false,
          error: 'Token not found in registry',
        };
      }

      // Get USDC address
      const USDC_ADDRESSES: Record<number, string> = {
        11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia testnet
        42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum
        8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
      };
      const usdcAddress = USDC_ADDRESSES[chainId];

      // Check actual token balance in Safe (not DB qty, as it might be outdated)
      const tokenDecimals = tokenRegistry.decimals || 18;
      const rpcUrls: Record<number, string> = {
        42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
        8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      };
      const provider = new ethers.providers.JsonRpcProvider(
        rpcUrls[chainId] || 'https://mainnet.base.org'
      );
      const tokenContract = new ethers.Contract(
        tokenRegistry.tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      
      const actualBalance = await tokenContract.balanceOf(position.deployment.safeWallet);
      
      if (actualBalance.eq(0)) {
        return {
          success: false,
          error: `No ${position.tokenSymbol} balance in Safe to close`,
        };
      }
      
      // Use actual balance instead of DB qty
      const tokenAmountWei = actualBalance;
      const actualQty = ethers.utils.formatUnits(actualBalance, tokenDecimals);
      
      console.log('[TradeExecutor] Closing position:', {
        positionId: position.id,
        token: position.tokenSymbol,
        tokenAddress: tokenRegistry.tokenAddress,
        dbQty: position.qty,
        actualQty: actualQty,
        amountWei: tokenAmountWei.toString(),
      });

      // Build swap back to USDC (module will handle token approval automatically)
      const swapTx = await adapter.buildCloseSwapTx({
        tokenIn: tokenRegistry.tokenAddress,
        tokenOut: usdcAddress,
        amountIn: tokenAmountWei.toString(),
        minAmountOut: '0', // TODO: Calculate proper slippage
        recipient: position.deployment.safeWallet,
        deadline: Math.floor(Date.now() / 1000) + 1200,
      });

      // Execute through module (same as opening positions)
      const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;
      if (!executorPrivateKey) {
        return {
          success: false,
          error: 'EXECUTOR_PRIVATE_KEY not configured',
        };
      }

      const moduleService = createSafeModuleService(
        position.deployment.moduleAddress!,
        chainId,
        executorPrivateKey
      );
      const routerAddress = SpotAdapter.getRouterAddress(chainId);
      if (!routerAddress) {
        return {
          success: false,
          error: `Router not configured for chain ${chainId}`,
        };
      }

      // Approve ARB (or whatever token) to the Uniswap Router before swapping
      console.log('[TradeExecutor] Approving token to router for closing...');
      const approvalResult = await moduleService.approveTokenForDex(
        position.deployment.safeWallet,
        tokenRegistry.tokenAddress,
        routerAddress
      );

      if (!approvalResult.success) {
        // If approval failed, check if it's already approved
        console.log('[TradeExecutor] Approval transaction failed, checking if already approved...');
        const isApproved = await moduleService.checkTokenApproval(
          position.deployment.safeWallet,
          tokenRegistry.tokenAddress,
          routerAddress
        );
        
        if (!isApproved) {
          return {
            success: false,
            error: `Token approval failed: ${approvalResult.error}. Please approve ${position.tokenSymbol} manually.`,
          };
        }
        console.log('[TradeExecutor] Token already approved, proceeding...');
      } else {
        console.log('[TradeExecutor] Token approved to router:', approvalResult.txHash);
        // Wait a moment for approval to propagate
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Calculate total entry value in USDC (entryPrice * actualQty)
      const totalEntryValueUSD = Number(position.entryPrice) * Number(actualQty);
      const entryValueUSDC = ethers.utils.parseUnits(
        totalEntryValueUSD.toFixed(6), // Format to 6 decimals for USDC
        6
      ).toString();

      // Get current price for exit price recording
      const { getTokenPriceUSD } = await import('../lib/price-oracle');
      const exitPrice = await getTokenPriceUSD(position.tokenSymbol, chainId);
      
      // Calculate PnL
      const entryPrice = parseFloat(position.entryPrice.toString());
      let pnl: number;
      if (position.side === 'LONG') {
        pnl = (exitPrice - entryPrice) * actualQty;
      } else {
        pnl = (entryPrice - exitPrice) * actualQty;
      }

      // Execute close position through module (with profit sharing)
      const result = await moduleService.closePosition({
        safeAddress: position.deployment.safeWallet,
        tokenIn: tokenRegistry.tokenAddress,
        tokenOut: usdcAddress,
        amountIn: tokenAmountWei.toString(),
        minAmountOut: '0',
        profitReceiver: position.deployment.agent.profitReceiverAddress,
        entryValueUSDC: entryValueUSDC,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Close transaction failed',
        };
      }

      // Update position as closed with actual exit price and PnL
      await prisma.position.update({
        where: { id: position.id },
        data: {
          closedAt: new Date(),
          exitPrice: exitPrice,
          exitTxHash: result.txHash,
          qty: actualQty, // Update to actual closed qty
          pnl: pnl,
        },
      });

      // NOTE: Profit distribution is handled ON-CHAIN by Safe Module
      // The Safe module contract already distributed the profit share (20%)
      // to the agent creator during the closePosition() transaction.
      // We just need to record this in our database for tracking.
      
      if (pnl > 0 && result.txHash) {
        try {
          // Calculate what the Safe module distributed (20% of profit)
          const profitShareBps = 2000; // 20% as defined in Safe module contract
          const profitShare = (pnl * profitShareBps) / 10000;

          console.log('[Payment] Safe module distributed profit share on-chain:', {
            positionId: position.id,
            totalProfit: pnl,
            creatorShare: profitShare,
            txHash: result.txHash,
          });

          // Record the on-chain profit distribution in our database
          await prisma.billingEvent.create({
            data: {
              positionId: position.id,
              deploymentId: position.deploymentId,
              kind: 'PROFIT_SHARE',
              amount: profitShare,
              asset: 'USDC',
              status: 'CHARGED',
              metadata: {
                txHash: result.txHash,
                distributedOnChain: true,
                safeModuleAddress: result.moduleAddress || 'unknown',
                profitShareBps: profitShareBps,
                recipient: position.deployment.agent.profitReceiverAddress,
              },
            },
          });

          console.log('[Payment] Profit share recorded in database');
        } catch (dbError: any) {
          console.error('[Payment] Failed to record profit share in DB:', dbError);
          // Continue anyway - payment was successful on-chain
        }
      }

      return {
        success: true,
        txHash: result.txHash,
        positionId: position.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * Create trade executor instance
 */
export function createTradeExecutor(): TradeExecutor {
  return new TradeExecutor();
}
