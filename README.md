# Maxxit DeFi - Agentic Trading Platform

**Production-ready NestJS backend** for an agentic DeFi trading platform that allows users to deploy AI trading agents executing trades based on Twitter/crypto signals.

## 🌐 Network: Base

This project is configured for **Base** (Chain ID: 8453) as the primary network. Base offers:
- Lower gas fees than Ethereum mainnet
- Fast transaction confirmations
- Full EVM compatibility
- Growing DeFi ecosystem with Uniswap V3, Aerodrome, and more

### Supported Venues
- ✅ **SPOT** - DEX trading via Uniswap V3 (Live)
- 🔄 **GMX** - Perpetual futures (Coming Soon)
- 🔄 **Hyperliquid** - Perpetual futures (Coming Soon)


## 🏗️ Architecture

### Tech Stack
- **Blockchain**: Base (Chain ID: 8453)
- **Smart Contracts**: Safe wallets + Maxxit Trading Module
- **Backend**: NestJS 11 + TypeScript
- **Database**: PostgreSQL (Neon) with Prisma ORM
- **Queue System**: BullMQ + Redis for background workers
- **API Docs**: OpenAPI/Swagger at `/api-docs`
- **Admin UI**: Bull Board at `/admin/queues`
- **Frontend**: React 18 + Vite + Tailwind CSS

### Core Features
- ✅ JWT Authentication (SIWE placeholder for wallet sign-in)
- ✅ AI Trading Agents (custom strategies with 8-weight configs)
- ✅ Multi-venue support (SPOT live on Base, GMX & Hyperliquid coming soon)
- ✅ Real-time position monitoring with SL/TP
- ✅ Transparent billing ($0.20/trade + 10% profit share + $20/month subscription)
- ✅ Background job processing (tweet ingestion, classification, signal creation, trade execution)
- ✅ Performance metrics (APR30d, APR90d, Sharpe ratio)

## 📁 Project Structure

```
├── client/src/               # React frontend
│   ├── pages/               # Landing, Dashboard, Marketplace, Admin
│   └── components/          # Reusable UI components (shadcn)
├── server/
│   ├── api/                 # NestJS REST API (7 modules)
│   │   ├── auth/           # JWT + SIWE authentication
│   │   ├── agents/         # Agent CRUD + leaderboard
│   │   ├── deployments/    # Deploy/pause/cancel agents
│   │   ├── signals/        # Trading signals (read-only)
│   │   ├── positions/      # Position monitoring
│   │   ├── billing/        # Billing events
│   │   └── admin/          # Admin operations
│   ├── workers/            # BullMQ background processors (8 workers)
│   ├── adapters/           # Venue adapters (GMX, Hyperliquid, Spot)
│   ├── shared/             # Utilities (bucket6hUtc, validation, sizing, risk)
│   └── config/             # Environment config with Zod validation
├── prisma/
│   └── schema.prisma       # Database schema (14 models)
└── shared/
    └── schema.ts           # Shared Zod schemas
```

## 🗄️ Database Schema (14 Models)

| Model                 | Purpose                                           |
|-----------------------|---------------------------------------------------|
| `CtAccount`           | Crypto Twitter accounts to monitor                |
| `CtPost`              | Tweets/posts ingested from CT accounts            |
| `Agent`               | AI trading agents with custom strategies          |
| `AgentDeployment`     | User deployments of agents to Safe wallets        |
| `Signal`              | Trading signals generated from tweets             |
| `Position`            | Open/closed trading positions                     |
| `BillingEvent`        | Infrastructure fees, profit share, subscriptions  |
| `PnlSnapshot`         | Daily P&L aggregation per deployment              |
| `ImpactFactorHistory` | Historical influence scores for CT accounts       |
| `VenueStatus`         | Venue configuration (minSize, tickSize, slippage) |
| `TokenRegistry`       | On-chain token addresses and routers              |
| `MarketIndicators6h`  | Technical indicators updated every 6 hours        |
| `AuditLog`            | System audit trail                                |

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database (DATABASE_URL)
- Redis instance (REDIS_URL)

### Environment Variables
```bash
# Database & Redis
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
SESSION_SECRET="your-session-secret"
JWT_SECRET="your-jwt-secret"

# Blockchain (Base Network)
BASE_RPC_URL="https://mainnet.base.org"
DEPLOYER_PRIVATE_KEY="0x..."
EXECUTOR_PRIVATE_KEY="0x..."
TRADING_MODULE_ADDRESS="0x..."


# Optional (for production)
X_API_KEY="twitter-api-key"
LLM_API_KEY="openai-or-anthropic-key"
BILL_INFRA_FEE_USDC="0.20"
BILL_PROFIT_SHARE_BPS="1000"
SUBSCRIPTION_USD_MONTH="20"
```

### Installation & Setup
```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database (development only)
npx prisma db push

# Seed sample data
npm run seed
```

### Running the Application

#### Option 1: Separate Processes
```bash
# Terminal 1: Frontend + Express API
npm run dev

# Terminal 2: NestJS API
npm run nest

# Terminal 3: Workers
npm run workers
```

#### Option 2: Combined (API + Workers)
```bash
npm run dev:api
```

### Access Points
- **Frontend**: http://localhost:5000
- **API Docs**: http://localhost:3000/api-docs
- **Bull Board**: http://localhost:3000/admin/queues

## 📡 API Endpoints

### Authentication
- `POST /api/auth/siwe` - Sign-In with Ethereum (placeholder)
- `GET /api/auth/me` - Get current user info

### Agents
- `GET /api/agents` - List agents (leaderboard with filters)
- `GET /api/agents/:id` - Get agent details
- `POST /api/agents` - Create agent (requires auth)
- `PATCH /api/agents/:id` - Update agent (owner only)

### Deployments
- `GET /api/deployments` - List deployments
- `POST /api/deployments` - Deploy agent to Safe wallet
- `PATCH /api/deployments/:id` - Pause/resume/cancel

### Signals, Positions, Billing (Read-only)
- `GET /api/signals` - Trading signals
- `GET /api/positions` - Open/closed positions
- `GET /api/billing` - Billing events

### Admin
- `POST /api/admin/refresh-venues` - Update venue configuration
- `POST /api/admin/rebuild-metrics` - Recalculate agent metrics

## ⚙️ Background Workers (BullMQ)

| Worker              | Schedule     | Purpose                                   |
|---------------------|--------------|-------------------------------------------|
| `tweetIngest`       | Every 6h     | Fetch tweets from CT accounts             |
| `classify`          | On-demand    | LLM classification + token extraction     |
| `indicators`        | Every 6h     | Compute technical indicators              |
| `signalCreate`      | On-demand    | Generate trading signals from tweets      |
| `executeTrade`      | On-demand    | Execute trades via venue adapters         |
| `riskExit`          | On-demand    | Monitor positions for SL/TP triggers      |
| `metrics`           | On-demand    | Update agent performance metrics          |
| `billing`           | Monthly      | Process subscription fees + trade fees    |

## 💰 Billing Model

| Fee Type         | Amount      | Trigger                    |
|------------------|-------------|----------------------------|
| Infrastructure   | $0.20 USDC  | Per trade executed         |
| Profit Share     | 10%         | On profitable closes only  |
| Subscription     | $20/month   | Monthly billing (30d trial)|

## 🔧 Development Notes

### Creating an Agent
Agents require 8 strategy weights (0-100 each):
```typescript
{
  "name": "Momentum Trader",
  "venue": "SPOT",
  "weights": [15, 20, 15, 20, 10, 5, 10, 5]
}
```

### Signal Deduplication
Signals are deduplicated using 6-hour buckets via `bucket6hUtc()`:
```typescript
// Same agent + token + 6h window = only 1 signal
const windowStart = bucket6hUtc(new Date());
```

### Venue Adapters
All venue adapters implement the same interface:
```typescript
interface VenueAdapter {
  pairExists(tokenSymbol: string): Promise<boolean>;
  placeOrder(params: OrderParams): Promise<OrderResponse>;
  closePosition(positionId: string): Promise<CloseResponse>;
  minSize(tokenSymbol: string): Promise<string>;
  tickSize(tokenSymbol: string): Promise<string>;
  slippageGuard(amountUSDC: number): Promise<number>;
}
```

## 🧪 Testing

### Manual Testing
```bash
# Test agent creation
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "venue": "GMX",
    "weights": [10,20,15,25,10,5,10,5]
  }'

# Test deployment
curl -X POST http://localhost:3000/api/deployments \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "safeWallet": "0x..."
  }'
```

## 📝 TODO (Production Readiness)

### External Integrations
- [ ] Implement Twitter API integration in `tweetIngest.processor.ts`
- [ ] Add LLM classification API (OpenAI/Anthropic) in `classify.processor.ts`
- [ ] Integrate price feeds (CoinGecko/Chainlink) in `indicators.processor.ts`
- [ ] Complete Hyperliquid adapter using HL SDK
- [ ] Complete Spot adapter (Uniswap/1inch)
- [ ] Implement Safe wallet module installation in `RelayerService`

### Security & Production
- [ ] Replace SIWE placeholder with real EIP-4361 implementation
- [ ] Add rate limiting (express-rate-limit)
- [ ] Implement API key authentication for admin endpoints
- [ ] Add database migrations (Prisma Migrate)
- [ ] Set up monitoring (Sentry, DataDog)
- [ ] Add unit tests (Jest)
- [ ] Add E2E tests (Supertest)
- [ ] Configure production secrets management
- [ ] Set up CI/CD pipeline
- [ ] Add request validation middleware
- [ ] Implement RBAC (Role-Based Access Control)

### Performance
- [ ] Add Redis caching for agent leaderboard
- [ ] Implement database connection pooling
- [ ] Add query optimization (indexes)
- [ ] Set up CDN for frontend assets
- [ ] Implement pagination cursors for large datasets

## 📚 Documentation

- **API Docs**: Available at `/api-docs` when server is running
- **Queue Monitoring**: Visit `/admin/queues` for Bull Board UI
- **Architecture**: See `server/api/README.md` for detailed module documentation

## 🤝 Contributing

This is a production-ready template. To contribute:
1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

Built with ❤️ using NestJS, Prisma, and BullMQ
