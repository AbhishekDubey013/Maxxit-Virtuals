# Maxxit DeFi Platform - Design Guidelines

## Design Approach: Hybrid System

**Selected Strategy:** Material Design 3 foundation with DeFi-specific customization, inspired by leading fintech platforms (Coinbase, Robinhood, Uniswap, Linear)

**Rationale:** Data-heavy trading platform requiring clear information hierarchy, trust signals, and real-time metric displays while maintaining modern, approachable aesthetics.

---

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary):**
- Background Primary: `222 15% 8%` (deep charcoal)
- Background Secondary: `222 15% 12%` (elevated surfaces)
- Background Tertiary: `222 12% 16%` (cards, panels)
- Primary Brand: `142 76% 45%` (vibrant green for positive actions, gains)
- Primary Variant: `142 60% 35%` (darker green for hover states)
- Accent Critical: `0 84% 60%` (red for losses, alerts, stop-loss)
- Accent Warning: `38 92% 50%` (amber for warnings, pending states)
- Text Primary: `0 0% 98%` (high contrast white)
- Text Secondary: `220 9% 65%` (muted gray for labels)
- Text Tertiary: `220 9% 45%` (subtle gray for metadata)
- Border Subtle: `220 13% 20%` (card dividers)
- Success Glow: `142 76% 45%` with 20% opacity for metric highlights

**Light Mode (Secondary):**
- Background Primary: `0 0% 98%`
- Background Secondary: `220 14% 96%`
- Primary Brand: `142 71% 38%`
- Text Primary: `222 15% 12%`

### B. Typography

**Font System:**
- Primary: Inter (400, 500, 600, 700) via Google Fonts
- Mono: JetBrains Mono (400, 500) for addresses, numbers, code

**Type Scale:**
- Display: text-5xl/text-6xl font-bold tracking-tight (hero headlines)
- H1: text-4xl font-bold tracking-tight (page titles)
- H2: text-3xl font-semibold (section headers)
- H3: text-xl font-semibold (card titles)
- Body Large: text-base (primary content)
- Body: text-sm (default UI text)
- Caption: text-xs text-secondary (labels, metadata)
- Numbers: font-mono text-base/text-lg (metrics, prices, APR)

### C. Layout System

**Spacing Primitives:** Use Tailwind units of `2, 3, 4, 6, 8, 12, 16, 20, 24`

**Grid System:**
- Container: `max-w-7xl mx-auto px-4`
- Dashboard Layouts: `grid-cols-12` with responsive breakpoints
- Card Grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` for agent cards
- Metrics Panels: `grid-cols-2 md:grid-cols-4` for stat displays
- Sidebar + Main: `grid-cols-[240px_1fr]` on lg+ breakpoints

**Consistent Patterns:**
- Section Padding: `py-12 md:py-16` (marketing), `py-6 md:py-8` (dashboard)
- Card Padding: `p-6`
- Spacing Between Sections: `space-y-12` (marketing), `space-y-6` (dashboard)

### D. Component Library

**Navigation:**
- Top Nav: Fixed header with blur backdrop (`bg-background/80 backdrop-blur-xl border-b`)
- Wallet Connect: Prominent button with address truncation and Identicon
- Dashboard Sidebar: Collapsible with icons (Agents, Deployments, Positions, Billing)

**Data Display:**
- Metric Cards: Glass-morphism effect (`bg-secondary/50 backdrop-blur border border-subtle rounded-2xl p-6`)
- Performance Charts: Recharts/Chart.js with green/red gradients for PnL visualization
- Agent Cards: Image header (placeholder gradient) + metrics grid + CTA button
- Position Tables: Sortable columns, inline status badges, expandable rows for details
- Leaderboard: Ranked list with APR/Sharpe prominently displayed, subtle hover elevation

**Forms & Inputs:**
- Input Fields: `bg-tertiary border border-subtle rounded-lg px-4 py-3 focus:border-primary`
- Sliders: For weight adjustments (0-100 validation) with live value display
- Dropdowns: Native select styled or Radix Select for venues/filters
- Toggle Switches: For deployment pause/resume states

**Status Indicators:**
- Badge System: Rounded-full badges for ACTIVE (green), PAUSED (amber), DRAFT (gray)
- Live Indicators: Pulsing dot for active positions (`animate-pulse bg-green-500`)
- Progress Bars: For trial periods, subscription status

**CTAs & Buttons:**
- Primary: `bg-primary hover:bg-primary-variant text-white rounded-lg px-6 py-3 font-semibold`
- Secondary: `border border-primary/50 text-primary hover:bg-primary/10 rounded-lg px-6 py-3`
- Ghost on Images: `bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-lg px-6 py-3` (no custom hover states)
- Destructive: `bg-red-600 hover:bg-red-700 text-white`

**Overlays:**
- Modals: Centered with backdrop blur (`bg-black/60 backdrop-blur-sm`)
- Toasts: Top-right notifications with auto-dismiss (success green, error red)
- Tooltips: Small popover on metric hover explaining calculation

### E. Animation & Motion

**Minimal, Purposeful Only:**
- Page Transitions: Subtle fade-in on route change (`animate-in fade-in duration-200`)
- Card Hover: Slight elevation lift (`hover:shadow-lg transition-shadow duration-200`)
- Number Counters: Animated count-up for APR/PnL on first load (react-countup)
- Chart Animations: Staggered bar/line reveal on initial render
- Loading States: Skeleton screens matching content structure (not spinners)

**Avoid:** Excessive scroll animations, parallax effects, decorative motion

---

## Page-Specific Layouts

### Marketing/Landing Page

**Hero Section (90vh):**
- Large headline: "Agentic DeFi Trading, Powered by Crypto Twitter Signals"
- Subheadline explaining value prop
- Dual CTAs: "Explore Agents" (primary) + "How It Works" (secondary ghost on gradient bg)
- Background: Subtle animated gradient mesh or abstract chart visualization
- Trust badge: "Non-Custodial • Transparent • Performance-Driven"

**Agent Showcase Section:**
- 3-column grid of top-performing agents
- Each card: Agent name, venue badge, 30d APR (large), Sharpe ratio, mini sparkline chart
- "View All Agents" CTA

**How It Works (3-Step):**
- Visual flow: "1. Connect Safe Wallet → 2. Deploy Agent → 3. Earn Returns"
- Icons for each step with brief explanation

**Metrics Dashboard Preview:**
- Full-width screenshot/mockup of dashboard with blur-out effect
- Overlay text: "Real-time Position Monitoring & Analytics"

**Pricing/Billing Transparency:**
- 2-column layout: Infrastructure fee ($0.20/trade) + Profit share (10% on wins)
- Monthly subscription ($20) with trial callout
- "No hidden fees" trust signal

**Footer:**
- Links: Docs, GitHub, Discord, Twitter
- Disclaimer about DeFi risks
- Newsletter signup (email input + button)

### Dashboard Application

**Agent Leaderboard:**
- Filter bar: Venue dropdown, Status toggle, Sort by APR/Sharpe
- Table/Card hybrid: Sortable columns, expandable rows showing strategy weights
- Pagination: 20 per page

**Agent Detail Page:**
- Header: Agent name, status badge, creator wallet (truncated)
- Performance Panel: APR 30d/90d/SI, Sharpe ratio, max drawdown
- Charts: Equity curve (line chart), Monthly returns (bar chart)
- Recent Signals Table: Token, side, size, timestamp, linked positions
- Deploy CTA: Sticky footer on mobile, sidebar card on desktop

**My Deployments:**
- Card grid showing: Agent name, Safe wallet, subscription status, trial countdown
- Quick actions: Pause/Resume toggle, Settings (gear icon)
- Active positions summary per deployment

**Position Monitor:**
- Live table: Token, Side, Entry price, Current price, PnL (%, $), SL/TP levels
- Color coding: Green rows for profit, red for loss, gray for closed
- Filter by deployment, status (open/closed), date range

**Billing History:**
- Timeline view: Subscription charges, infra fees, profit shares
- Grouped by month with expandable details
- Download CSV option

---

## Images & Assets

**Hero Image:** Abstract visualization of trading signals/neural network nodes connected to crypto tokens (use placeholder service or AI-generated abstract art)

**Agent Cards:** Each agent gets a unique generative gradient header based on agent ID hash (purple-blue, green-teal, orange-red variations)

**Icons:** Use Heroicons (outline variant) for UI elements - consistent stroke weight, 24px default size

**Charts:** Use subtle grid lines, no heavy borders, green/red fills with 40% opacity for area charts

---

## Accessibility & Dark Mode

- Maintain WCAG AA contrast ratios (4.5:1 for text)
- All interactive elements have 44px min touch target
- Focus rings: `ring-2 ring-primary ring-offset-2 ring-offset-background`
- Dark mode is primary experience; light mode toggle in user menu
- Form inputs have matching dark backgrounds (`bg-tertiary`) with visible borders

---

**Design Principle:** Trust through transparency - every metric, fee, and calculation is visible and explained. The interface should feel like a professional trading terminal, not a flashy crypto casino.