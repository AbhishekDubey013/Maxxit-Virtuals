// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MaxxitTradingModule
 * @notice Safe Module for AI Trading Agents on Base Network
 * 
 * ARCHITECTURE:
 * - SPOT Trading: Uniswap V3 on Base
 * - Payment Layer: This contract (on-chain, trustless)
 * - Discovery Layer: Virtuals Protocol ACP (off-chain registration)
 * 
 * FEATURES:
 * - Trade Execution: Swap tokens via Uniswap V3
 * - Fee Collection: 0.2 USDC per trade (on-chain)
 * - Profit Sharing: 20% to agent creator (on-chain)
 * - Non-Custodial: Users control Safe wallets
 * - Transparent: All payments verifiable on Basescan
 * 
 * INTEGRATION WITH VIRTUALS PROTOCOL:
 * - Agents registered with ACP get acpServiceId (off-chain)
 * - All payments handled by this contract (on-chain)
 * - ACP used for discovery and marketplace listing
 * - Clear separation: payments (this contract) vs discovery (ACP)
 * 
 * NETWORK: Base (Chain ID: 8453)
 * USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        uint8 operation
    ) external returns (bool success);
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    
    function exactInputSingle(ExactInputSingleParams calldata params) 
        external 
        returns (uint256 amountOut);
}

contract MaxxitTradingModule {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════
    // CONSTANTS (Base Network)
    // ═══════════════════════════════════════════════════════
    
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; // Base USDC
    address public constant UNISWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481; // Uniswap V3 SwapRouter02 on Base
    
    uint256 public constant PLATFORM_FEE = 200000; // 0.2 USDC (6 decimals)
    uint256 public constant PROFIT_SHARE_BPS = 2000; // 20% = 2000 basis points
    
    // ═══════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════
    
    address public immutable moduleOwner;
    address public immutable executor;
    address public platformFeeReceiver;
    
    // Optional: Store ACP service IDs for reference (not used for payments)
    // Payments are handled by this contract, ACP is for discovery only
    mapping(address => string) public acpServiceIds; // Safe → acpServiceId
    
    // Per-Safe capital tracking
    struct SafeStats {
        bool initialized;
        uint256 initialCapital;
        uint256 totalTradesExecuted;
        uint256 totalFeesCollected;
        uint256 totalProfitsShared;
    }
    mapping(address => SafeStats) public safeStats;
    
    // Per-Safe token whitelist (agent-specific)
    mapping(address => mapping(address => bool)) public tokenWhitelist;
    
    // ═══════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════
    
    event ModuleInitialized(address indexed safe, uint256 initialCapital);
    event TradeFeeCollected(address indexed safe, uint256 amount, address receiver);
    event TradeExecuted(
        address indexed safe, 
        address indexed tokenIn, 
        address indexed tokenOut, 
        uint256 amountIn, 
        uint256 amountOut
    );
    event PositionClosed(
        address indexed safe,
        address indexed token,
        uint256 amountIn,
        uint256 amountOut,
        uint256 profit,
        uint256 profitShare
    );
    event ProfitShareDistributed(
        address indexed safe, 
        address indexed agentCreator, 
        uint256 amount
    );
    event TokenWhitelistUpdated(
        address indexed safe, 
        address indexed token, 
        bool enabled
    );
    event ACPServiceIdSet(
        address indexed safe,
        string acpServiceId
    );
    
    // Proof of Intent (Gas-Optimized)
    event ProofOfIntent(
        bytes32 indexed signalHash,  // Hash of signal data (verifiable)
        address indexed creator,     // Agent creator address
        uint256 timestamp            // When intent was recorded
    );
    
    // ═══════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════
    
    constructor(address _executor, address _platformFeeReceiver) {
        require(_executor != address(0), "Invalid executor");
        require(_platformFeeReceiver != address(0), "Invalid fee receiver");
        
        moduleOwner = msg.sender;
        executor = _executor;
        platformFeeReceiver = _platformFeeReceiver;
    }
    
    // ═══════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════
    
    modifier onlyExecutor() {
        require(msg.sender == executor, "Only executor");
        _;
    }
    
    modifier onlyModuleOwner() {
        require(msg.sender == moduleOwner, "Only module owner");
        _;
    }
    
    // ═══════════════════════════════════════════════════════
    // SETUP & INITIALIZATION
    // ═══════════════════════════════════════════════════════
    
    /**
     * @notice Initialize Safe for trading (auto-called on first trade)
     * @param safe Safe wallet address
     */
    function initializeSafe(address safe) external onlyExecutor {
        require(!safeStats[safe].initialized, "Already initialized");
        
        uint256 usdcBalance = IERC20(USDC).balanceOf(safe);
        
        safeStats[safe] = SafeStats({
            initialized: true,
            initialCapital: usdcBalance,
            totalTradesExecuted: 0,
            totalFeesCollected: 0,
            totalProfitsShared: 0
        });
        
        emit ModuleInitialized(safe, usdcBalance);
    }
    
    /**
     * @notice Set ACP service ID for a Safe (optional, for reference only)
     * @dev This is for DISCOVERY purposes only. Payments handled by this contract.
     * @param safe Safe wallet address
     * @param serviceId ACP service ID from Virtuals Protocol
     */
    function setACPServiceId(address safe, string calldata serviceId) external onlyExecutor {
        acpServiceIds[safe] = serviceId;
        emit ACPServiceIdSet(safe, serviceId);
    }
    
    /**
     * @notice Update token whitelist for a Safe
     * @param safe Safe wallet address
     * @param token Token address to whitelist/blacklist
     * @param enabled true to whitelist, false to blacklist
     */
    function setTokenWhitelist(
        address safe, 
        address token, 
        bool enabled
    ) external onlyExecutor {
        tokenWhitelist[safe][token] = enabled;
        emit TokenWhitelistUpdated(safe, token, enabled);
    }
    
    // ═══════════════════════════════════════════════════════
    // TRADING - SPOT (Uniswap V3)
    // ═══════════════════════════════════════════════════════
    
    /**
     * @notice Execute a SPOT trade (open position)
     * @param safe Safe wallet to trade from
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input token
     * @param minAmountOut Minimum acceptable output amount
     * @param poolFee Uniswap pool fee tier (500, 3000, or 10000)
     * @return amountOut Amount of output token received
     */
    function executeTrade(
        address safe,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24 poolFee
    ) external onlyExecutor returns (uint256 amountOut) {
        // Auto-initialize on first trade
        if (!safeStats[safe].initialized) {
            uint256 usdcBalance = IERC20(USDC).balanceOf(safe);
            safeStats[safe] = SafeStats({
                initialized: true,
                initialCapital: usdcBalance,
                totalTradesExecuted: 0,
                totalFeesCollected: 0,
                totalProfitsShared: 0
            });
            emit ModuleInitialized(safe, usdcBalance);
        }
        
        require(tokenWhitelist[safe][tokenOut] || tokenOut == USDC, "Token not whitelisted");
        require(tokenIn == USDC, "Only USDC as input");
        require(amountIn >= PLATFORM_FEE, "Amount too small for fee");
        
        // Collect platform fee FIRST
        _collectPlatformFee(safe);
        
        // Execute swap with amount AFTER fee
        uint256 swapAmount = amountIn - PLATFORM_FEE;
        
        // Approve tokenIn to Uniswap if needed
        _ensureTokenApproval(safe, tokenIn, UNISWAP_ROUTER);
        
        // Prepare swap parameters
        bytes memory swapData = abi.encodeWithSelector(
            IUniswapV3Router.exactInputSingle.selector,
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: poolFee,
                recipient: safe,
                deadline: block.timestamp,
                amountIn: swapAmount,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
        
        // Execute swap via Safe
        bool success = ISafe(safe).execTransactionFromModule(
            UNISWAP_ROUTER,
            0,
            swapData,
            0 // CALL operation
        );
        require(success, "Swap failed");
        
        // Get amount out
        amountOut = IERC20(tokenOut).balanceOf(safe);
        
        // Update stats
        safeStats[safe].totalTradesExecuted++;
        
        emit TradeExecuted(safe, tokenIn, tokenOut, swapAmount, amountOut);
        return amountOut;
    }
    
    /**
     * @notice Close a position with profit sharing
     * @param safe Safe wallet address
     * @param tokenIn Token to sell
     * @param amountIn Amount to sell
     * @param minAmountOut Minimum USDC to receive
     * @param poolFee Uniswap pool fee tier
     * @param agentCreator Address to receive profit share
     * @param entryValueUSDC Original USDC value when position was opened
     * @return amountOut USDC received from sale
     */
    function closePosition(
        address safe,
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24 poolFee,
        address agentCreator,
        uint256 entryValueUSDC
    ) external onlyExecutor returns (uint256 amountOut) {
        require(safeStats[safe].initialized, "Safe not initialized");
        require(agentCreator != address(0), "Invalid agent creator");
        
        // Approve token to Uniswap
        _ensureTokenApproval(safe, tokenIn, UNISWAP_ROUTER);
        
        // Track USDC balance before swap
        uint256 usdcBefore = IERC20(USDC).balanceOf(safe);
        
        // Execute swap (token → USDC)
        bytes memory swapData = abi.encodeWithSelector(
            IUniswapV3Router.exactInputSingle.selector,
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: USDC,
                fee: poolFee,
                recipient: safe,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
        
        bool success = ISafe(safe).execTransactionFromModule(
            UNISWAP_ROUTER,
            0,
            swapData,
            0
        );
        require(success, "Close swap failed");
        
        // Calculate actual USDC received
        uint256 usdcAfter = IERC20(USDC).balanceOf(safe);
        amountOut = usdcAfter - usdcBefore;
        
        // Calculate and distribute profit if profitable
        uint256 profitShare = 0;
        if (amountOut > entryValueUSDC) {
            uint256 profit = amountOut - entryValueUSDC;
            profitShare = (profit * PROFIT_SHARE_BPS) / 10000; // 20%
            
            require(profitShare <= profit, "Invalid profit share");
            
            if (profitShare > 0) {
                _distributeProfitShare(safe, agentCreator, profitShare);
                safeStats[safe].totalProfitsShared += profitShare;
            }
            
            emit PositionClosed(safe, tokenIn, amountIn, amountOut, profit, profitShare);
        }
        
        return amountOut;
    }
    
    /**
     * @notice Execute trade with Proof of Intent (gas-optimized)
     * @dev Adds ~3,000 gas to record intent on-chain before executing
     * @param safe Safe wallet to trade from
     * @param signalHash Hash of signal data (for verification)
     * @param creatorAddress Agent creator's address
     * @param tokenIn Input token address
     * @param tokenOut Output token address
     * @param amountIn Amount of input token
     * @param minAmountOut Minimum acceptable output amount
     * @param poolFee Uniswap pool fee tier
     * @return amountOut Amount of output token received
     */
    function executeTradeWithIntent(
        address safe,
        bytes32 signalHash,
        address creatorAddress,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24 poolFee
    ) external onlyExecutor returns (uint256 amountOut) {
        // 1. Record Proof of Intent on-chain (lightweight event)
        emit ProofOfIntent(signalHash, creatorAddress, block.timestamp);
        
        // 2. Execute trade (existing logic)
        return executeTrade(safe, tokenIn, tokenOut, amountIn, minAmountOut, poolFee);
    }
    
    /**
     * @notice Close position with Proof of Intent (gas-optimized)
     * @dev Adds ~3,000 gas to record intent on-chain before closing
     * @param safe Safe wallet address
     * @param signalHash Hash of signal data (for verification)
     * @param creatorAddress Agent creator's address
     * @param tokenIn Token to sell
     * @param amountIn Amount to sell
     * @param minAmountOut Minimum USDC to receive
     * @param poolFee Uniswap pool fee tier
     * @param agentCreator Address to receive profit share
     * @param entryValueUSDC Original USDC value when position was opened
     * @return amountOut USDC received from sale
     */
    function closePositionWithIntent(
        address safe,
        bytes32 signalHash,
        address creatorAddress,
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24 poolFee,
        address agentCreator,
        uint256 entryValueUSDC
    ) external onlyExecutor returns (uint256 amountOut) {
        // 1. Record Proof of Intent on-chain (lightweight event)
        emit ProofOfIntent(signalHash, creatorAddress, block.timestamp);
        
        // 2. Close position (existing logic)
        return closePosition(safe, tokenIn, amountIn, minAmountOut, poolFee, agentCreator, entryValueUSDC);
    }
    
    // ═══════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════
    
    /**
     * @notice Collect 0.2 USDC platform fee
     */
    function _collectPlatformFee(address safe) internal {
        bytes memory transferData = abi.encodeWithSelector(
            IERC20.transfer.selector,
            platformFeeReceiver,
            PLATFORM_FEE
        );
        
        bool success = ISafe(safe).execTransactionFromModule(
            USDC,
            0,
            transferData,
            0
        );
        require(success, "Fee collection failed");
        
        safeStats[safe].totalFeesCollected += PLATFORM_FEE;
        emit TradeFeeCollected(safe, PLATFORM_FEE, platformFeeReceiver);
    }
    
    /**
     * @notice Distribute profit share to agent creator
     */
    function _distributeProfitShare(
        address safe,
        address agentCreator,
        uint256 amount
    ) internal {
        bytes memory transferData = abi.encodeWithSelector(
            IERC20.transfer.selector,
            agentCreator,
            amount
        );
        
        bool success = ISafe(safe).execTransactionFromModule(
            USDC,
            0,
            transferData,
            0
        );
        require(success, "Profit share transfer failed");
        
        emit ProfitShareDistributed(safe, agentCreator, amount);
    }
    
    /**
     * @notice Ensure token is approved to spender
     */
    function _ensureTokenApproval(
        address safe,
        address token,
        address spender
    ) internal {
        uint256 currentAllowance = IERC20(token).allowance(safe, spender);
        
        if (currentAllowance < type(uint256).max / 2) {
            bytes memory approveData = abi.encodeWithSelector(
                IERC20.approve.selector,
                spender,
                type(uint256).max
            );
            
            ISafe(safe).execTransactionFromModule(
                token,
                0,
                approveData,
                0
            );
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════
    
    /**
     * @notice Update platform fee receiver
     */
    function setPlatformFeeReceiver(address newReceiver) external onlyModuleOwner {
        require(newReceiver != address(0), "Invalid address");
        platformFeeReceiver = newReceiver;
    }
    
    /**
     * @notice Get Safe stats
     */
    function getSafeStats(address safe) external view returns (
        bool initialized,
        uint256 initialCapital,
        uint256 totalTradesExecuted,
        uint256 totalFeesCollected,
        uint256 totalProfitsShared
    ) {
        SafeStats memory stats = safeStats[safe];
        return (
            stats.initialized,
            stats.initialCapital,
            stats.totalTradesExecuted,
            stats.totalFeesCollected,
            stats.totalProfitsShared
        );
    }
    
    /**
     * @notice Check if token is whitelisted for a Safe
     */
    function isTokenWhitelisted(address safe, address token) external view returns (bool) {
        return tokenWhitelist[safe][token] || token == USDC;
    }
}

