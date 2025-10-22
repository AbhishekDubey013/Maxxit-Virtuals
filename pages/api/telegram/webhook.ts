import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createTelegramBot, type TelegramUpdate } from '../../../lib/telegram-bot';
import { createCommandParser } from '../../../lib/telegram-command-parser';
import { TradeExecutor } from '../../../lib/trade-executor';

const prisma = new PrismaClient();
const bot = createTelegramBot();
const parser = createCommandParser();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update: TelegramUpdate = req.body;
    console.log('[Telegram] Received update:', JSON.stringify(update, null, 2));

    // Handle text message
    if (update.message?.text) {
      await handleTextMessage(update);
    }

    // Handle button callback
    if (update.callback_query) {
      await handleCallback(update);
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[Telegram] Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleTextMessage(update: TelegramUpdate) {
  const message = update.message!;
  const chatId = message.chat.id;
  const telegramUserId = message.from.id.toString();
  const text = message.text!;

  console.log('[Telegram] Processing message from', telegramUserId, ':', text);

  // Check if user is linked
  const telegramUser = await prisma.telegramUser.findUnique({
    where: { telegramUserId },
    include: {
      deployment: {
        include: {
          agent: true
        }
      }
    }
  });

  // Handle /link command
  if (text.startsWith('/link ')) {
    const code = text.split(' ')[1]?.toUpperCase();
    if (!code) {
      await bot.sendMessage(chatId, '❌ Please provide a link code: /link ABC123');
      return;
    }

    const result = await bot.linkUser(telegramUserId, code);
    if (result.success) {
      // Get the linked deployment to show agent details
      const deployment = await prisma.agentDeployment.findUnique({
        where: { id: result.deploymentId },
        include: { agent: true }
      });
      
      await bot.sendMessage(
        chatId, 
        `✅ Successfully linked to *${deployment?.agent.name}* (${deployment?.agent.venue})\n\n` +
        `You can now trade via Telegram:\n` +
        `• "Buy 5 USDC of ETH"\n` +
        `• "Status" - View positions\n` +
        `• "Close ETH" - Close position\n\n` +
        `💡 To switch agents, just use /link with a new code.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(chatId, `❌ ${result.error}`);
    }
    return;
  }

  // Check if user is linked for other commands
  if (!telegramUser) {
    await bot.sendMessage(
      chatId,
      '👋 Welcome to Maxxit!\n\nTo start trading, please link your Safe wallet:\n\n1. Go to your agent page on Maxxit\n2. Click "Connect Telegram"\n3. Send me the link code: /link ABC123'
    );
    return;
  }

  // Update last active
  await prisma.telegramUser.update({
    where: { id: telegramUser.id },
    data: { lastActiveAt: new Date() }
  });

  // Parse command
  const intent = await parser.parseCommand(text);
  console.log('[Telegram] Parsed intent:', JSON.stringify(intent, null, 2));

  // Handle different actions
  switch (intent.action) {
    case 'HELP':
      await bot.sendMessage(
        chatId,
        parser.formatConfirmation(intent),
        { parse_mode: 'Markdown' }
      );
      break;

    case 'STATUS':
      await handleStatusCommand(chatId, telegramUser.deploymentId);
      break;

    case 'BUY':
    case 'SELL':
      if (!intent.token || !intent.amount) {
        await bot.sendMessage(
          chatId,
          `❌ Please specify token and amount.\n\nExample: "Buy 10 USDC of WETH"`
        );
        return;
      }

      // Store trade intent and ask for confirmation
      const trade = await prisma.telegramTrade.create({
        data: {
          telegramUserId: telegramUser.id,
          deploymentId: telegramUser.deploymentId,
          messageId: message.message_id.toString(),
          command: text,
          parsedIntent: intent as any,
          status: 'pending',
        }
      });

      // Get wallet balance for confirmation message
      const { createSafeWallet } = await import('../../../lib/safe-wallet');
      const safeWallet = createSafeWallet(telegramUser.deployment.safeWallet, 42161);
      const balance = await safeWallet.getUSDCBalance();

      const confirmationMsg = parser.formatConfirmation(intent, balance);
      await bot.sendMessageWithButtons(
        chatId,
        confirmationMsg,
        [
          [
            { text: '✅ Confirm', callback_data: `confirm_${trade.id}` },
            { text: '❌ Cancel', callback_data: `cancel_${trade.id}` }
          ]
        ]
      );
      break;

    case 'CLOSE':
      await handleCloseCommand(chatId, telegramUser, intent.token);
      break;

    case 'UNKNOWN':
      await bot.sendMessage(
        chatId,
        `❓ I didn't understand that.\n\nTry:\n• "Buy 10 USDC of WETH"\n• "Close my WETH"\n• "Status"\n\nOr type "help" for more info.`
      );
      break;
  }
}

async function handleCallback(update: TelegramUpdate) {
  const callback = update.callback_query!;
  const chatId = callback.message.chat.id;
  const data = callback.data;

  console.log('[Telegram] Callback:', data);

  await bot.answerCallback(callback.id);

  if (data.startsWith('confirm_')) {
    const tradeId = data.replace('confirm_', '');
    await executeTrade(chatId, tradeId);
  } else if (data.startsWith('cancel_')) {
    const tradeId = data.replace('cancel_', '');
    await prisma.telegramTrade.update({
      where: { id: tradeId },
      data: { status: 'cancelled' }
    });
    await bot.sendMessage(chatId, '❌ Trade cancelled');
  }
}

async function executeTrade(chatId: number, tradeId: string) {
  try {
    await bot.sendMessage(chatId, '⏳ Executing trade...');

    // CRITICAL FIX: Use atomic update to prevent race condition
    // This ensures only ONE execution even if webhook is called multiple times
    let trade;
    try {
      trade = await prisma.telegramTrade.update({
        where: { 
          id: tradeId,
          status: 'pending' // Only update if still pending (atomic check-and-set)
        },
        data: {
          status: 'executing',
          confirmedAt: new Date(),
        },
        include: {
          deployment: {
            include: {
              agent: true
            }
          }
        }
      });
    } catch (error: any) {
      // If update fails, trade was already processed or doesn't exist
      if (error.code === 'P2025') { // Prisma: Record not found
        await bot.sendMessage(chatId, '❌ Trade already processed or not found');
        return;
      }
      throw error;
    }

    const intent = trade.parsedIntent as any;

    // Add unique suffix to tokenSymbol to bypass 6h constraint
    // Format: "WETH_MANUAL_1234567890"
    // The trade executor will strip this suffix when looking up token
    const uniqueTokenSymbol = `${intent.token}_MANUAL_${Date.now()}`;

    // Manual trades: Use actual USDC amounts directly (not percentage)
    // Auto trades: Use percentage of balance
    const sizeModel = {
      type: intent.amountType === 'USDC' ? 'fixed-usdc' : 'balance-percentage',
      value: intent.amount || 5, // Default to 5% if no amount specified
    };

    const signal = await prisma.signal.create({
      data: {
        agentId: trade.deployment.agentId,
        tokenSymbol: uniqueTokenSymbol, // Unique token symbol bypasses constraint
        venue: trade.deployment.agent.venue,
        side: intent.action === 'BUY' ? 'LONG' : 'SHORT',
        sizeModel,
        riskModel: {
          // NO fixed stop loss or take profit - using trailing stop only
          // Trailing stop is set automatically when position is created
        },
        sourceTweets: [`telegram_manual_${trade.id}_${Date.now()}`],
      }
    });

    // Execute via TradeExecutor with SPECIFIC deployment ID
    // This ensures the trade executes on the correct user's Safe, not the first deployment
    const executor = new TradeExecutor();
    const result = await executor.executeSignalForDeployment(signal.id, trade.deployment.id);

    if (result.success) {
      await prisma.telegramTrade.update({
        where: { id: tradeId },
        data: {
          status: 'executed',
          executedAt: new Date(),
          signalId: signal.id,
        }
      });

      // Update position source
      if (result.positionId) {
        await prisma.position.update({
          where: { id: result.positionId },
          data: {
            source: 'telegram',
            manualTradeId: tradeId,
          }
        });
      }

      await bot.sendMessage(
        chatId,
        `✅ Trade executed successfully!\n\n🔗 TX: https://arbiscan.io/tx/${result.txHash}\n\nType "status" to see your positions.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await prisma.telegramTrade.update({
        where: { id: tradeId },
        data: {
          status: 'failed',
          errorMessage: result.error || 'Unknown error',
        }
      });

      await bot.sendMessage(chatId, `❌ Trade failed: ${result.error || 'Unknown error'}`);
    }
  } catch (error: any) {
    console.error('[Telegram] Execute trade error:', error);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

async function handleStatusCommand(chatId: number, deploymentId: string) {
  try {
    const positions = await prisma.position.findMany({
      where: {
        deploymentId,
        source: 'telegram', // Only show manual positions
        closedAt: null,
      },
      include: {
        signal: true
      },
      orderBy: {
        openedAt: 'desc'
      }
    });

    if (positions.length === 0) {
      await bot.sendMessage(chatId, '📊 No open manual positions.\n\nStart trading: "Buy 10 USDC of WETH"');
      return;
    }

    let msg = `📊 *Your Manual Positions:*\n\n`;
    positions.forEach((pos, i) => {
      msg += `${i + 1}. ${pos.tokenSymbol} ${pos.side}\n`;
      msg += `   Qty: ${parseFloat(pos.qty.toString()).toFixed(4)}\n`;
      msg += `   Entry: $${parseFloat(pos.entryPrice.toString()).toFixed(2)}\n`;
      msg += `   TX: ${pos.entryTxHash?.slice(0, 10)}...\n\n`;
    });

    msg += `To close: "Close my WETH"`;

    await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  } catch (error: any) {
    console.error('[Telegram] Status command error:', error);
    await bot.sendMessage(chatId, `❌ Error fetching positions: ${error.message}`);
  }
}

async function handleCloseCommand(chatId: number, telegramUser: any, token?: string) {
  try {
    const positions = await prisma.position.findMany({
      where: {
        deploymentId: telegramUser.deploymentId,
        source: 'telegram',
        closedAt: null,
        ...(token && { tokenSymbol: token }),
      }
    });

    if (positions.length === 0) {
      await bot.sendMessage(chatId, `❌ No open ${token || ''} positions found.`);
      return;
    }

    await bot.sendMessage(chatId, `⏳ Closing ${positions.length} position(s)...`);

    const executor = new TradeExecutor();
    let successCount = 0;
    const errors: string[] = [];

    for (const position of positions) {
      const result = await executor.closePosition(position.id);
      if (result.success) {
        successCount++;
      } else {
        errors.push(`${position.tokenSymbol}: ${result.error || 'Unknown error'}`);
      }
    }

    let msg = `${successCount > 0 ? '✅' : '❌'} Closed ${successCount}/${positions.length} positions successfully!`;
    
    if (errors.length > 0) {
      msg += '\n\n❌ Errors:\n' + errors.map(e => `• ${e}`).join('\n');
    }

    await bot.sendMessage(chatId, msg);
  } catch (error: any) {
    console.error('[Telegram] Close command error:', error);
    await bot.sendMessage(chatId, `❌ Error closing positions: ${error.message}`);
  }
}


