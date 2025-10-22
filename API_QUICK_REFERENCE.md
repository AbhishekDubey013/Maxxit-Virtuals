# API Quick Reference 🚀

**Complete API guide for the Maxxit trading system**

---

## 📡 Base URL

```
http://localhost:5000
```

---

## 🔍 System Health

### Check Server Health
```bash
GET /api/health
```

**Response:**
```json
{ "status": "ok" }
```

---

## 💰 Safe Wallet

### Check Safe Wallet Status
```bash
GET /api/safe/status?safeAddress={address}&chainId={chain}
```

**Parameters:**
- `safeAddress` (required): Safe wallet address (0x...)
- `chainId` (optional): 42161 (Arbitrum) or 8453 (Base), default: 42161

**Example:**
```bash
curl "http://localhost:5000/api/safe/status?safeAddress=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb&chainId=42161"
```

**Response:**
```json
{
  "valid": true,
  "safe": {
    "address": "0x742d35...",
    "chainId": 42161,
    "chainName": "Arbitrum",
    "owners": ["0xowner1..."],
    "threshold": 2,
    "nonce": 5
  },
  "balances": {
    "usdc": { "amount": 1000.0, "formatted": "1000.00 USDC" },
    "eth": { "amount": 0.05, "formatted": "0.0500 ETH" }
  },
  "readiness": {
    "hasUSDC": true,
    "hasETH": true,
    "ready": true,
    "status": "READY",
    "warnings": []
  }
}
```

---

## 🤖 Agent Management

### Get All Agents
```bash
GET /api/agents
```

**Example:**
```bash
curl "http://localhost:5000/api/agents"
```

**Response:**
```json
[
  {
    "id": "ca6a0073-091d-4164-bbe4-dda5c178ed04",
    "name": "GMX Momentum Bot",
    "venue": "GMX",
    "status": "ACTIVE",
    "creatorWallet": "0x742d35..."
  }
]
```

### Get Agent by ID
```bash
GET /api/agents/{id}
```

---

## 🚀 Deployments

### Deploy Agent with Safe Wallet
```bash
POST /api/deployments/create
Content-Type: application/json

{
  "agentId": "ca6a0073-091d-4164-bbe4-dda5c178ed04",
  "userWallet": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "safeWallet": "0x1234567890123456789012345678901234567890"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/deployments/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "ca6a0073-091d-4164-bbe4-dda5c178ed04",
    "userWallet": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "safeWallet": "0x1234567890123456789012345678901234567890"
  }'
```

**Response:**
```json
{
  "success": true,
  "deployment": {
    "id": "deployment-uuid",
    "agentId": "ca6a0073...",
    "agentName": "GMX Momentum Bot",
    "venue": "GMX",
    "userWallet": "0x742d35...",
    "safeWallet": "0x123456...",
    "status": "ACTIVE"
  },
  "safeInfo": {
    "address": "0x123456...",
    "owners": ["0xowner1..."],
    "threshold": 2,
    "balances": {
      "usdc": 1000.0,
      "eth": 0.05
    }
  }
}
```

---

## 📊 CT Accounts (Crypto Twitter)

### Get All CT Accounts
```bash
GET /api/ct-accounts
```

**Example:**
```bash
curl "http://localhost:5000/api/ct-accounts"
```

**Response:**
```json
[
  {
    "id": "2e1befda-4ee2-4267-929b-90a3eb4667b2",
    "handle": "AltcoinGordon",
    "userId": "Abhishe42402615",
    "impactFactor": 1.2,
    "isActive": true
  }
]
```

---

## 📝 Tweet Management

### Ingest Tweets (Manual Trigger)
```bash
GET /api/admin/ingest-tweets
```

**Example:**
```bash
curl "http://localhost:5000/api/admin/ingest-tweets"
```

**Response:**
```json
{
  "success": true,
  "accountsProcessed": 7,
  "totalTweets": 251,
  "message": "Tweet ingestion completed"
}
```

### Classify All Tweets
```bash
POST /api/admin/classify-all-tweets
```

**Example:**
```bash
curl -X POST "http://localhost:5000/api/admin/classify-all-tweets"
```

---

## 📈 Signal Management

### Generate Signals for CT Account
```bash
POST /api/admin/generate-signals-simple?ctAccountId={id}
```

**Example:**
```bash
curl -X POST "http://localhost:5000/api/admin/generate-signals-simple?ctAccountId=2e1befda-4ee2-4267-929b-90a3eb4667b2"
```

**Response:**
```json
{
  "success": true,
  "tweetsProcessed": 5,
  "signalsCreated": 3,
  "signals": [
    {
      "signalId": "b927b15b-c9c5-46da-8857-ae1a0528eb3c",
      "agent": "GMX Momentum Bot",
      "venue": "GMX",
      "token": "SUI",
      "side": "LONG",
      "confidence": 0.60,
      "leverage": 3,
      "stopLoss": "4%",
      "takeProfit": "12%"
    }
  ]
}
```

### Get All Signals
```bash
GET /api/db/signals?_limit={limit}&_sort=-createdAt
```

**Example:**
```bash
curl "http://localhost:5000/api/db/signals?_limit=10&_sort=-createdAt"
```

---

## ⚡ Trade Execution

### Execute Trade from Signal
```bash
POST /api/admin/execute-trade
Content-Type: application/json

{
  "signalId": "b927b15b-c9c5-46da-8857-ae1a0528eb3c"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/admin/execute-trade \
  -H "Content-Type: application/json" \
  -d '{"signalId": "b927b15b-c9c5-46da-8857-ae1a0528eb3c"}'
```

**Response (Success):**
```json
{
  "success": true,
  "txHash": "0xabc123...",
  "positionId": "pos-uuid-789",
  "message": "Trade executed successfully"
}
```

**Response (Cannot Execute - Validation):**
```json
{
  "success": false,
  "error": "Cannot execute GMX trade",
  "reason": "Insufficient ETH for execution fees",
  "executionSummary": {
    "canExecute": false,
    "usdcBalance": 1000.0,
    "collateralRequired": 50.0,
    "positionSize": 250.0
  }
}
```

---

## 🗄️ Database Queries

### Generic Database Query
```bash
GET /api/db/{table}?{filters}
```

**Common Filters:**
- `_limit` - Limit results (default: 100)
- `_offset` - Skip N results
- `_sort` - Sort by field (prefix with `-` for desc)
- Any field name for filtering

**Examples:**

#### Get Latest Signals
```bash
curl "http://localhost:5000/api/db/signals?_limit=5&_sort=-createdAt"
```

#### Get Signals for Specific Agent
```bash
curl "http://localhost:5000/api/db/signals?agentId=ca6a0073-091d-4164-bbe4-dda5c178ed04"
```

#### Get Token Registry
```bash
curl "http://localhost:5000/api/db/token_registry?chain=arbitrum"
```

#### Get Venue Status for GMX
```bash
curl "http://localhost:5000/api/db/venue_status?venue=GMX"
```

#### Get CT Posts (Tweets)
```bash
curl "http://localhost:5000/api/db/ct_posts?isSignalCandidate=true&_limit=10"
```

---

## 📋 Available Tables

| Table | Description |
|-------|-------------|
| `ct_accounts` | Crypto Twitter accounts being tracked |
| `ct_posts` | Tweets from CT accounts |
| `agents` | Trading agents |
| `agent_accounts` | Links between agents and CT accounts |
| `agent_deployments` | User deployments of agents |
| `signals` | Generated trading signals |
| `positions` | Open/closed trading positions |
| `market_indicators_6h` | Market data (RSI, MACD, etc.) |
| `token_registry` | Token addresses by chain |
| `venue_status` | Token availability by venue |
| `billing_events` | Subscription events |
| `pnl_snapshots` | Daily P&L tracking |

---

## 🔄 Complete Workflow Example

### 1. Check Safe Wallet
```bash
curl "http://localhost:5000/api/safe/status?safeAddress=YOUR_SAFE&chainId=42161"
```

### 2. Deploy Agent
```bash
curl -X POST http://localhost:5000/api/deployments/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "ca6a0073-091d-4164-bbe4-dda5c178ed04",
    "userWallet": "YOUR_WALLET",
    "safeWallet": "YOUR_SAFE"
  }'
```

### 3. Wait for Tweets (or trigger manually)
```bash
# Manual trigger
curl "http://localhost:5000/api/admin/ingest-tweets"

# Or wait for auto-ingest (every 6 hours)
```

### 4. Classify Tweets
```bash
curl -X POST "http://localhost:5000/api/admin/classify-all-tweets"
```

### 5. Generate Signals
```bash
curl -X POST "http://localhost:5000/api/admin/generate-signals-simple?ctAccountId=2e1befda-4ee2-4267-929b-90a3eb4667b2"
```

### 6. View Signals
```bash
curl "http://localhost:5000/api/db/signals?_limit=5&_sort=-createdAt" | jq
```

### 7. Execute Trade
```bash
curl -X POST http://localhost:5000/api/admin/execute-trade \
  -H "Content-Type: application/json" \
  -d '{"signalId": "SIGNAL_ID_FROM_STEP_6"}'
```

---

## 🧪 Testing Commands

### Run Full Test Suite
```bash
bash scripts/test-execution-flow.sh
```

### Check Daemon Status
```bash
bash scripts/daemon-control.sh status
```

### View Logs
```bash
# Auto-ingest logs
tail -f logs/auto-ingest.log

# Twitter proxy logs
tail -f twitter-proxy.log

# Next.js logs
# (shown in terminal where you ran npm run dev)
```

---

## 📊 Useful Queries

### Find Signal Candidate Tweets
```bash
curl "http://localhost:5000/api/db/ct_posts?isSignalCandidate=true&_limit=20" | jq '.[] | {tweet: .tweetText, tokens: .extractedTokens, sentiment}'
```

### Check Market Indicators
```bash
curl "http://localhost:5000/api/db/market_indicators_6h" | jq '.[] | {token: .tokenSymbol, rsi: .indicators.rsi, price: .indicators.price}'
```

### View Recent Signals with Details
```bash
curl "http://localhost:5000/api/db/signals?_limit=5&_sort=-createdAt" | jq '.[] | {
  token: .tokenSymbol,
  venue,
  side,
  leverage: .sizeModel.leverage,
  confidence: .sizeModel.confidence,
  sl: .riskModel.stopLoss.value,
  tp: .riskModel.takeProfit.value
}'
```

### Get Tokens Available on Venue
```bash
# GMX tokens
curl "http://localhost:5000/api/db/venue_status?venue=GMX" | jq '.[].tokenSymbol'

# Hyperliquid tokens
curl "http://localhost:5000/api/db/venue_status?venue=HYPERLIQUID" | jq '.[].tokenSymbol'

# SPOT tokens
curl "http://localhost:5000/api/db/venue_status?venue=SPOT" | jq '.[].tokenSymbol'
```

---

## 🔐 Environment Variables

Required in `.env`:

```bash
# Database
DATABASE_URL="postgresql://..."

# GAME API (X/Twitter)
GAME_API_KEY="your-key"

# LLM (for classification)
OPENAI_API_KEY="sk-..."
# or
ANTHROPIC_API_KEY="sk-ant-..."
# or
PERPLEXITY_API_KEY="pplx-..."

# RPC URLs (for execution)
ARBITRUM_RPC_URL="https://arb1.arbitrum.io/rpc"
BASE_RPC_URL="https://mainnet.base.org"
```

---

## 📚 Documentation Files

- `EXECUTION_LAYER_COMPLETE.md` - Complete technical documentation
- `TOKEN_REGISTRY_SETUP.md` - Token and venue configuration
- `SAFE_WALLET_INTEGRATION_READY.md` - Safe wallet integration guide
- `API_QUICK_REFERENCE.md` - This file

---

## 🆘 Troubleshooting

### Server not responding
```bash
# Check if server is running
curl http://localhost:5000/api/health

# If not, start it
npm run dev
```

### No signals generated
```bash
# 1. Check if tweets are ingested
curl "http://localhost:5000/api/db/ct_posts?_limit=1"

# 2. Check if tweets are classified
curl "http://localhost:5000/api/db/ct_posts?isSignalCandidate=true&_limit=1"

# 3. Try generating signals
curl -X POST "http://localhost:5000/api/admin/generate-signals-simple?ctAccountId=2e1befda-4ee2-4267-929b-90a3eb4667b2"
```

### Safe wallet validation fails
```bash
# Check Safe wallet status
curl "http://localhost:5000/api/safe/status?safeAddress=YOUR_SAFE&chainId=42161"

# Make sure:
# 1. Address is valid
# 2. Safe exists on-chain
# 3. ChainId is correct (42161=Arbitrum, 8453=Base)
```

---

✅ **API Reference Complete!** Use these endpoints to interact with the trading system.
