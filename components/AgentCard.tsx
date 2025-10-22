import { Tooltip } from './Tooltip';

interface Agent {
  id: string;
  name: string;
  venue: string;
  apr_30d: number | null;
  apr_90d: number | null;
  apr_si: number | null;
  sharpe_30d: number | null;
}

interface AgentCardProps {
  agent: Agent;
  onClick: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-6 cursor-pointer hover:border-primary transition-colors"
      data-testid={`card-agent-${agent.id}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-semibold text-foreground" data-testid={`text-name-${agent.id}`}>
            {agent.name}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{agent.venue}</p>
        </div>
        <div className="flex gap-2">
          <Tooltip content="We relay transactions and charge a flat $0.20 per trade">
            <span className="px-2 py-1 text-xs rounded-md bg-primary/20 text-primary cursor-help">
              Gasless
            </span>
          </Tooltip>
          <span className="px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground">
            Non-custodial
          </span>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">APR (30d)</span>
          <span className="text-lg font-bold text-primary" data-testid={`text-apr30d-${agent.id}`}>
            {agent.apr_30d != null ? `${agent.apr_30d.toFixed(2)}%` : 'N/A'}
          </span>
        </div>
        
        {agent.sharpe_30d != null && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Sharpe Ratio</span>
            <span className="text-foreground">{agent.sharpe_30d.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
