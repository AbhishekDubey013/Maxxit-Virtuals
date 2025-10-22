import type { NextApiRequest, NextApiResponse } from 'next';
import { createACPService, isACPEnabled } from '@/lib/acp-service';

/**
 * POST /api/acp/approve-usdc
 * Generate USDC approval transaction for ACP
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!isACPEnabled()) {
      return res.status(503).json({ 
        error: 'ACP is not enabled. Please configure ACP_CONTRACT_ADDRESS in environment variables.' 
      });
    }

    const { userWallet, amount } = req.body;

    if (!userWallet || !amount) {
      return res.status(400).json({ error: 'userWallet and amount are required' });
    }

    // Generate approval transaction
    const acpService = createACPService();
    const tx = await acpService.generateApprovalTx(userWallet, amount);

    return res.status(200).json({
      success: true,
      transaction: tx,
      message: 'Please sign this transaction to approve USDC spending',
    });
  } catch (error: any) {
    console.error('[API /acp/approve-usdc] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

