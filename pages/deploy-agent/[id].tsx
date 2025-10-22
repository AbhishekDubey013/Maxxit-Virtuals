import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Check, AlertCircle, Loader2, Rocket, Shield, Wallet, Zap } from "lucide-react";

// Extend Window interface for MetaMask
declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function DeployAgent() {
  const router = useRouter();
  const { id: agentId } = router.query;
  
  const [safeAddress, setSafeAddress] = useState("");
  const [userWallet, setUserWallet] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentVenue, setAgentVenue] = useState("");
  const [validationStatus, setValidationStatus] = useState<{
    checking: boolean;
    valid: boolean;
    error?: string;
    balances?: any;
  }>({ checking: false, valid: false });
  const [moduleStatus, setModuleStatus] = useState<{
    checking: boolean;
    enabled: boolean;
    needsEnabling: boolean;
    error?: string;
  }>({ checking: false, enabled: false, needsEnabling: false });
  const [enablingModule, setEnablingModule] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [moduleAddress, setModuleAddress] = useState('0xa87f82433294cE8A3C8f08Ec5D2825e946C0c0FE');
  const [transactionData, setTransactionData] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");

  // Fetch agent details
  useEffect(() => {
    if (agentId) {
      fetch(`/api/agents/${agentId}`)
        .then(res => res.json())
        .then(data => {
          console.log('[Deploy Agent] Fetched agent data:', data);
          // API returns single object, not array
          if (data && data.id) {
            setAgentName(data.name);
            setAgentVenue(data.venue);
            console.log('[Deploy Agent] Set agentVenue to:', data.venue);
          }
        })
        .catch(err => console.error("Failed to load agent:", err));
    }
  }, [agentId]);

  // Validate Safe wallet
  const validateSafe = async () => {
    if (!safeAddress || !/^0x[a-fA-F0-9]{40}$/.test(safeAddress)) {
      setValidationStatus({
        checking: false,
        valid: false,
        error: "Invalid Ethereum address format",
      });
      return;
    }

    setValidationStatus({ checking: true, valid: false });

    try {
      // Use Arbitrum mainnet (module is deployed on Arbitrum)
      const chainId = 42161; // Arbitrum One
      const response = await fetch(
        `/api/safe/status?safeAddress=${safeAddress}&chainId=${chainId}`
      );
      
      const data = await response.json();

      if (data.valid && data.readiness?.ready) {
        setValidationStatus({
          checking: false,
          valid: true,
          balances: data.balances,
        });
        // After validation succeeds, check module status
        checkModuleStatus();
      } else {
        setValidationStatus({
          checking: false,
          valid: false,
          error: data.readiness?.warnings?.join(", ") || data.error || "Safe wallet not ready for trading",
        });
      }
    } catch (error: any) {
      setValidationStatus({
        checking: false,
        valid: false,
        error: error.message || "Failed to validate Safe wallet",
      });
    }
  };

  // Check if module is enabled and sync with blockchain
  const checkModuleStatus = async () => {
    setModuleStatus({ checking: true, enabled: false, needsEnabling: false });

    try {
      // First sync with blockchain to ensure database is up to date
      const chainId = 42161; // Arbitrum One
      const syncResponse = await fetch('/api/safe/sync-module-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeAddress, chainId }),
      });

      const syncData = await syncResponse.json();

      if (syncData.success) {
        // Module status is now synced with blockchain
        if (syncData.moduleEnabled) {
          setModuleStatus({
            checking: false,
            enabled: true,
            needsEnabling: false,
          });
          console.log('[CheckModule] Module is enabled and synced with blockchain');
        } else {
          setModuleStatus({
            checking: false,
            enabled: false,
            needsEnabling: true,
          });
          console.log('[CheckModule] Module needs to be enabled');
        }
      } else {
        // Sync failed, fall back to old check
        const response = await fetch('/api/safe/enable-module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ safeAddress }),
        });

        const data = await response.json();

        if (data.success && data.alreadyEnabled) {
          setModuleStatus({
            checking: false,
            enabled: true,
            needsEnabling: false,
          });
        } else if (data.success && data.needsEnabling) {
          setModuleStatus({
            checking: false,
            enabled: false,
            needsEnabling: true,
          });
        } else {
          setModuleStatus({
            checking: false,
            enabled: false,
            needsEnabling: false,
            error: data.error || 'Failed to check module status',
          });
        }
      }
    } catch (error: any) {
      console.error('[CheckModule] Error:', error);
      setModuleStatus({
        checking: false,
        enabled: false,
        needsEnabling: false,
        error: error.message || 'Failed to check module status',
      });
    }
  };

  // Enable GMX module via Safe Transaction Builder
  const enableModuleGMXStep1 = async () => {
    setEnablingModule(true);
    setDeployError('');

    try {
      // Generate GMX setup transaction (module enable only - GMX V2 doesn't need authorization!)
      const response = await fetch('/api/gmx/generate-setup-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeAddress }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate setup transaction');
      }

      // Store module address and transaction data
      setModuleAddress(data.moduleAddress);
      const txData = data.sdkTransactions[0].data; // Enable module
      setTransactionData(txData);

      // Copy transaction data to clipboard
      try {
        await navigator.clipboard.writeText(txData);
        console.log('[EnableModuleGMX] Enable module data copied to clipboard');
      } catch (e) {
        console.log('[EnableModuleGMX] Clipboard copy failed');
      }

      // Open Safe Transaction Builder
      const chainPrefix = 'arb1';
      const txBuilderAppUrl = 'https://apps-portal.safe.global/tx-builder';
      const safeUrl = `https://app.safe.global/apps/open?safe=${chainPrefix}:${safeAddress}&appUrl=${encodeURIComponent(txBuilderAppUrl)}`;
      
      const safeWindow = window.open(safeUrl, '_blank');
      
      if (!safeWindow) {
        throw new Error('Please allow pop-ups to open Safe Transaction Builder');
      }

      // Show instructions
      setShowInstructions(true);
      setEnablingModule(false);
    } catch (error: any) {
      console.error('[EnableModuleGMX] Error:', error);
      setDeployError(error.message);
      setEnablingModule(false);
    }
  };

  const enableModule = async () => {
    setEnablingModule(true);
    setDeployError('');

    try {
      // First check if already enabled
      const chainId = 42161; // Arbitrum One
      const checkResponse = await fetch('/api/safe/enable-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeAddress, chainId }),
      });

      const checkData = await checkResponse.json();

      if (checkData.success && checkData.alreadyEnabled) {
        // Module already enabled, just update status
        await checkModuleStatus();
        setEnablingModule(false);
        return;
      }

      // Store module address and complete transaction data
      const moduleAddr = checkData.moduleAddress || '0x74437d894C8E8A5ACf371E10919c688ae79E89FA';
      const txData = checkData.transaction?.data || '';
      setModuleAddress(moduleAddr);
      setTransactionData(txData);
      
      // Copy transaction data to clipboard
      try {
        await navigator.clipboard.writeText(txData);
        console.log('[EnableModule] Transaction data copied to clipboard');
      } catch (e) {
        console.log('[EnableModule] Clipboard copy failed, but continuing...');
      }

      // Open Safe Transaction Builder
      const chainPrefix = 'arb1'; // Arbitrum One
      const txBuilderAppUrl = 'https://apps-portal.safe.global/tx-builder';
      const safeUrl = `https://app.safe.global/apps/open?safe=${chainPrefix}:${safeAddress}&appUrl=${encodeURIComponent(txBuilderAppUrl)}`;
      
      const safeWindow = window.open(safeUrl, '_blank');
      
      if (!safeWindow) {
        throw new Error('Please allow pop-ups to open Safe Transaction Builder');
      }

      // Show instructions panel
      setShowInstructions(true);
      setEnablingModule(false);
    } catch (error: any) {
      console.error('[EnableModule] Error:', error);
      setDeployError(error.message || 'Failed to enable module');
      setEnablingModule(false);
    }
  };

  // Deploy agent
  const handleDeploy = async () => {
    if (!validationStatus.valid || !userWallet || !safeAddress) {
      return;
    }

    setDeploying(true);
    setDeployError("");

    try {
      const response = await fetch("/api/deployments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          userWallet,
          safeWallet: safeAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Deployment failed");
      }

      // Success! Redirect to dashboard
      router.push("/creator");
    } catch (error: any) {
      setDeployError(error.message);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Rocket className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Deploy Your Agent</h1>
          <p className="text-muted-foreground">
            Connect your Safe wallet to start trading with <strong>{agentName || "your agent"}</strong>
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          {/* Agent Info */}
          {agentVenue && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Trading Venue</p>
              <p className="font-semibold text-lg">{agentVenue}</p>
            </div>
          )}

          {/* User Wallet */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Your Wallet Address *
            </label>
            <input
              type="text"
              value={userWallet}
              onChange={(e) => setUserWallet(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The wallet address that owns this agent
            </p>
          </div>

          {/* Safe Wallet */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Safe Wallet Address *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={safeAddress}
                onChange={(e) => {
                  setSafeAddress(e.target.value);
                  setValidationStatus({ checking: false, valid: false });
                }}
                placeholder="0x..."
                className="flex-1 px-4 py-2 bg-background border border-border rounded-md text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={validateSafe}
                disabled={validationStatus.checking || !safeAddress}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validationStatus.checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Validate"
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Your Safe multisig wallet on Arbitrum One that will hold your USDC
            </p>
            <div className="mt-2 p-2 bg-primary/10 border border-primary/20 rounded-md">
              <p className="text-xs text-primary font-medium">
                ✨ Gasless Trading: You only need USDC - we cover all gas fees!
              </p>
            </div>
          </div>

          {/* Validation Status */}
          {validationStatus.checking && (
            <div className="p-4 bg-muted border border-border rounded-md flex items-start gap-3">
              <Loader2 className="h-4 w-4 animate-spin mt-0.5" />
              <p className="text-sm">Validating Safe wallet...</p>
            </div>
          )}

          {validationStatus.valid && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md">
              <div className="flex items-start gap-3 mb-2">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    ✨ Safe wallet ready! Gasless trading enabled
                  </p>
                  {validationStatus.balances && (
                    <div className="text-sm mt-2 space-y-1">
                      <p className="font-semibold">USDC: {validationStatus.balances.usdc?.formatted}</p>
                      <p className="text-xs text-green-600 dark:text-green-500">
                        Only USDC needed - we cover gas fees!
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {validationStatus.error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{validationStatus.error}</p>
            </div>
          )}

          {/* Module Status */}
          {validationStatus.valid && moduleStatus.checking && (
            <div className="p-4 bg-muted border border-border rounded-md flex items-start gap-3">
              <Loader2 className="h-4 w-4 animate-spin mt-0.5" />
              <p className="text-sm">Checking trading module status...</p>
            </div>
          )}

          {validationStatus.valid && moduleStatus.enabled && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md">
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    ✅ Trading module enabled!
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your Safe is ready for automated trading
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loading agent details */}
          {validationStatus.valid && moduleStatus.needsEnabling && !agentVenue && (
            <div className="p-4 bg-muted border border-border rounded-md flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-sm">Loading agent details...</p>
            </div>
          )}

          {validationStatus.valid && moduleStatus.needsEnabling && agentVenue && (
            (() => {
              console.log('[Deploy Agent] Rendering setup. agentVenue:', agentVenue, 'isGMX:', agentVenue === 'GMX');
              return agentVenue === 'GMX' ? (
                // GMX: Batch Transaction Setup
                <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md">
                <div className="flex items-start gap-3 mb-3">
                  <Zap className="h-4 w-4 text-orange-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-700 dark:text-orange-400">
                      GMX Trading Setup Required
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      One-time setup: Enable trading module (gas sponsored)
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={enableModuleGMXStep1}
                    disabled={enablingModule}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {enablingModule ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        Enable GMX Trading
                      </>
                    )}
                  </button>
                  <button
                    onClick={checkModuleStatus}
                    disabled={moduleStatus.checking}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-secondary/90 disabled:opacity-50"
                  >
                    {moduleStatus.checking ? 'Checking...' : 'Recheck Status'}
                  </button>
                </div>

                {/* GMX Instructions Panel */}
                {showInstructions && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100">📋 GMX Setup Instructions</h4>
                      <button
                        onClick={() => setShowInstructions(false)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="space-y-4 text-sm">
                      <div>
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">✅ Transaction data copied to clipboard!</p>
                        <p className="text-blue-700 dark:text-blue-300 mb-3">Safe Transaction Builder opened - follow these steps:</p>
                      </div>

                      <div className="space-y-3">
                        <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded border border-orange-300 dark:border-orange-700">
                          <p className="font-semibold text-orange-900 dark:text-orange-100 mb-2">Enable GMX Trading Module</p>
                          
                          <div className="space-y-2">
                            <div>
                              <p className="font-medium text-blue-900 dark:text-blue-100 mb-1 text-xs">1. Enter Address (your Safe):</p>
                              <div className="flex gap-2">
                                <input
                                  readOnly
                                  value={safeAddress}
                                  className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono text-xs"
                                />
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(safeAddress);
                                    alert('✅ Safe address copied!');
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                                >
                                  Copy
                                </button>
                              </div>
                            </div>

                            <div>
                              <p className="font-medium text-blue-900 dark:text-blue-100 mb-1 text-xs">2. Choose "Use custom data (hex encoded)"</p>
                            </div>

                            <div>
                              <p className="font-medium text-blue-900 dark:text-blue-100 mb-1 text-xs">3. Paste transaction data (already copied!):</p>
                              <div className="flex gap-2">
                                <input
                                  readOnly
                                  value={transactionData || 'Loading...'}
                                  className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono text-xs overflow-hidden text-ellipsis"
                                />
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(transactionData);
                                    alert('✅ Transaction data copied!');
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs whitespace-nowrap"
                                >
                                  Copy
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-orange-600 dark:text-orange-400">✅ Then click "Create Batch", "Send Batch", and "Execute"</p>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-2">💡 Note: GMX V2 doesn't require separate authorization!</p>
                          </div>
                        </div>

                        {/* Final Steps */}
                        <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">Final Steps:</p>
                          <ul className="text-blue-700 dark:text-blue-300 text-xs space-y-1 ml-4">
                            <li>• Click "Create Batch"</li>
                            <li>• Click "Send Batch"</li>
                            <li>• Click "Continue" and "Sign txn"</li>
                            <li>• Go to Transactions → Click "Execute"</li>
                            <li>• Sign again in wallet (gas sponsored)</li>
                            <li>• Wait for confirmation ⏳</li>
                          </ul>
                        </div>
                      </div>

                      <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3 mt-4">
                        <p className="text-green-800 dark:text-green-200 font-medium">⏳ After execution (~30 sec):</p>
                        <p className="text-green-700 dark:text-green-300 text-xs mt-1">
                          Click "Recheck Status" button above to verify setup is complete
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // SPOT: Old Manual Setup
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-700 dark:text-yellow-400">
                      Trading Module Setup Required (SPOT Mode - Venue: {agentVenue || 'empty'})
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    One-time setup: Enable the trading module to allow your agent to execute trades on your behalf.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={enableModule}
                  disabled={enablingModule}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {enablingModule ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4" />
                      Enable Trading Module
                    </>
                  )}
                </button>
                <button
                  onClick={checkModuleStatus}
                  disabled={moduleStatus.checking}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-secondary/90 disabled:opacity-50"
                >
                  {moduleStatus.checking ? 'Checking...' : 'Recheck Status'}
                </button>
              </div>

              {/* Instructions Panel */}
              {showInstructions && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100">📋 Step-by-Step Instructions</h4>
                    <button
                      onClick={() => setShowInstructions(false)}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">✅ Transaction data copied to clipboard!</p>
                      <p className="text-blue-700 dark:text-blue-300 mb-3">Safe Transaction Builder opened - follow these simple steps:</p>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">1️⃣ Enter Address (your Safe):</p>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            value={safeAddress}
                            className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono text-xs"
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(safeAddress);
                              alert('✅ Safe address copied!');
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                          >
                            Copy
                          </button>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">2️⃣ Choose "Use custom data (hex encoded)"</p>
                        <p className="text-blue-700 dark:text-blue-300 text-xs">(Skip the ABI option)</p>
                      </div>

                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">3️⃣ Paste transaction data (already copied!):</p>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            value={transactionData || 'Loading...'}
                            className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono text-xs overflow-hidden text-ellipsis"
                          />
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(transactionData);
                              alert('✅ Transaction data copied!');
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs whitespace-nowrap"
                          >
                            Copy
                          </button>
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          💡 This includes the module address ({moduleAddress.substring(0, 10)}...) - no manual entry needed!
                        </p>
                      </div>

                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">4️⃣ Batch & Sign:</p>
                        <ul className="text-blue-700 dark:text-blue-300 text-xs space-y-1 ml-4">
                          <li>• Click "Add new txn"</li>
                          <li>• Click "Create Batch"</li>
                          <li>• Click "Send Batch"</li>
                          <li>• Click "Continue" on confirmation</li>
                          <li>• Click "Sign txn"</li>
                        </ul>
                      </div>

                      <div className="bg-white dark:bg-gray-900 p-3 rounded border border-blue-200 dark:border-blue-800">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">5️⃣ Execute:</p>
                        <ul className="text-blue-700 dark:text-blue-300 text-xs space-y-1 ml-4">
                          <li>• Go back to Transactions</li>
                          <li>• Click "Execute"</li>
                          <li>• Click "Continue"</li>
                          <li>• Sign again in wallet</li>
                          <li>• Wait for confirmation ⏳</li>
                        </ul>
                      </div>
                    </div>

                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3 mt-4">
                      <p className="text-green-800 dark:text-green-200 font-medium">⏳ After execution (~30 sec):</p>
                      <p className="text-green-700 dark:text-green-300 text-xs mt-1">Come back here and click "Recheck Status" button above</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
            })()
          )}

          {moduleStatus.error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{moduleStatus.error}</p>
            </div>
          )}

          {/* Deploy Error */}
          {deployError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{deployError}</p>
            </div>
          )}

          {/* Deploy Button */}
          <div className="pt-4">
            <button
              onClick={handleDeploy}
              disabled={
                !validationStatus.valid ||
                !moduleStatus.enabled ||
                !userWallet ||
                !safeAddress ||
                deploying
              }
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {deploying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Deploy Agent
                </>
              )}
            </button>
            {validationStatus.valid && !moduleStatus.enabled && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                Please enable the trading module first
              </p>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              About Safe Wallets & Gasless Trading
            </h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• ✨ <strong>Gasless Trading:</strong> Only deposit USDC - we cover all gas fees</li>
              <li>• <strong>Non-custodial:</strong> You maintain full control of funds</li>
              <li>• <strong>Module System:</strong> One-time setup grants trading permissions</li>
              <li>• <strong>Multi-sig capable:</strong> Optional extra security</li>
              <li>• <strong>Used by $100B+</strong> in crypto assets</li>
              <li>• <strong>Restricted access:</strong> Agent can only trade, never withdraw</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/creator')}
            className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
