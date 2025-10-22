import Link from 'next/link';
import { Bot, Home, BarChart3, FileText, Wallet, User } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';

export function Header() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo/Brand */}
          <Link href="/" className="flex items-center gap-3 hover-elevate rounded-md px-3 py-2 -ml-3">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-primary" data-testid="text-header-brand">
                MAXXIT
              </span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <Link href="/">
              <button 
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-home"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Home</span>
              </button>
            </Link>
            <Link href="/my-deployments">
              <button 
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-deployments"
              >
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">My Deployments</span>
              </button>
            </Link>
            <Link href="/creator">
              <button 
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-my-agents"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">My Agents</span>
              </button>
            </Link>
            <Link href="/create-agent">
              <button 
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-create"
              >
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">Create Agent</span>
              </button>
            </Link>
            <Link href="/docs">
              <button 
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                data-testid="nav-docs"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Docs</span>
              </button>
            </Link>
            
            {/* Wallet Connection */}
            {ready && (
              <>
                {authenticated ? (
                  <button 
                    onClick={logout}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-primary text-primary rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                    data-testid="button-disconnect-wallet"
                  >
                    <Wallet className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {user?.wallet?.address ? 
                        `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` : 
                        'Disconnect'}
                    </span>
                  </button>
                ) : (
                  <button 
                    onClick={login}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-primary text-primary rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-all"
                    data-testid="button-connect-wallet"
                  >
                    <Wallet className="h-4 w-4" />
                    <span className="hidden sm:inline">Connect Wallet</span>
                  </button>
                )}
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
