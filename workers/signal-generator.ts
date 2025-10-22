/**
 * Signal Generation Worker
 * Runs automatically to generate signals from classified tweets
 * Schedule: Every 6 hours (after tweet classification)
 */

import { PrismaClient } from '@prisma/client';
import { syncAllDeployments } from '../lib/sync-deployments';

const prisma = new PrismaClient();

export async function generateSignals() {
  console.log('[SignalWorker] Starting signal generation...');
  
  // Sync deployments with on-chain status first
  try {
    await syncAllDeployments();
  } catch (error) {
    console.warn('[SignalWorker] Warning: Failed to sync deployments:', error);
  }

  try {
    // Fetch all active agents with their subscribed CT accounts
    const agents = await prisma.agent.findMany({
      where: {
        status: 'ACTIVE',
        deployments: {
          some: {
            status: 'ACTIVE',
          },
        },
      },
      include: {
        agentAccounts: {
          include: {
            ctAccount: true,
          },
        },
      },
    });

    console.log(`[SignalWorker] Found ${agents.length} active deployed agents`);

    let totalSignalsGenerated = 0;

    // Process each agent
    for (const agent of agents) {
      try {
        // Get subscribed CT account IDs
        const ctAccountIds = agent.agentAccounts.map(aa => aa.ctAccountId);

        if (ctAccountIds.length === 0) {
          console.log(`[SignalWorker] Agent ${agent.id} has no CT account subscriptions, skipping`);
          continue;
        }

        // Call the signal generation API for this agent
        const apiBaseUrl = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiBaseUrl}/api/admin/run-signal-once?agentId=${agent.id}`, {
          method: 'POST',
        });

        if (response.ok) {
          const result = await response.json();
          const signalsCount = result.signalsCreated?.length || 0;
          totalSignalsGenerated += signalsCount;
          console.log(`[SignalWorker] Agent ${agent.name}: Generated ${signalsCount} signals`);
        } else {
          console.error(`[SignalWorker] Failed to generate signals for agent ${agent.id}:`, await response.text());
        }
      } catch (error) {
        console.error(`[SignalWorker] Error processing agent ${agent.id}:`, error);
      }
    }

    console.log(`[SignalWorker] Complete! Total signals generated: ${totalSignalsGenerated}`);
    return { success: true, signalsGenerated: totalSignalsGenerated };
  } catch (error: any) {
    console.error('[SignalWorker] Fatal error:', error);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect();
  }
}

// Auto-run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  generateSignals()
    .then(result => {
      console.log('[SignalWorker] Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[SignalWorker] Fatal error:', error);
      process.exit(1);
    });
}

