import { z } from "zod";

// Enums
export const VenueEnum = z.enum(["SPOT", "GMX", "HYPERLIQUID"]);
export const AgentStatusEnum = z.enum(["DRAFT", "ACTIVE", "PAUSED"]);
export const DeploymentStatusEnum = z.enum(["ACTIVE", "PAUSED", "CANCELLED"]);
export const BillingKindEnum = z.enum(["SUBSCRIPTION", "INFRA_FEE", "PROFIT_SHARE"]);
export const BillingStatusEnum = z.enum(["CHARGED", "FAILED"]);
export const PositionStatusEnum = z.enum(["OPEN", "CLOSED"]);

export type Venue = z.infer<typeof VenueEnum>;
export type AgentStatus = z.infer<typeof AgentStatusEnum>;
export type DeploymentStatus = z.infer<typeof DeploymentStatusEnum>;
export type BillingKind = z.infer<typeof BillingKindEnum>;
export type BillingStatus = z.infer<typeof BillingStatusEnum>;
export type PositionStatus = z.infer<typeof PositionStatusEnum>;

// CtAccount schemas
export const insertCtAccountSchema = z.object({
  xUsername: z.string(),
  displayName: z.string().optional(),
  followersCount: z.number().int().optional(),
  impactFactor: z.number().default(0),
  lastSeenAt: z.string().datetime().optional(),
});

export type InsertCtAccount = z.infer<typeof insertCtAccountSchema>;

export interface CtAccount extends InsertCtAccount {
  id: string;
  impactFactor: number;
}

// CtPost schemas
export const insertCtPostSchema = z.object({
  ctAccountId: z.string().uuid(),
  tweetId: z.string(),
  tweetText: z.string(),
  tweetCreatedAt: z.string().datetime(),
  isSignalCandidate: z.boolean().default(false),
  extractedTokens: z.array(z.string()).default([]),
});

export type InsertCtPost = z.infer<typeof insertCtPostSchema>;

export interface CtPost extends InsertCtPost {
  id: string;
  isSignalCandidate: boolean;
  extractedTokens: string[];
}

// Agent schemas
export const insertAgentSchema = z.object({
  creatorWallet: z.string(),
  profitReceiverAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  name: z.string().min(1).max(100),
  venue: VenueEnum,
  status: AgentStatusEnum.default("DRAFT"),
  weights: z.array(z.number().int().min(0).max(100)).length(8),
  authorizationSignature: z.string().optional(),
  authorizationMessage: z.record(z.any()).optional(),
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;

export interface Agent extends InsertAgent {
  id: string;
  profitReceiverAddress: string;
  authorizationSignature?: string | null;
  authorizationMessage?: Record<string, any> | null;
  apr30d: number | null;
  apr90d: number | null;
  aprSi: number | null;
  sharpe30d: number | null;
}

// AgentDeployment schemas
export const insertAgentDeploymentSchema = z.object({
  agentId: z.string().uuid(),
  userWallet: z.string(),
  safeWallet: z.string(),
  status: DeploymentStatusEnum.default("ACTIVE"),
  subActive: z.boolean().default(true),
  trialEndsAt: z.string().datetime().optional(),
  nextBillingAt: z.string().datetime().optional(),
});

export type InsertAgentDeployment = z.infer<typeof insertAgentDeploymentSchema>;

export interface AgentDeployment extends InsertAgentDeployment {
  id: string;
  subStartedAt: string;
}

// Signal schemas
export const insertSignalSchema = z.object({
  agentId: z.string().uuid(),
  tokenSymbol: z.string(),
  venue: VenueEnum,
  side: z.string(),
  sizeModel: z.record(z.any()),
  riskModel: z.record(z.any()),
  sourceTweets: z.array(z.string()),
  signalHash: z.string().optional(),
  creatorAddress: z.string().optional(),
  proofOfIntentTxHash: z.string().optional(),
});

export type InsertSignal = z.infer<typeof insertSignalSchema>;

export interface Signal extends InsertSignal {
  id: string;
  createdAt: string;
  signalHash?: string | null;
  creatorAddress?: string | null;
  proofOfIntentTxHash?: string | null;
}

// Position schemas
export const insertPositionSchema = z.object({
  deploymentId: z.string().uuid(),
  signalId: z.string().uuid(),
  venue: VenueEnum,
  tokenSymbol: z.string(),
  side: z.string(),
  qty: z.string(),
  entryPrice: z.string(),
  stopLoss: z.string().optional(),
  takeProfit: z.string().optional(),
  trailingParams: z.record(z.any()).optional(),
});

export type InsertPosition = z.infer<typeof insertPositionSchema>;

export interface Position extends InsertPosition {
  id: string;
  openedAt: string;
  closedAt: string | null;
  exitPrice: string | null;
  pnl: string | null;
  status: PositionStatus;
}

// BillingEvent schemas
export const insertBillingEventSchema = z.object({
  positionId: z.string().uuid().optional(),
  deploymentId: z.string().uuid(),
  kind: BillingKindEnum,
  amount: z.string(),
  asset: z.string().default("USDC"),
  status: BillingStatusEnum,
  metadata: z.record(z.any()).optional(),
});

export type InsertBillingEvent = z.infer<typeof insertBillingEventSchema>;

export interface BillingEvent extends InsertBillingEvent {
  id: string;
  occurredAt: string;
}

// VenueStatus schemas
export const insertVenueStatusSchema = z.object({
  venue: VenueEnum,
  tokenSymbol: z.string(),
  minSize: z.string().optional(),
  tickSize: z.string().optional(),
  slippageLimitBps: z.number().int().optional(),
});

export type InsertVenueStatus = z.infer<typeof insertVenueStatusSchema>;

export interface VenueStatus extends InsertVenueStatus {
  id: string;
}

// TokenRegistry schemas
export const insertTokenRegistrySchema = z.object({
  chain: z.string(),
  tokenSymbol: z.string(),
  tokenAddress: z.string(),
  preferredRouter: z.string().optional(),
});

export type InsertTokenRegistry = z.infer<typeof insertTokenRegistrySchema>;

export interface TokenRegistry extends InsertTokenRegistry {
  id: string;
}

// MarketIndicators6h schemas
export const insertMarketIndicators6hSchema = z.object({
  tokenSymbol: z.string(),
  windowStart: z.string().datetime(),
  indicators: z.record(z.any()),
});

export type InsertMarketIndicators6h = z.infer<typeof insertMarketIndicators6hSchema>;

export interface MarketIndicators6h extends InsertMarketIndicators6h {
  id: string;
}

// PnlSnapshot schemas
export const insertPnlSnapshotSchema = z.object({
  agentId: z.string().uuid(),
  deploymentId: z.string().uuid(),
  day: z.string(),
  pnl: z.string().optional(),
  returnPct: z.number().optional(),
});

export type InsertPnlSnapshot = z.infer<typeof insertPnlSnapshotSchema>;

export interface PnlSnapshot extends InsertPnlSnapshot {
  id: string;
}

// AuditLog schemas
export const insertAuditLogSchema = z.object({
  eventName: z.string(),
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
  payload: z.record(z.any()).optional(),
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export interface AuditLog extends InsertAuditLog {
  id: string;
  occurredAt: string;
}
