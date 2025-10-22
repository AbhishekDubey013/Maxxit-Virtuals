/**
 * Hyperliquid Perpetuals Adapter
 * Executes leveraged perpetual positions on Hyperliquid
 */

import { ethers } from 'ethers';
import { SafeWalletService, TransactionRequest } from '../safe-wallet';

export interface HyperliquidPositionParams {
  coin: string;             // Token symbol (e.g., 'BTC', 'ETH')
  isBuy: boolean;           // true = LONG, false = SHORT
  sz: number;               // Size in base units
  limitPx: number;          // Limit price (0 for market order)
  reduceOnly: boolean;      // true for closing positions
  slippage?: number;        // Slippage tolerance (default 1%)
}

export interface HyperliquidPosition {
  coin: string;
  szi: string;              // Position size (positive = long, negative = short)
  entryPx: string;          // Entry price
  positionValue: string;    // Position value in USD
  unrealizedPnl: string;    // Unrealized P&L
  liquidationPx: string;    // Liquidation price
  leverage: string;         // Current leverage
}

/**
 * Hyperliquid Adapter for Perpetual Trading
 */
export class HyperliquidAdapter {
  private safeWallet: SafeWalletService;

  // Hyperliquid Bridge on Arbitrum
  private static readonly HL_BRIDGE = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';
  
  // Hyperliquid API endpoint
  private static readonly HL_API = 'https://api.hyperliquid.xyz';

  // USDC on Arbitrum (to bridge)
  private static readonly USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

  constructor(safeWallet: SafeWalletService) {
    this.safeWallet = safeWallet;
  }

  /**
   * Build transaction to bridge USDC to Hyperliquid
   */
  async buildBridgeTx(amount: string, destination: string): Promise<TransactionRequest> {
    const bridgeInterface = new ethers.utils.Interface([
      'function bridgeIn(address token, uint256 amount, address destination) external',
    ]);

    const data = bridgeInterface.encodeFunctionData('bridgeIn', [
      HyperliquidAdapter.USDC,
      amount,
      destination,
    ]);

    return {
      to: HyperliquidAdapter.HL_BRIDGE,
      value: '0',
      data,
      operation: 0,
    };
  }

  /**
   * Build transaction to approve USDC for bridge
   */
  async buildBridgeApprovalTx(amount: string): Promise<TransactionRequest> {
    return this.safeWallet.buildTokenApproval(
      HyperliquidAdapter.USDC,
      HyperliquidAdapter.HL_BRIDGE,
      amount
    );
  }

  /**
   * Open position via Hyperliquid API
   * Note: This requires direct signing, not Safe transactions
   * For Safe integration, we'd need to implement EIP-1271 signature verification
   */
  async openPosition(params: {
    coin: string;
    isBuy: boolean;
    size: number;
    leverage: number;
    limitPrice?: number;
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      // Calculate order size
      const sz = params.size;
      const limitPx = params.limitPrice || 0; // 0 = market order

      // Build order payload
      const order = {
        coin: params.coin,
        is_buy: params.isBuy,
        sz: sz.toString(),
        limit_px: limitPx.toString(),
        order_type: { limit: { tif: 'Ioc' } }, // Immediate or Cancel
        reduce_only: false,
      };

      // TODO: Sign and submit order to Hyperliquid
      // This requires implementing the Hyperliquid signing mechanism
      // For now, return placeholder

      console.log('[Hyperliquid] Would open position:', order);

      return {
        success: false,
        error: 'Hyperliquid direct integration requires EIP-1271 signature verification',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Close position
   */
  async closePosition(params: {
    coin: string;
    size: number;
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      // For closing, we submit a reduce-only order in opposite direction
      // This is a simplified version
      
      console.log('[Hyperliquid] Would close position:', params.coin, params.size);

      return {
        success: false,
        error: 'Hyperliquid direct integration requires EIP-1271 signature verification',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get current positions via API
   */
  async getPositions(address: string): Promise<HyperliquidPosition[]> {
    try {
      const response = await fetch(`${HyperliquidAdapter.HL_API}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: address,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return data.assetPositions?.map((pos: any) => ({
        coin: pos.position.coin,
        szi: pos.position.szi,
        entryPx: pos.position.entryPx,
        positionValue: pos.position.positionValue,
        unrealizedPnl: pos.position.unrealizedPnl,
        liquidationPx: pos.position.liquidationPx,
        leverage: pos.position.leverage?.value || '1',
      })) || [];
    } catch (error) {
      console.error('[Hyperliquid] Failed to fetch positions:', error);
      return [];
    }
  }

  /**
   * Get account balance on Hyperliquid
   */
  async getBalance(address: string): Promise<{ withdrawable: number; total: number }> {
    try {
      const response = await fetch(`${HyperliquidAdapter.HL_API}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: address,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        withdrawable: parseFloat(data.withdrawable || '0'),
        total: parseFloat(data.marginSummary?.accountValue || '0'),
      };
    } catch (error) {
      console.error('[Hyperliquid] Failed to fetch balance:', error);
      return { withdrawable: 0, total: 0 };
    }
  }

  /**
   * Get market info for a token
   */
  async getMarketInfo(coin: string): Promise<{
    price: number;
    fundingRate: number;
    openInterest: number;
    volume24h: number;
  } | null> {
    try {
      const response = await fetch(`${HyperliquidAdapter.HL_API}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'metaAndAssetCtxs',
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Find the specific coin
      const assetCtx = data[0]?.universe?.find((u: any) => u.name === coin);
      
      if (!assetCtx) {
        return null;
      }

      return {
        price: parseFloat(assetCtx.ctx?.markPx || '0'),
        fundingRate: parseFloat(assetCtx.ctx?.funding || '0'),
        openInterest: parseFloat(assetCtx.ctx?.openInterest || '0'),
        volume24h: parseFloat(assetCtx.ctx?.dayNtlVlm || '0'),
      };
    } catch (error) {
      console.error('[Hyperliquid] Failed to fetch market info:', error);
      return null;
    }
  }

  /**
   * Get execution summary
   */
  async getExecutionSummary(params: {
    signal: any;
    safeAddress: string;
  }): Promise<{
    canExecute: boolean;
    reason?: string;
    hlBalance?: { withdrawable: number; total: number };
    usdcBalance?: number;
    needsBridge?: boolean;
    bridgeAmount?: number;
  }> {
    try {
      // Check Arbitrum USDC balance
      const usdcBalance = await this.safeWallet.getUSDCBalance();

      // Check Hyperliquid balance
      const hlBalance = await this.getBalance(params.safeAddress);

      // Calculate required amount
      const requiredCollateral = (usdcBalance * params.signal.sizeModel.value) / 100;

      // Check if we need to bridge
      const needsBridge = hlBalance.withdrawable < requiredCollateral;
      const bridgeAmount = needsBridge ? requiredCollateral - hlBalance.withdrawable : 0;

      if (needsBridge && usdcBalance < bridgeAmount) {
        return {
          canExecute: false,
          reason: 'Insufficient USDC on Arbitrum to bridge',
          usdcBalance,
          hlBalance,
          needsBridge,
          bridgeAmount,
        };
      }

      // Check if market exists
      const marketInfo = await this.getMarketInfo(params.signal.tokenSymbol);
      if (!marketInfo) {
        return {
          canExecute: false,
          reason: `Market not available for ${params.signal.tokenSymbol}`,
          usdcBalance,
          hlBalance,
        };
      }

      return {
        canExecute: true,
        usdcBalance,
        hlBalance,
        needsBridge,
        bridgeAmount,
      };
    } catch (error: any) {
      return {
        canExecute: false,
        reason: error.message,
      };
    }
  }
}

/**
 * Create Hyperliquid adapter for a Safe wallet
 */
export function createHyperliquidAdapter(safeWallet: SafeWalletService): HyperliquidAdapter {
  return new HyperliquidAdapter(safeWallet);
}

/**
 * Note on Hyperliquid Integration:
 * 
 * Hyperliquid trading requires signing orders with the wallet's private key.
 * For Safe wallets (multisig), there are two approaches:
 * 
 * 1. Agent Wallet: Create a dedicated EOA wallet for each agent that holds small amounts
 *    and is authorized by the Safe via EIP-1271. Users bridge funds to this wallet.
 * 
 * 2. Gasless Trading: Use Hyperliquid's gasless trading feature where Safe signs
 *    a message authorizing a relayer to trade on its behalf.
 * 
 * For initial implementation, we'll use approach #1 with small authorized wallets.
 */
