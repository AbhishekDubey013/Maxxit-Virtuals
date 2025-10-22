import type { NextApiRequest, NextApiResponse} from 'next';
import { PrismaClient } from '@prisma/client';
import { TradeExecutor } from '../../../lib/trade-executor';

const prisma = new PrismaClient();

/**
 * Admin endpoint to execute a trade for a given signal
 * 
 * Flow:
 * 1. Find ACTIVE deployments for the signal's agent
 * 2. Compute position size from sizeModel
 * 3. Enforce venue constraints (min_size, slippage)
 * 4. Call venue adapter stub
 * 5. Insert position (OPEN status)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { signalId } = req.query;

    if (!signalId || typeof signalId !== 'string') {
      return res.status(400).json({ error: 'signalId query param required' });
    }

    console.log(`[ADMIN] Executing trade for signal ${signalId}`);

    // Get signal
    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
    });

    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }

    // Check total active deployments (for logging)
    const allDeployments = await prisma.agentDeployment.findMany({
      where: {
        agentId: signal.agentId,
        status: 'ACTIVE',
        subActive: true,
      },
    });

    // Find ACTIVE deployments for this agent with module enabled
    const deployments = await prisma.agentDeployment.findMany({
      where: {
        agentId: signal.agentId,
        status: 'ACTIVE',
        subActive: true,
        moduleEnabled: true, // CRITICAL: Only execute on deployments with module enabled
      },
    });

    console.log(`[TRADE] Found ${allDeployments.length} total active deployments, ${deployments.length} with module enabled`);

    if (deployments.length === 0) {
      const message = allDeployments.length === 0
        ? 'No active deployments found for this agent'
        : `${allDeployments.length} active deployments found, but module is not enabled on any. Users must enable the trading module on their Safe first.`;
      
      return res.status(200).json({
        success: false,
        error: message,
        positionsCreated: 0,
      });
    }

    // Check venue status for min size/slippage
    const venueStatus = await prisma.venueStatus.findUnique({
      where: {
        venue_tokenSymbol: {
          venue: signal.venue,
          tokenSymbol: signal.tokenSymbol,
        },
      },
    });

    const sizeModel: any = signal.sizeModel;
    const qty = sizeModel.baseSize || 100;

    // Check min size constraint
    if (venueStatus?.minSize && parseFloat(qty.toString()) < parseFloat(venueStatus.minSize.toString())) {
      return res.status(400).json({
        error: 'Position size below venue minimum',
      });
    }

    const positionsCreated = [];
    const errors = [];
    const executor = new TradeExecutor();

    for (const deployment of deployments) {
      // Check for duplicate position (same deployment + signal)
      const existing = await prisma.position.findUnique({
        where: {
          deploymentId_signalId: {
            deploymentId: deployment.id,
            signalId: signal.id,
          },
        },
      });

      if (existing) {
        console.log(`[TRADE] Position already exists for deployment ${deployment.id}`);
        continue;
      }

      // Execute REAL on-chain trade via TradeExecutor for SPECIFIC deployment
      console.log(`[TRADE] Executing real trade for deployment ${deployment.id} (Safe: ${deployment.safeWallet})`);
      const result = await executor.executeSignalForDeployment(signal.id, deployment.id);

      if (result.success && result.positionId) {
        console.log(`[TRADE] ✅ Trade executed on-chain! Position: ${result.positionId}, TX: ${result.txHash}`);
        
        // Get the created position
        const position = await prisma.position.findUnique({
          where: { id: result.positionId }
        });
        
        if (position) {
          positionsCreated.push(position);
        }
      } else {
        const errorMsg = result.error || result.reason || 'Unknown error';
        console.error(`[TRADE] ❌ Trade execution failed for deployment ${deployment.id}:`, errorMsg);
        console.error(`[TRADE] Full result:`, JSON.stringify(result, null, 2));
        errors.push({
          deploymentId: deployment.id,
          error: errorMsg,
          reason: result.reason,
          summary: result.executionSummary,
        });
      }
    }

    // Return detailed response with errors
    const success = positionsCreated.length > 0;
    return res.status(success ? 200 : 400).json({
      success,
      message: success 
        ? `Trade execution completed. ${positionsCreated.length} positions created.`
        : `Trade execution failed. ${errors.length} errors occurred.`,
      positionsCreated: positionsCreated.length,
      positions: positionsCreated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[ADMIN] Trade execution error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: error.message || 'Internal server error' 
    });
  }
}
