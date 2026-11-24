import {
  FlaskConical,
  Terminal,
  LayoutDashboard,
  Building2,
  Server,
  BrainCircuit,
  ShieldCheck,
  FileText,
  Wallet,
  Gauge,
  LineChart,
  Search,
  ScrollText,
  Bell,
  Receipt,
  Settings,
  Network,
  KeyRound,
  UserCog,
  DownloadCloud,
  Users,
  Inbox,
  Flag,
  HeartPulse,
  Workflow,
  Layers,
  Activity,
  Boxes,
  Hammer,
  Rocket,
  Plug,
  Package,
  Database,
  GraduationCap,
  Cable,
  Library,
  CreditCard,
  BookOpen,
  Sigma,
  Shrink,
  Cpu,
  Radio,
  Bot,
  Blocks,
  Orbit,
  type LucideIcon,
  Globe2,
  ClipboardCheck,
  Anvil, FolderGit2, HardDrive, MemoryStick, Table2, Repeat, ListOrdered, GitCompare,
} from "lucide-react";
import { RefineryGlyph } from "@/components/refinery/RefineryIcon";
import { ArenaGlyph, ConductorGlyph, ForgeGlyph, ProtocolsGlyph, TracesGlyph } from "@/components/agents/AgentGlyphs";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Sub-routes that belong to a sibling item and must not light this one up. */
  excludes?: string[];
  /** Small heading shown above this item when it differs from the previous item's section. */
  section?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  /** Only platform operators see this group. Customer org admins never do. */
  operatorOnly?: boolean;
};

/** Always visible, sits above the collapsible groups. */
export const TOP_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pipeline Studio", href: "/pipeline-studio", icon: Workflow },
];

/**
 * Customer-facing groups first (what an organization uses day to day),
 * operator-only surfaces last under "Platform Administration".
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "governance",
    label: "Governance",
    icon: ShieldCheck,
    items: [
      { label: "Policy Studio", href: "/policy-studio", icon: Layers },
      { label: "Policy Builder", href: "/policies", icon: ShieldCheck },
      { label: "Document Policies", href: "/document-policies", icon: FileText },
      { label: "Budget Management", href: "/budgets", icon: Wallet },
      { label: "Quota Management", href: "/quotas", icon: Gauge },
      { label: "Cost Optimization", href: "/optimization", icon: Shrink },
    ],
  },
  {
    id: "agents",
    label: "Agent OS",
    icon: ArenaGlyph,
    items: [
      { label: "Control Arena", href: "/agents", icon: ArenaGlyph, excludes: ["/agents/constellation", "/agents/registry", "/agents/forge", "/agents/conductor", "/agents/traces", "/agents/adapters", "/agents/protocols", "/agents/approvals", "/agents/context", "/agents/evals", "/agents/cli"], section: "Govern" },
      { label: "Constellation", href: "/agents/constellation", icon: Orbit },
      { label: "Agents", href: "/agents/registry", icon: Bot },
      { label: "Approvals", href: "/agents/approvals", icon: ClipboardCheck },
      { label: "Agent Traces", href: "/agents/traces", icon: TracesGlyph },
      { label: "Evals", href: "/agents/evals", icon: FlaskConical },
      { label: "Agent Forge", href: "/agents/forge", icon: ForgeGlyph, section: "Build" },
      { label: "Conductor", href: "/agents/conductor", icon: ConductorGlyph },
      { label: "Context", href: "/agents/context", icon: Database },
      { label: "Framework Adapters", href: "/agents/adapters", icon: Blocks },
      { label: "CLI", href: "/agents/cli", icon: Terminal },
      { label: "Protocols", href: "/agents/protocols", icon: ProtocolsGlyph, section: "Connect" },
    ],
  },
  {
    id: "models",
    label: "Models and Data",
    icon: BrainCircuit,
    items: [
      { label: "Provider Registry", href: "/providers", icon: Server, section: "Models" },
      { label: "Model Registry", href: "/models", icon: BrainCircuit },
      { label: "Model Versions", href: "/mlops/models", icon: Package },
      { label: "Crucible", href: "/crucible", icon: Anvil },
      { label: "Knowledge", href: "/mlops/knowledge", icon: BookOpen },
      { label: "Refinery", href: "/refinery", icon: RefineryGlyph, section: "Data" },
      { label: "Data and AI Services", href: "/mlops/data-services", icon: Database },
    ],
  },
  {
    id: "infrastructure",
    label: "MLOps and Infrastructure",
    icon: Server,
    items: [
      { label: "Overview", href: "/mlops", icon: Boxes, excludes: ["/mlops/pipelines", "/mlops/functions", "/mlops/runs", "/mlops/deployments", "/mlops/gpu", "/mlops/build-agents", "/mlops/integrations", "/mlops/mcp-servers", "/mlops/data-services", "/mlops/models", "/mlops/payments", "/mlops/knowledge", "/mlops/observability", "/mlops/learn", "/mlops/settings"] },
      { label: "Deployments", href: "/mlops/deployments", icon: Rocket },
      { label: "GPU and CUDA", href: "/mlops/gpu", icon: Cpu },
      { label: "Pipelines", href: "/mlops/pipelines", icon: Workflow, section: "Build and release" },
      { label: "Functions", href: "/mlops/functions", icon: Sigma },
      { label: "Runs", href: "/mlops/runs", icon: Activity },
      { label: "Build Agents", href: "/mlops/build-agents", icon: Hammer },
      { label: "Integrations", href: "/mlops/integrations", icon: Plug, section: "Connect" },
      { label: "MCP Servers", href: "/mlops/mcp-servers", icon: Cable },
      { label: "Learn", href: "/mlops/learn", icon: GraduationCap, section: "Help" },
    ],
  },
  {
    id: "observability",
    label: "Observability",
    icon: LineChart,
    items: [
      { label: "Analytics Explorer", href: "/analytics", icon: LineChart },
      { label: "Request Trace", href: "/trace-studio", icon: Activity },
      { label: "Usage Explorer", href: "/usage", icon: Search },
      { label: "Audit Explorer", href: "/audit", icon: ScrollText },
    ],
  },
  {
    id: "organization",
    label: "Organization",
    icon: Building2,
    items: [
      { label: "Tenant Management", href: "/tenants", icon: Building2 },
      { label: "People and access", href: "/people", icon: Users },
      { label: "Roles and permissions", href: "/org-roles", icon: ShieldCheck },
      { label: "Billing", href: "/billing", icon: Receipt },
      { label: "Payments", href: "/mlops/payments", icon: CreditCard },
      { label: "Notification Center", href: "/notifications", icon: Bell },
    ],
  },
  {
    id: "developer",
    label: "Developer",
    icon: KeyRound,
    items: [
      { label: "API Keys", href: "/api-keys", icon: KeyRound },
      { label: "Service Accounts", href: "/service-accounts", icon: UserCog },
      { label: "SDK Downloads", href: "/sdks", icon: DownloadCloud },
    ],
  },
  {
    id: "platform",
    label: "Platform Administration",
    icon: Settings,
    operatorOnly: true,
    items: [
      { label: "System Settings", href: "/settings", icon: Settings },
      { label: "Cluster Management", href: "/cluster", icon: Network },
      { label: "Connector Catalogue", href: "/platform/connectors", icon: Plug },
      { label: "Model Library", href: "/platform/library", icon: Library },
      { label: "Access requests", href: "/access-requests", icon: Inbox },
      { label: "Catalogue requests", href: "/platform/approvals", icon: ClipboardCheck },
      { label: "Role Management", href: "/roles", icon: ShieldCheck },
      { label: "Feature Flags", href: "/feature-flags", icon: Flag },
      { label: "Platform Health", href: "/health", icon: HeartPulse },
    ],
  },
];

/** Refinery pages reached through its in-page tab bar. They exist here so breadcrumbs resolve. */
export const REFINERY_PAGES: NavItem[] = [
  { label: "Overview", href: "/refinery", icon: LayoutDashboard },
  { label: "Connections", href: "/refinery/connections", icon: Plug },
  { label: "Datasets", href: "/refinery/datasets", icon: Database },
  { label: "Recipes", href: "/refinery/recipes", icon: Layers },
  { label: "Runs", href: "/refinery/runs", icon: Activity },
  { label: "Runners", href: "/refinery/runners", icon: Cpu },
  { label: "Streams", href: "/refinery/streams", icon: Radio },
  { label: "Data location", href: "/refinery/sovereignty", icon: Globe2 },
  { label: "Activity", href: "/refinery/activity", icon: ScrollText },
];

/** Crucible pages reached through its in-page tab bar. */
export const CRUCIBLE_PAGES: NavItem[] = [
  { label: "Overview", href: "/crucible", icon: Gauge },
  { label: "Experiments", href: "/crucible/experiments", icon: FlaskConical },
  { label: "Jobs", href: "/crucible/jobs", icon: ListOrdered },
  { label: "Continuous training", href: "/crucible/continuous", icon: Repeat },
  { label: "Lineage", href: "/crucible/lineage", icon: Network },
  { label: "Datasets", href: "/crucible/datasets", icon: Table2 },
  { label: "Projects", href: "/crucible/projects", icon: FolderGit2 },
  { label: "Storage", href: "/crucible/storage", icon: HardDrive },
  { label: "Memory planner", href: "/crucible/memory", icon: MemoryStick },
  { label: "Adapters", href: "/crucible/adapters", icon: Cpu },
];

/** Agent OS pages reached through its in-page tab bar. They exist here so breadcrumbs resolve. */
export const AGENT_PAGES: NavItem[] = [
  { label: "Control Arena", href: "/agents", icon: ArenaGlyph },
  { label: "Constellation", href: "/agents/constellation", icon: Orbit },
  { label: "Agents", href: "/agents/registry", icon: Bot },
  { label: "Approvals", href: "/agents/approvals", icon: ClipboardCheck },
  { label: "Agent Traces", href: "/agents/traces", icon: TracesGlyph },
  { label: "Evals", href: "/agents/evals", icon: FlaskConical },
  { label: "Agent Forge", href: "/agents/forge", icon: ForgeGlyph },
  { label: "Conductor", href: "/agents/conductor", icon: ConductorGlyph },
  { label: "Context", href: "/agents/context", icon: Database },
  { label: "Framework Adapters", href: "/agents/adapters", icon: Blocks },
  { label: "CLI", href: "/agents/cli", icon: Terminal },
  { label: "Protocols", href: "/agents/protocols", icon: ProtocolsGlyph },
];

/** MLOps pages reached through the in-page tab bar. They exist here so breadcrumbs resolve. */
export const MLOPS_PAGES: NavItem[] = [
  { label: "Overview", href: "/mlops", icon: Boxes },
  { label: "Integrations", href: "/mlops/integrations", icon: Plug },
  { label: "MCP servers", href: "/mlops/mcp-servers", icon: Cable },
  { label: "Models", href: "/mlops/models", icon: Package },
  { label: "Knowledge", href: "/mlops/knowledge", icon: BookOpen },
  { label: "Payments", href: "/mlops/payments", icon: CreditCard },
  { label: "Deployments", href: "/mlops/deployments", icon: Rocket },
  { label: "GPU and CUDA", href: "/mlops/gpu", icon: Cpu },
  { label: "Pipelines", href: "/mlops/pipelines", icon: Workflow },
  { label: "Functions", href: "/mlops/functions", icon: Sigma },
  { label: "Runs", href: "/mlops/runs", icon: Activity },
  { label: "Data and AI services", href: "/mlops/data-services", icon: Database },
  { label: "Observability", href: "/mlops/observability", icon: LineChart },
  { label: "Build Agents", href: "/mlops/build-agents", icon: Hammer },
  { label: "Learn", href: "/mlops/learn", icon: GraduationCap },
  { label: "Settings and access", href: "/mlops/settings", icon: Settings },
];

export const ALL_NAV_ITEMS: NavItem[] = [
  ...TOP_NAV,
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...REFINERY_PAGES.map((i) => ({ ...i, label: i.href === "/refinery" ? "Refinery" : `Refinery / ${i.label}` })),
  ...AGENT_PAGES.map((i) => ({ ...i, label: i.href === "/agents" ? "Agent OS" : `Agent OS / ${i.label}` })),
  ...CRUCIBLE_PAGES.map((i) => ({ ...i, label: i.href === "/crucible" ? "Crucible" : `Crucible / ${i.label}` })),
  ...MLOPS_PAGES.map((i) => ({ ...i, label: i.href === "/mlops" ? "MLOps" : `MLOps / ${i.label}` })),
  { label: "New Budget", href: "/budgets/new", icon: Wallet },
  { label: "Account settings", href: "/account", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function itemActive(pathname: string, item: NavItem) {
  return isActive(pathname, item.href) && !(item.excludes ?? []).some((x) => isActive(pathname, x));
}

export const OPERATOR_PREFIXES = NAV_GROUPS.filter((g) => g.operatorOnly).flatMap((g) => g.items.map((i) => i.href));
