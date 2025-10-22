-- CreateEnum
CREATE TYPE "venue_t" AS ENUM ('SPOT', 'GMX', 'HYPERLIQUID');

-- CreateEnum
CREATE TYPE "agent_status_t" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "bill_kind_t" AS ENUM ('SUBSCRIPTION', 'INFRA_FEE', 'PROFIT_SHARE');

-- CreateEnum
CREATE TYPE "bill_status_t" AS ENUM ('CHARGED', 'FAILED');

-- CreateTable
CREATE TABLE "ct_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "x_username" TEXT NOT NULL,
    "display_name" TEXT,
    "followers_count" INTEGER,
    "impact_factor" REAL NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "ct_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ct_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ct_account_id" UUID NOT NULL,
    "tweet_id" TEXT NOT NULL,
    "tweet_text" TEXT NOT NULL,
    "tweet_created_at" TIMESTAMPTZ(6) NOT NULL,
    "is_signal_candidate" BOOLEAN NOT NULL DEFAULT false,
    "extracted_tokens" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "ct_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creator_wallet" TEXT NOT NULL,
    "profit_receiver_address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venue" "venue_t" NOT NULL,
    "status" "agent_status_t" NOT NULL DEFAULT 'DRAFT',
    "weights" SMALLINT[],
    "authorization_signature" TEXT,
    "authorization_message" JSONB,
    "apr_30d" REAL,
    "apr_90d" REAL,
    "apr_si" REAL,
    "sharpe_30d" REAL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_deployments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "user_wallet" TEXT NOT NULL,
    "safe_wallet" TEXT NOT NULL,
    "module_address" TEXT,
    "module_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "agent_status_t" NOT NULL DEFAULT 'ACTIVE',
    "sub_active" BOOLEAN NOT NULL DEFAULT true,
    "sub_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_ends_at" TIMESTAMPTZ(6),
    "next_billing_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "ct_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_indicators_6h" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_symbol" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "indicators" JSONB NOT NULL,

    CONSTRAINT "market_indicators_6h_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "venue" "venue_t" NOT NULL,
    "side" TEXT NOT NULL,
    "size_model" JSONB NOT NULL,
    "risk_model" JSONB NOT NULL,
    "source_tweets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "skipped_reason" TEXT,
    "signal_hash" TEXT,
    "creator_address" TEXT,
    "proof_of_intent_tx_hash" TEXT,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "deployment_id" UUID NOT NULL,
    "signal_id" UUID NOT NULL,
    "venue" "venue_t" NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" DECIMAL(20,8) NOT NULL,
    "entry_price" DECIMAL(20,8) NOT NULL,
    "entry_tx_hash" TEXT,
    "stop_loss" DECIMAL(20,8),
    "take_profit" DECIMAL(20,8),
    "trailing_params" JSONB,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "exit_price" DECIMAL(20,8),
    "exit_tx_hash" TEXT,
    "pnl" DECIMAL(20,8),
    "source" TEXT NOT NULL DEFAULT 'auto',
    "manual_trade_id" UUID,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telegram_user_id" TEXT NOT NULL,
    "telegram_username" TEXT,
    "first_name" TEXT,
    "deployment_id" UUID NOT NULL,
    "link_code" TEXT,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "telegram_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_trades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telegram_user_id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "parsed_intent" JSONB NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMPTZ(6),
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "executed_at" TIMESTAMPTZ(6),
    "signal_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "position_id" UUID,
    "deployment_id" UUID NOT NULL,
    "kind" "bill_kind_t" NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'USDC',
    "status" "bill_status_t" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pnl_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "pnl" DECIMAL(20,8),
    "return_pct" REAL,

    CONSTRAINT "pnl_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_factor_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ct_account_id" UUID NOT NULL,
    "signal_id" UUID,
    "position_id" UUID,
    "pnl_contribution" DECIMAL(20,8),
    "weight" REAL,
    "model_version" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agent_id" UUID,

    CONSTRAINT "impact_factor_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue" "venue_t" NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "min_size" DECIMAL(20,8),
    "tick_size" DECIMAL(20,8),
    "slippage_limit_bps" INTEGER,

    CONSTRAINT "venues_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_registry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chain" TEXT NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "token_address" TEXT NOT NULL,
    "preferred_router" TEXT,

    CONSTRAINT "token_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_name" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" UUID,
    "payload" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trace_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ct_accounts_x_username_key" ON "ct_accounts"("x_username");

-- CreateIndex
CREATE UNIQUE INDEX "ct_posts_tweet_id_key" ON "ct_posts"("tweet_id");

-- CreateIndex
CREATE INDEX "ct_posts_ct_account_id_idx" ON "ct_posts"("ct_account_id");

-- CreateIndex
CREATE INDEX "agents_status_venue_idx" ON "agents"("status", "venue");

-- CreateIndex
CREATE INDEX "agent_deployments_agent_id_idx" ON "agent_deployments"("agent_id");

-- CreateIndex
CREATE INDEX "agent_deployments_user_wallet_idx" ON "agent_deployments"("user_wallet");

-- CreateIndex
CREATE UNIQUE INDEX "agent_deployments_user_wallet_agent_id_key" ON "agent_deployments"("user_wallet", "agent_id");

-- CreateIndex
CREATE INDEX "agent_accounts_agent_id_idx" ON "agent_accounts"("agent_id");

-- CreateIndex
CREATE INDEX "agent_accounts_ct_account_id_idx" ON "agent_accounts"("ct_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_accounts_agent_id_ct_account_id_key" ON "agent_accounts"("agent_id", "ct_account_id");

-- CreateIndex
CREATE INDEX "market_indicators_6h_token_symbol_idx" ON "market_indicators_6h"("token_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "market_indicators_6h_token_symbol_window_start_key" ON "market_indicators_6h"("token_symbol", "window_start");

-- CreateIndex
CREATE INDEX "signals_agent_id_created_at_idx" ON "signals"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "positions_deployment_id_opened_at_idx" ON "positions"("deployment_id", "opened_at");

-- CreateIndex
CREATE INDEX "positions_signal_id_idx" ON "positions"("signal_id");

-- CreateIndex
CREATE INDEX "positions_source_idx" ON "positions"("source");

-- CreateIndex
CREATE UNIQUE INDEX "positions_deployment_id_signal_id_key" ON "positions"("deployment_id", "signal_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_users_telegram_user_id_key" ON "telegram_users"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_users_link_code_key" ON "telegram_users"("link_code");

-- CreateIndex
CREATE INDEX "telegram_users_deployment_id_idx" ON "telegram_users"("deployment_id");

-- CreateIndex
CREATE INDEX "telegram_trades_telegram_user_id_idx" ON "telegram_trades"("telegram_user_id");

-- CreateIndex
CREATE INDEX "telegram_trades_deployment_id_idx" ON "telegram_trades"("deployment_id");

-- CreateIndex
CREATE INDEX "telegram_trades_status_idx" ON "telegram_trades"("status");

-- CreateIndex
CREATE INDEX "billing_events_deployment_id_occurred_at_idx" ON "billing_events"("deployment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "billing_events_kind_occurred_at_idx" ON "billing_events"("kind", "occurred_at");

-- CreateIndex
CREATE INDEX "pnl_snapshots_agent_id_day_idx" ON "pnl_snapshots"("agent_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "pnl_snapshots_deployment_id_day_key" ON "pnl_snapshots"("deployment_id", "day");

-- CreateIndex
CREATE INDEX "impact_factor_history_ct_account_id_occurred_at_idx" ON "impact_factor_history"("ct_account_id", "occurred_at");

-- CreateIndex
CREATE INDEX "venues_status_venue_token_symbol_idx" ON "venues_status"("venue", "token_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "venues_status_venue_token_symbol_key" ON "venues_status"("venue", "token_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "token_registry_chain_token_symbol_key" ON "token_registry"("chain", "token_symbol");

-- CreateIndex
CREATE INDEX "audit_logs_event_name_occurred_at_idx" ON "audit_logs"("event_name", "occurred_at");

-- AddForeignKey
ALTER TABLE "ct_posts" ADD CONSTRAINT "ct_posts_ct_account_id_fkey" FOREIGN KEY ("ct_account_id") REFERENCES "ct_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_accounts" ADD CONSTRAINT "agent_accounts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_accounts" ADD CONSTRAINT "agent_accounts_ct_account_id_fkey" FOREIGN KEY ("ct_account_id") REFERENCES "ct_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_manual_trade_id_fkey" FOREIGN KEY ("manual_trade_id") REFERENCES "telegram_trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_users" ADD CONSTRAINT "telegram_users_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_trades" ADD CONSTRAINT "telegram_trades_telegram_user_id_fkey" FOREIGN KEY ("telegram_user_id") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_trades" ADD CONSTRAINT "telegram_trades_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pnl_snapshots" ADD CONSTRAINT "pnl_snapshots_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pnl_snapshots" ADD CONSTRAINT "pnl_snapshots_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "agent_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_factor_history" ADD CONSTRAINT "impact_factor_history_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_factor_history" ADD CONSTRAINT "impact_factor_history_ct_account_id_fkey" FOREIGN KEY ("ct_account_id") REFERENCES "ct_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_factor_history" ADD CONSTRAINT "impact_factor_history_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_factor_history" ADD CONSTRAINT "impact_factor_history_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
