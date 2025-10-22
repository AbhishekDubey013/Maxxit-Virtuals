/**
 * Position Monitoring Worker
 * Monitors open positions and closes them at stop-loss or take-profit
 * Schedule: Every 5 minutes
 */

import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

// Price feeds (you can integrate Chainlink or use DEX prices)
async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    // TODO: Integrate real price feeds (Chainlink, CoinGecko, etc.)
    // For now, using a mock implementation
    
    // Mock prices for testing
    const mockPrices: Record<string, number> = {
      'BTC': 43000,
      'ETH': 2300,
      'SOL': 95,
      'ARB': 1.20,
      'OP': 2.10,
    };

    return mockPrices[symbol] || null;
  } catch (error) {
    console.error(`[PriceOracle] Failed to fetch price for ${symbol}:`, error);
    return null;
  }
}

export async function monitorPositions() {
  console.log('[PositionMonitor] Starting position monitoring...');

  try {
    // Fetch all open positions (closedAt is null = still open)
    const openPositions = await prisma.position.findMany({
      where: {
        closedAt: null,
      },
      include: {
        signal: {
          select: {
            tokenSymbol: true,
            side: true,
          },
        },
        deployment: {
          include: {
            agent: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    console.log(`[PositionMonitor] Monitoring ${openPositions.length} open positions`);

    let closedCount = 0;

    // Check each position
    for (const position of openPositions) {
      try {
        const symbol = position.tokenSymbol; // Use tokenSymbol from position
        const side = position.signal.side;
        const entryPrice = parseFloat(position.entryPrice?.toString() || '0');
        const stopLoss = position.stopLoss ? parseFloat(position.stopLoss.toString()) : null;
        const takeProfit = position.takeProfit ? parseFloat(position.takeProfit.toString()) : null;

        // Get current price
        const currentPrice = await getCurrentPrice(symbol);
        if (!currentPrice) {
          console.log(`[PositionMonitor] No price available for ${symbol}, skipping`);
          continue;
        }

        // Calculate P&L
        const pnlPercentage = side === 'LONG'
          ? ((currentPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - currentPrice) / entryPrice) * 100;

        const size = parseFloat(position.size?.toString() || '0');
        const pnlUSDC = (pnlPercentage / 100) * size;

        console.log(`[PositionMonitor] ${symbol} ${side}: Entry=$${entryPrice}, Current=$${currentPrice}, P&L=${pnlPercentage.toFixed(2)}%`);

        // Check stop-loss
        let shouldClose = false;
        let closeReason = '';

        if (side === 'LONG') {
          if (stopLoss && currentPrice <= stopLoss) {
            shouldClose = true;
            closeReason = 'STOP_LOSS';
          } else if (takeProfit && currentPrice >= takeProfit) {
            shouldClose = true;
            closeReason = 'TAKE_PROFIT';
          }
        } else { // SHORT
          if (stopLoss && currentPrice >= stopLoss) {
            shouldClose = true;
            closeReason = 'STOP_LOSS';
          } else if (takeProfit && currentPrice <= takeProfit) {
            shouldClose = true;
            closeReason = 'TAKE_PROFIT';
          }
        }

        // Close position if triggered
        if (shouldClose) {
          console.log(`[PositionMonitor] 🔴 Closing position ${position.id}: ${closeReason}`);

          // Call the close position API
          const apiBaseUrl = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
          const response = await fetch(
            `${apiBaseUrl}/api/admin/close-trade-simulated?positionId=${position.id}&pnl=${pnlUSDC.toFixed(2)}`,
            { method: 'POST' }
          );

          if (response.ok) {
            closedCount++;
            console.log(`[PositionMonitor] ✅ Position ${position.id} closed: P&L=$${pnlUSDC.toFixed(2)} (${closeReason})`);
          } else {
            console.error(`[PositionMonitor] ❌ Failed to close position ${position.id}:`, await response.text());
          }
        } else {
          // Position still open - continue monitoring
          // Note: currentPrice and unrealizedPnl are not in Position schema
          // They can be calculated on-demand in the dashboard
        }

        // Small delay between checks
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[PositionMonitor] Error monitoring position ${position.id}:`, error);
      }
    }

    console.log(`[PositionMonitor] Complete! Closed ${closedCount} positions`);
    return { success: true, monitored: openPositions.length, closed: closedCount };
  } catch (error: any) {
    console.error('[PositionMonitor] Fatal error:', error);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Auto-run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  monitorPositions()
    .then(result => {
      console.log('[PositionMonitor] Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[PositionMonitor] Fatal error:', error);
      process.exit(1);
    });
}

