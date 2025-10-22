import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { insertAgentSchema, VenueEnum } from '@shared/schema';
import { db } from '@lib/db';
import { useRouter } from 'next/router';
import { Check, User, Building2, Sliders, Wallet, Eye, Rocket, Twitter, Search, Plus as PlusIcon, X } from 'lucide-react';
import { Header } from '@components/Header';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { ethers } from 'ethers';

const wizardSchema = insertAgentSchema.extend({
  description: z.string().max(500).optional(),
});

type WizardFormData = z.infer<typeof wizardSchema>;

const WEIGHT_LABELS = [
  'CT Account Impact Factor',
  'RSI Threshold',
  'MACD Signal Strength',
  'Volume Momentum',
  'Position Sizing Aggressiveness',
  'Stop Loss Tightness',
  'Take Profit Target',
  'Risk-Reward Ratio',
];

type CtAccount = {
  id: string;
  xUsername: string;
  displayName: string | null;
  followersCount: number | null;
  impactFactor: number;
  lastSeenAt: Date | null;
  _count?: {
    ctPosts: number;
    agentAccounts: number;
  };
};

export default function CreateAgent() {
  const router = useRouter();
  const { authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // CT Accounts state
  const [ctAccounts, setCtAccounts] = useState<CtAccount[]>([]);
  const [selectedCtAccounts, setSelectedCtAccounts] = useState<Set<string>>(new Set());
  const [loadingCtAccounts, setLoadingCtAccounts] = useState(false);
  const [ctAccountSearch, setCtAccountSearch] = useState('');
  const [showAddCtAccount, setShowAddCtAccount] = useState(false);
  const [newCtUsername, setNewCtUsername] = useState('');
  const [newCtDisplayName, setNewCtDisplayName] = useState('');
  const [newCtFollowers, setNewCtFollowers] = useState('');
  const [addingCtAccount, setAddingCtAccount] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      venue: 'SPOT',
      weights: [50, 50, 50, 50, 50, 50, 50, 50],
      status: 'DRAFT',
      creatorWallet: '',
      profitReceiverAddress: '',
    },
  });

  const formData = watch();

  // Auto-populate creator wallet and profit receiver when user authenticates
  useEffect(() => {
    if (authenticated && user?.wallet?.address) {
      setValue('creatorWallet', user.wallet.address, { 
        shouldValidate: true,
        shouldDirty: true 
      });
      // Default profit receiver to creator wallet (can be changed)
      setValue('profitReceiverAddress', user.wallet.address, { 
        shouldValidate: true,
        shouldDirty: true 
      });
    }
  }, [authenticated, user?.wallet?.address, setValue]);

  // Load CT accounts when reaching that step
  useEffect(() => {
    if (step === 4) {
      loadCtAccounts();
    }
  }, [step]);

  const loadCtAccounts = async () => {
    setLoadingCtAccounts(true);
    try {
      const accounts = await db.get('ct_accounts', {
        limit: '100',
      });
      setCtAccounts(accounts || []);
    } catch (err: any) {
      console.error('Failed to load CT accounts:', err);
      setError('Failed to load CT accounts');
    } finally {
      setLoadingCtAccounts(false);
    }
  };

  const handleAddCtAccount = async () => {
    if (!newCtUsername.trim()) {
      setError('Username is required');
      return;
    }

    setAddingCtAccount(true);
    setError(null);
    
    try {
      const newAccount = await db.post('ct_accounts', {
        xUsername: newCtUsername.trim().replace('@', ''),
        displayName: newCtDisplayName.trim() || undefined,
        followersCount: newCtFollowers ? parseInt(newCtFollowers) : undefined,
      });

      if (newAccount && newAccount.id) {
        setCtAccounts([newAccount, ...ctAccounts]);
        setSelectedCtAccounts(new Set([...selectedCtAccounts, newAccount.id]));
        setShowAddCtAccount(false);
        setNewCtUsername('');
        setNewCtDisplayName('');
        setNewCtFollowers('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add CT account');
    } finally {
      setAddingCtAccount(false);
    }
  };

  const toggleCtAccount = (accountId: string) => {
    const newSelected = new Set(selectedCtAccounts);
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId);
    } else {
      newSelected.add(accountId);
    }
    setSelectedCtAccounts(newSelected);
  };

  const onSubmit = async (data: WizardFormData) => {
    // Validate all fields before submit
    const isValid = await trigger();
    if (!isValid) {
      // Find first step with errors
      if (errors.name) setStep(1);
      else if (errors.venue) setStep(2);
      else if (errors.weights) setStep(3);
      else if (errors.creatorWallet) setStep(5);
      setError('Please fix the validation errors before submitting');
      return;
    }

    // Validate CT accounts selection
    if (selectedCtAccounts.size === 0) {
      setError('Please select at least one CT account');
      setStep(4);
      return;
    }

    if (!authenticated) {
      setError('Please connect your wallet first');
      login();
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // Remove description as it's not in the schema
      const { description, ...agentData } = data;
      
      // Set creator wallet from connected user
      agentData.creatorWallet = user?.wallet?.address || data.creatorWallet;
      
      // Ensure profitReceiverAddress is set (default to creatorWallet if not provided)
      if (!agentData.profitReceiverAddress) {
        agentData.profitReceiverAddress = agentData.creatorWallet;
      }

      // 🔒 PROOF OF INTENT: Sign agent authorization with EIP-712
      console.log('🔐 Signing agent authorization...');
      try {
        const wallet = wallets[0]; // Get first connected wallet
        if (!wallet) {
          throw new Error('No wallet connected');
        }

        await wallet.switchChain(8453); // Switch to Base
        const provider = await wallet.getEthersProvider();
        const signer = provider.getSigner();

        const domain = {
          name: 'Maxxit Trading Platform',
          version: '1',
          chainId: 8453, // Base
          verifyingContract: process.env.NEXT_PUBLIC_TRADING_MODULE_ADDRESS || '0x0000000000000000000000000000000000000000',
        };

        const types = {
          AgentAuthorization: [
            { name: 'agentName', type: 'string' },
            { name: 'creator', type: 'address' },
            { name: 'timestamp', type: 'uint256' },
            { name: 'authorizedUntil', type: 'uint256' },
          ],
        };

        const value = {
          agentName: agentData.name,
          creator: agentData.creatorWallet,
          timestamp: Math.floor(Date.now() / 1000),
          authorizedUntil: 0, // Never expires
        };

        const signature = await signer._signTypedData(domain, types, value);
        
        console.log('✅ Authorization signed:', signature.slice(0, 20) + '...');

        // Add authorization to agent data
        agentData.authorizationSignature = signature;
        agentData.authorizationMessage = value;
      } catch (signError: any) {
        console.error('⚠️  Signing failed, continuing without authorization:', signError);
        // Continue without authorization - not critical for agent creation
      }
      
      console.log('🚀 CREATING AGENT - Step 1: Posting agent data to DB...');
      const result = await db.post('agents', agentData);
      console.log('✅ AGENT CREATED:', result);
      
      if (result && result.id) {
        const agentId = result.id;
        console.log('📝 Agent ID:', agentId);
        console.log('📊 Selected CT Accounts:', selectedCtAccounts.size, 'accounts');
        
        // Link selected CT accounts to the agent
        console.log('🔗 LINKING CT ACCOUNTS - Starting...', Array.from(selectedCtAccounts));
        
        const linkPromises = Array.from(selectedCtAccounts).map(async (ctAccountId) => {
          console.log('  Linking CT account:', ctAccountId);
          const response = await fetch(`/api/agents/${agentId}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ctAccountId }),
          });
          
          if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Failed to link account' }));
            console.error('  Failed to link account:', ctAccountId, error);
            throw new Error(error.error || `Failed to link account ${ctAccountId}`);
          }
          
          const result = await response.json();
          console.log('  Successfully linked:', result);
          return result;
        });
        
        try {
          await Promise.all(linkPromises);
          console.log('✅ All CT accounts linked successfully');
        } catch (linkError: any) {
          console.error('❌ Failed to link CT accounts:', linkError);
          setError(`Agent created but some CT accounts failed to link: ${linkError.message}`);
          // Don't return here - still show the deploy modal
        }
        
        setCreatedAgentId(agentId);
        setShowDeployModal(true);
      } else {
        router.push('/creator');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create agent');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeploy = () => {
    // Navigate to deployment page with Safe wallet setup
    console.log('Deploy clicked! Agent ID:', createdAgentId);
    if (createdAgentId) {
      console.log('Navigating to:', `/deploy-agent/${createdAgentId}`);
      // Close modal first
      setShowDeployModal(false);
      // Use window.location for full page navigation to ensure the route loads
      window.location.href = `/deploy-agent/${createdAgentId}`;
    } else {
      console.error('No agent ID available!');
      alert('Error: Agent ID not found. Please try creating the agent again.');
    }
  };

  const nextStep = async () => {
    let isValid = false;
    
    // Validate current step before advancing
    if (step === 1) {
      isValid = await trigger('name');
    } else if (step === 2) {
      isValid = await trigger('venue');
    } else if (step === 3) {
      isValid = await trigger('weights');
    } else if (step === 4) {
      // Validate CT account selection
      if (selectedCtAccounts.size === 0) {
        setError('Please select at least one CT account');
        return;
      }
      isValid = true;
    } else if (step === 5) {
      const validWallet = await trigger('creatorWallet');
      const validProfit = await trigger('profitReceiverAddress');
      isValid = validWallet && validProfit;
    }
    
    if (isValid && step < 6) {
      setStep(step + 1);
      setError(null);
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const steps = [
    { number: 1, label: 'Basic Info', icon: User },
    { number: 2, label: 'Venue', icon: Building2 },
    { number: 3, label: 'Strategy', icon: Sliders },
    { number: 4, label: 'CT Accounts', icon: Twitter },
    { number: 5, label: 'Wallet', icon: Wallet },
    { number: 6, label: 'Review', icon: Eye },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent mb-3" data-testid="text-title">
              Create Your Trading Agent
            </h1>
            <p className="text-muted-foreground">Configure your autonomous trading strategy in 5 easy steps</p>
          </div>

        {/* Enhanced Progress Indicator */}
        <div className="mb-12">
          <div className="relative">
            {/* Progress Line */}
            <div className="absolute top-6 left-0 right-0 h-0.5 bg-muted" style={{ zIndex: 0 }} />
            <div
              className="absolute top-6 left-0 h-0.5 bg-primary transition-all duration-500"
              style={{ width: `${((step - 1) / 5) * 100}%`, zIndex: 1 }}
            />
            
            {/* Step Circles */}
            <div className="relative flex justify-between" style={{ zIndex: 2 }}>
              {steps.map((s) => {
                const Icon = s.icon;
                const isCompleted = s.number < step;
                const isCurrent = s.number === step;
                
                return (
                  <div key={s.number} className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isCompleted
                          ? 'bg-primary text-primary-foreground scale-110'
                          : isCurrent
                          ? 'bg-primary text-primary-foreground ring-4 ring-primary/20 scale-110'
                          : 'bg-muted text-muted-foreground'
                      }`}
                      data-testid={`progress-step-${s.number}`}
                    >
                      {isCompleted ? (
                        <Check className="h-6 w-6" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={`mt-2 text-xs font-medium transition-colors hidden sm:block ${
                        isCurrent || isCompleted ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Global Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-md">
            <p className="text-destructive text-sm" data-testid="text-error">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-border rounded-lg p-8">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Basic Information
              </h2>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Agent Name *
                </label>
                <input
                  type="text"
                  {...register('name')}
                  className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Alpha Momentum Trader"
                  data-testid="input-name"
                />
                {errors.name && (
                  <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description (Optional)
                </label>
                <textarea
                  {...register('description')}
                  className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Describe your agent's strategy and goals..."
                  rows={4}
                  data-testid="input-description"
                />
                {errors.description && (
                  <p className="text-sm text-destructive mt-1">{errors.description.message}</p>
                )}
              </div>

              <button
                type="button"
                onClick={nextStep}
                className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                data-testid="button-next"
              >
                Next
              </button>
            </div>
          )}

          {/* Step 2: Venue Selection */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Select Trading Venue
              </h2>

              <div className="space-y-4">
                {['SPOT', 'GMX', 'HYPERLIQUID'].map((venue) => {
                  const isComingSoon = venue === 'GMX' || venue === 'HYPERLIQUID';
                  return (
                    <label
                      key={venue}
                      className={`block p-4 border-2 rounded-lg transition-colors ${
                        isComingSoon
                          ? 'border-border opacity-60 cursor-not-allowed'
                          : formData.venue === venue
                          ? 'border-primary bg-primary/10 cursor-pointer'
                          : 'border-border hover:border-primary/50 cursor-pointer'
                      }`}
                      data-testid={`label-venue-${venue}`}
                    >
                      <input
                        type="radio"
                        {...register('venue')}
                        value={venue}
                        className="sr-only"
                        disabled={isComingSoon}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-foreground">{venue}</h3>
                            {isComingSoon && (
                              <span className="px-2 py-1 text-xs font-medium bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded-full">
                                Coming Soon on Base
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {venue === 'SPOT' && 'DEX spot trading via Uniswap V3 on Base'}
                            {venue === 'GMX' && 'GMX perpetuals - Coming soon to Base network'}
                            {venue === 'HYPERLIQUID' && 'Hyperliquid perpetuals - Coming soon to Base'}
                          </p>
                        </div>
                        {formData.venue === venue && !isComingSoon && (
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <span className="text-primary-foreground text-sm">✓</span>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                  data-testid="button-back"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                  data-testid="button-next"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Strategy Weights */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Configure Strategy Weights
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Adjust these weights to customize your agent's trading behavior. Each weight ranges from 0 to 100.
              </p>

              <div className="space-y-6">
                {WEIGHT_LABELS.map((label, index) => (
                  <div key={index}>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm font-medium text-foreground">
                        {label}
                      </label>
                      <span className="text-sm text-primary font-semibold" data-testid={`text-weight-${index}`}>
                        {formData.weights?.[index] ?? 50}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={formData.weights?.[index] ?? 50}
                      onChange={(e) => {
                        const newWeights = [...(formData.weights || [])];
                        newWeights[index] = parseInt(e.target.value);
                        setValue('weights', newWeights, { shouldValidate: true });
                      }}
                      className="w-full"
                      data-testid={`input-weight-${index}`}
                    />
                  </div>
                ))}
                {/* Hidden input to register weights with RHF */}
                <input type="hidden" {...register('weights')} />
              </div>
              {errors.weights && (
                <p className="text-sm text-destructive mt-2">{errors.weights.message}</p>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                  data-testid="button-back"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                  data-testid="button-next"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 4: CT Accounts Selection */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-2xl font-semibold text-foreground">
                    Select Crypto Twitter Accounts
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose influencers to follow for trading signals. Selected: {selectedCtAccounts.size}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddCtAccount(!showAddCtAccount)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Account
                </button>
              </div>

              {/* Add CT Account Form */}
              {showAddCtAccount && (
                <div className="p-4 bg-background border-2 border-primary rounded-lg space-y-3">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium text-foreground">Add New CT Account</h3>
                    <button
                      type="button"
                      onClick={() => setShowAddCtAccount(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Twitter Username *
                    </label>
                    <input
                      type="text"
                      value={newCtUsername}
                      onChange={(e) => setNewCtUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="@elonmusk or elonmusk"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Display Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={newCtDisplayName}
                      onChange={(e) => setNewCtDisplayName(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Elon Musk"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Followers Count (Optional)
                    </label>
                    <input
                      type="number"
                      value={newCtFollowers}
                      onChange={(e) => setNewCtFollowers(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="1000000"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCtAccount}
                    disabled={addingCtAccount || !newCtUsername.trim()}
                    className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingCtAccount ? 'Adding...' : 'Add Account'}
                  </button>
                </div>
              )}

              {/* CT Accounts List */}
              {loadingCtAccounts ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : ctAccounts.length === 0 ? (
                <div className="text-center py-12 bg-background border border-border rounded-lg">
                  <Twitter className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No CT accounts yet. Add your first account above!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {ctAccounts
                    .filter(account => 
                      ctAccountSearch === '' ||
                      account.xUsername.toLowerCase().includes(ctAccountSearch.toLowerCase()) ||
                      account.displayName?.toLowerCase().includes(ctAccountSearch.toLowerCase())
                    )
                    .map((account) => (
                      <label
                        key={account.id}
                        className={`block p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                          selectedCtAccounts.has(account.id)
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCtAccounts.has(account.id)}
                          onChange={() => toggleCtAccount(account.id)}
                          className="sr-only"
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                              <Twitter className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground">
                                @{account.xUsername}
                              </h3>
                              {account.displayName && (
                                <p className="text-sm text-muted-foreground">
                                  {account.displayName}
                                </p>
                              )}
                              <div className="flex gap-3 mt-1">
                                {account.followersCount && (
                                  <span className="text-xs text-muted-foreground">
                                    {account.followersCount.toLocaleString()} followers
                                  </span>
                                )}
                                <span className="text-xs text-primary font-medium">
                                  Impact: {account.impactFactor.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                          {selectedCtAccounts.has(account.id) && (
                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                              <Check className="h-4 w-4 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                  data-testid="button-back"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                  data-testid="button-next"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Creator Wallet */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Connect Your Wallet
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {authenticated 
                  ? 'Your connected wallet will maintain custody of all funds.' 
                  : 'Connect your wallet or enter a wallet address manually. This wallet will maintain custody of all funds.'}
              </p>

              {!authenticated && (
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-md mb-4">
                  <p className="text-sm text-foreground mb-2">
                    For the best experience, connect your wallet using the button in the header.
                  </p>
                  <button
                    type="button"
                    onClick={login}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover-elevate active-elevate-2"
                    data-testid="button-connect-wallet-step"
                  >
                    <Wallet className="h-4 w-4" />
                    Connect Wallet
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Wallet Address *
                </label>
                <input
                  type="text"
                  {...register('creatorWallet')}
                  className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="0x..."
                  readOnly={authenticated && !!user?.wallet?.address}
                  data-testid="input-wallet"
                />
                {authenticated && user?.wallet?.address && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Using your connected wallet address
                  </p>
                )}
                {errors.creatorWallet && (
                  <p className="text-sm text-destructive mt-1">{errors.creatorWallet.message}</p>
                )}
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Profit Receiver Address *
                  <span className="text-xs text-muted-foreground ml-2">(Receives 20% of profits)</span>
                </label>
                <input
                  type="text"
                  {...register('profitReceiverAddress')}
                  className="w-full px-4 py-2 bg-background border border-border rounded-md text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0x... (defaults to your wallet)"
                  data-testid="input-profit-receiver"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  💰 This address will receive 20% of trading profits. By default, it's your wallet address. Change it if you want profits sent elsewhere.
                </p>
                {errors.profitReceiverAddress && (
                  <p className="text-sm text-destructive mt-1">{errors.profitReceiverAddress.message}</p>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                  data-testid="button-back"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors"
                  data-testid="button-next"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Review & Submit */}
          {step === 6 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Review Your Agent
              </h2>

              <div className="space-y-4">
                <div className="p-4 bg-background border border-border rounded-md">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Name</h3>
                  <p className="text-foreground" data-testid="text-review-name">{formData.name}</p>
                </div>

                {formData.description && (
                  <div className="p-4 bg-background border border-border rounded-md">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                    <p className="text-foreground">{formData.description}</p>
                  </div>
                )}

                <div className="p-4 bg-background border border-border rounded-md">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Venue</h3>
                  <p className="text-foreground" data-testid="text-review-venue">{formData.venue}</p>
                </div>

                <div className="p-4 bg-background border border-border rounded-md">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">CT Accounts</h3>
                  <div className="space-y-2 mt-2">
                    {Array.from(selectedCtAccounts).map(accountId => {
                      const account = ctAccounts.find(a => a.id === accountId);
                      return account ? (
                        <div key={accountId} className="flex items-center gap-2 text-sm">
                          <Twitter className="h-4 w-4 text-primary" />
                          <span className="text-foreground">@{account.xUsername}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>

                <div className="p-4 bg-background border border-border rounded-md">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Wallet Address</h3>
                  <p className="text-foreground font-mono text-sm" data-testid="text-review-wallet">
                    {formData.creatorWallet}
                  </p>
                </div>

                <div className="p-4 bg-background border border-border rounded-md">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Strategy Weights</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {WEIGHT_LABELS.map((label, index) => (
                      <div key={index} className="flex justify-between">
                        <span className="text-muted-foreground">{label}:</span>
                        <span className="text-foreground font-semibold">{formData.weights?.[index]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex-1 px-6 py-3 bg-secondary text-secondary-foreground rounded-md font-semibold hover:bg-secondary/90 transition-colors"
                  data-testid="button-back"
                  disabled={isSubmitting}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  data-testid="button-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create Agent'}
                </button>
              </div>
            </div>
          )}
        </form>
        </div>
      </div>

      {/* Deploy Modal */}
      {showDeployModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Agent Created!</h2>
              <p className="text-muted-foreground">
                Your trading agent has been created successfully. Now deploy it to start trading.
              </p>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleDeploy}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-md font-semibold hover-elevate active-elevate-2 transition-all"
                data-testid="button-deploy-agent"
              >
                <Rocket className="h-5 w-5" />
                Deploy Agent & Connect Safe Wallet
              </button>
              
              <button
                onClick={() => router.push('/creator')}
                className="w-full px-6 py-3 border border-border rounded-md font-medium text-foreground hover-elevate active-elevate-2 transition-all"
                data-testid="button-skip-deploy"
              >
                Deploy Later
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Deploying your agent will connect it to a Safe wallet for secure, non-custodial trading.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
