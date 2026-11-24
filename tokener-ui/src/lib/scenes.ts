import {
  AppWindow, KeyRound, ShieldCheck, Wallet, Route, Receipt, Network, Fingerprint, EyeOff, Scale, ShieldAlert, Gauge,
  Bell, Lock, Upload, ScanText, FileCheck, LineChart, UserCheck, ListChecks, Terminal, Server, Rocket, Undo2, Activity, Siren,
  Clock, AlarmClock, Sparkles, Mail, Smartphone, Bot, PackageCheck, TerminalSquare, Blocks, FolderOpen, Wrench,
  Layers, ScanSearch, MessagesSquare, Quote, Plug, Search, Database, Cpu, FileText, Cloud, Boxes, Workflow, FlaskConical, Radar,
} from "lucide-react";
import { siPaypal, siTwilio, siGithub, siSlack, siAmazons3, siPostgresql, siApachekafka, siMinio, siSnowflake } from "simple-icons";
import type { IconRef } from "@/components/studio/types";
import { brand } from "@/lib/industries";

export type SceneNode = { id: string; x: number; y: number; label: string; sub?: string; icon: IconRef; core?: boolean; /** Draw the tok∑ner mark instead of an icon. */ mark?: boolean };
export type SceneEdge = { id: string; from: string; to: string };
export type SceneStep = { edge: string; at: number; dur: number; tone?: "ok" | "warn" | "bad" | "info"; verdict?: string };
export type Scene = {
  id: string;
  cycle: number;
  height?: number;
  maxWidth?: number;
  alt: string;
  caption: string;
  nodes: SceneNode[];
  edges: SceneEdge[];
  steps: SceneStep[];
};

const L = (lucide: any): IconRef => ({ lucide });
const B = (name: string): IconRef => brand(name).icon;
const SI = (i: { title: string; path: string; hex: string }): IconRef => ({ si: i });
const n = (id: string, x: number, y: number, label: string, icon: IconRef, sub?: string, core?: boolean): SceneNode => ({ id, x, y, label, sub, icon, core });
const e = (from: string, to: string): SceneEdge => ({ id: `${from}-${to}`, from, to });
const s = (from: string, to: string, at: number, tone?: SceneStep["tone"], verdict?: string, dur = 0.9): SceneStep => ({ edge: `${from}-${to}`, at, dur, tone, verdict });

export const SCENES: Record<string, Scene> = {
  gateway: {
    id: "gateway", cycle: 15, alt: "A request passes identity, policy, budget and routing checks before reaching a provider, and is metered.",
    caption: "Three requests on a loop: one allowed, one denied by policy, one rerouted when a provider fails.",
    nodes: [
      n("app", 90, 150, "Your app", L(AppWindow), "OpenAI SDK"),
      n("auth", 255, 150, "Identity", L(KeyRound), "key or SSO"),
      n("policy", 420, 150, "Policy", L(ShieldCheck), "rules v4"),
      n("budget", 585, 150, "Budget", L(Wallet), "project cap"),
      n("router", 750, 150, "Router", L(Route), "health aware", true),
      n("openai", 915, 70, "OpenAI", B("OpenAI"), "primary"),
      n("anthropic", 915, 230, "Anthropic", B("Anthropic"), "fallback"),
      n("ledger", 750, 300, "Ledger", L(Receipt), "tokens, cost"),
    ],
    edges: [e("app", "auth"), e("auth", "policy"), e("policy", "budget"), e("budget", "router"), e("router", "openai"), e("router", "anthropic"), e("router", "ledger")],
    steps: [
      s("app", "auth", 0.3), s("auth", "policy", 1.2), s("policy", "budget", 2.1, "ok", "allowed"), s("budget", "router", 3.0), s("router", "openai", 3.9, "ok", "200 in 412 ms"), s("router", "ledger", 5.0, "info", "metered"),
      s("app", "auth", 6.3), s("auth", "policy", 7.2, "bad", "403 denied"),
      s("app", "auth", 9.0), s("auth", "policy", 9.9), s("policy", "budget", 10.8), s("budget", "router", 11.7), s("router", "anthropic", 12.6, "warn", "failover"), s("router", "ledger", 13.7, "info", "metered", 0.9),
    ],
  },

  policy: {
    id: "policy", cycle: 15, alt: "Rules are evaluated for each request, and the decision forwards, masks or rejects it.",
    caption: "The same request context is evaluated against every rule. The decision is forward, mask or reject.",
    nodes: [
      n("req", 90, 180, "Request", L(AppWindow), "chat-default"),
      n("ctx", 255, 180, "Context", L(Fingerprint), "user, project"),
      n("r1", 450, 70, "Model list", L(ShieldCheck), "approved-models"),
      n("r2", 450, 180, "PII in prompt", L(EyeOff), "detector"),
      n("r3", 450, 290, "Spend cap", L(Wallet), "project budget"),
      n("dec", 670, 180, "Decision", L(Scale), "explainable", true),
      n("allow", 900, 70, "Forward", L(Route), "to provider"),
      n("mask", 900, 180, "Mask PII", L(EyeOff), "then forward"),
      n("deny", 900, 290, "Reject", L(ShieldAlert), "403"),
    ],
    edges: [e("req", "ctx"), e("ctx", "r1"), e("ctx", "r2"), e("ctx", "r3"), e("r1", "dec"), e("r2", "dec"), e("r3", "dec"), e("dec", "allow"), e("dec", "mask"), e("dec", "deny")],
    steps: [
      s("req", "ctx", 0.3), s("ctx", "r1", 1.2, "ok", "model allowed"), s("r1", "dec", 2.1), s("dec", "allow", 3.0, "ok", "forwarded"),
      s("req", "ctx", 4.8), s("ctx", "r2", 5.7, "warn", "email found"), s("r2", "dec", 6.6, "warn"), s("dec", "mask", 7.5, "warn", "PII masked"),
      s("req", "ctx", 9.3), s("ctx", "r3", 10.2, "bad", "cap exceeded"), s("r3", "dec", 11.1, "bad"), s("dec", "deny", 12.0, "bad", "policy_denied"),
    ],
  },

  budgets: {
    id: "budgets", cycle: 15, alt: "Usage events feed a budget engine that warns, throttles or blocks and notifies the right people.",
    caption: "Usage is counted as it happens, so the budget acts before the overrun, not after the invoice.",
    nodes: [
      n("gw", 90, 180, "Gateway", L(Network), "every request"),
      n("ledger", 270, 180, "Usage ledger", L(Receipt), "tokens, cost"),
      n("engine", 470, 180, "Budget engine", L(Gauge), "80, 95, 100 percent", true),
      n("warn", 690, 70, "Warn", L(Bell), "alert only"),
      n("throttle", 690, 180, "Throttle", L(Gauge), "429 Retry-After"),
      n("block", 690, 290, "Block", L(Lock), "402 budget_exceeded"),
      n("slack", 900, 70, "Slack", B("Slack"), "#ai-spend"),
      n("pd", 900, 290, "PagerDuty", B("PagerDuty"), "on-call"),
    ],
    edges: [e("gw", "ledger"), e("ledger", "engine"), e("engine", "warn"), e("engine", "throttle"), e("engine", "block"), e("warn", "slack"), e("block", "pd")],
    steps: [
      s("gw", "ledger", 0.3, "info"), s("ledger", "engine", 1.3, "ok", "68 percent"), s("engine", "warn", 2.4, "warn", "80 percent"), s("warn", "slack", 3.5, "info", "posted"),
      s("gw", "ledger", 5.2, "info"), s("ledger", "engine", 6.2, "warn", "96 percent"), s("engine", "throttle", 7.3, "warn", "throttled"),
      s("gw", "ledger", 9.0, "info"), s("ledger", "engine", 10.0, "bad", "100 percent"), s("engine", "block", 11.1, "bad", "blocked"), s("block", "pd", 12.2, "info", "paged"),
    ],
  },

  documents: {
    id: "documents", cycle: 15, alt: "A document is scanned, extracted, masked and stored once as a canonical document that every provider reuses.",
    caption: "Process once, reuse everywhere. A flagged file stops at the scan and never reaches a model.",
    nodes: [
      n("upload", 90, 180, "Upload", L(Upload), "PDF, Office, image"),
      n("scan", 255, 180, "Scan", L(ShieldCheck), "malware and type"),
      n("ocr", 420, 180, "Extract", L(ScanText), "text, tables, OCR"),
      n("mask", 585, 180, "Mask PII", L(EyeOff), "by policy"),
      n("canon", 750, 180, "Canonical doc", L(FileCheck), "stored once", true),
      n("p1", 915, 70, "OpenAI", B("OpenAI"), "summarise"),
      n("p2", 915, 290, "Anthropic", B("Anthropic"), "extract fields"),
    ],
    edges: [e("upload", "scan"), e("scan", "ocr"), e("ocr", "mask"), e("mask", "canon"), e("canon", "p1"), e("canon", "p2")],
    steps: [
      s("upload", "scan", 0.3), s("scan", "ocr", 1.2, "ok", "clean"), s("ocr", "mask", 2.1), s("mask", "canon", 3.0, "warn", "3 fields masked"), s("canon", "p1", 4.2, "info", "summary"), s("canon", "p2", 5.0, "info", "reused"),
      s("upload", "scan", 8.6, "bad", "malware found", 1.0),
    ],
  },

  observability: {
    id: "observability", cycle: 13, alt: "Gateway events stream into an analytics store and out to dashboards, metrics tools and paging.",
    caption: "Every request becomes an event. Operations tools get the same numbers the console shows.",
    nodes: [
      n("gw", 90, 180, "Gateway", L(Network), "events"),
      n("stream", 270, 180, "Event stream", B("Apache Kafka"), "ordered, durable"),
      n("store", 450, 180, "Usage store", B("ClickHouse"), "columnar"),
      n("api", 650, 180, "Analytics", L(LineChart), "cost, tokens, latency", true),
      n("graf", 880, 60, "Grafana", B("Grafana"), "dashboards"),
      n("dd", 880, 180, "Datadog", B("Datadog"), "metrics"),
      n("pd", 880, 300, "PagerDuty", B("PagerDuty"), "anomalies"),
    ],
    edges: [e("gw", "stream"), e("stream", "store"), e("store", "api"), e("api", "graf"), e("api", "dd"), e("api", "pd")],
    steps: [
      s("gw", "stream", 0.3, "info"), s("stream", "store", 1.3, "info", "batched"), s("store", "api", 2.3), s("api", "graf", 3.3, "ok", "live"), s("api", "dd", 4.2, "ok", "exported"),
      s("gw", "stream", 6.5, "info"), s("stream", "store", 7.5, "info"), s("store", "api", 8.5, "warn", "spike"), s("api", "pd", 9.6, "bad", "anomaly paged"),
    ],
  },

  refinery: {
    id: "refinery", cycle: 15, alt: "Raw files, tickets and a change stream enter a recipe, run on a pool of runners, and leave as clean files, a synced table and a dataset version for the training pipeline.",
    caption: "Three runs on a loop: a large file set to Parquet, a change stream into a table, and an upload with rejects kept aside.",
    nodes: [
      n("s3", 90, 70, "Raw files", SI(siAmazons3), "object storage"),
      n("zd", 90, 180, "Tickets", B("Zendesk"), "export or upload"),
      n("kf", 90, 300, "Change stream", SI(siApachekafka), "Any stream or CDC"),
      n("rcp", 350, 180, "Recipe", L(Workflow), "versioned", true),
      n("pool", 580, 180, "Runner pool", L(Cpu), "your network"),
      n("minio", 830, 70, "Clean files", SI(siMinio), "Parquet"),
      n("pg", 830, 180, "Synced table", SI(siPostgresql), "upsert"),
      n("train", 830, 300, "Training job", L(Rocket), "reads a version"),
    ],
    edges: [e("s3", "rcp"), e("zd", "rcp"), e("kf", "rcp"), e("rcp", "pool"), e("pool", "minio"), e("pool", "pg"), e("pool", "train")],
    steps: [
      s("s3", "rcp", 0.3, "info", "large input"), s("rcp", "pool", 1.3, "ok", "plan: Spark"), s("pool", "minio", 2.3, "ok", "Parquet"), s("pool", "train", 3.3, "info", "dataset version"),
      s("kf", "rcp", 5.4, "info", "change event"), s("rcp", "pool", 6.4, "ok", "streamable steps"), s("pool", "pg", 7.4, "ok", "upsert by key"),
      s("zd", "rcp", 9.3, "info", "CSV upload"), s("rcp", "pool", 10.3, "warn", "rejects kept"), s("pool", "minio", 11.4, "ok", "JSON Lines"),
    ],
  },

  failover: {
    id: "failover", cycle: 15, alt: "The router skips a failing provider and sends traffic to a healthy one, or keeps sensitive traffic on a self-hosted model.",
    caption: "Health-aware routing: healthy primary, a timeout that triggers failover, then sensitive traffic kept in your own network.",
    nodes: [
      n("app", 90, 180, "Your app", L(AppWindow), "no code change"),
      n("gw", 320, 180, "Router", L(Route), "health aware", true),
      n("openai", 620, 60, "OpenAI", B("OpenAI"), "priority 1"),
      n("anthropic", 620, 180, "Anthropic", B("Anthropic"), "priority 2"),
      n("ollama", 620, 300, "Ollama", B("Ollama"), "in your VPC"),
    ],
    edges: [e("app", "gw"), e("gw", "openai"), e("gw", "anthropic"), e("gw", "ollama")],
    steps: [
      s("app", "gw", 0.3), s("gw", "openai", 1.4, "ok", "200 in 310 ms"),
      s("app", "gw", 4.5), s("gw", "openai", 5.6, "bad", "timeout"), s("gw", "anthropic", 7.0, "warn", "retried here"),
      s("app", "gw", 10.0), s("gw", "ollama", 11.1, "info", "stays in VPC"),
    ],
  },

  mlops: {
    id: "mlops", cycle: 16, height: 320, alt: "A model moves from source through build, registry and an approval gate to a cluster, with automatic rollback on failure.",
    caption: "Source to endpoint with a production approval gate, then metrics watching for an SLO breach and rolling back.",
    nodes: [
      n("src", 90, 95, "Model source", B("Hugging Face"), "weights"),
      n("build", 255, 95, "Build", B("Docker"), "image"),
      n("reg", 420, 95, "Registry", B("Harbor"), "signed image"),
      n("gate", 585, 95, "Approval", L(UserCheck), "production gate", true),
      n("deploy", 750, 95, "Deploy", B("Knative"), "canary"),
      n("k8s", 915, 95, "Kubernetes", B("Kubernetes"), "namespace"),
      n("prom", 915, 255, "Prometheus", B("Prometheus"), "SLO watch"),
      n("rollback", 750, 255, "Rollback", L(Undo2), "previous version"),
    ],
    edges: [e("src", "build"), e("build", "reg"), e("reg", "gate"), e("gate", "deploy"), e("deploy", "k8s"), e("k8s", "prom"), e("prom", "rollback")],
    steps: [
      s("src", "build", 0.3), s("build", "reg", 1.2), s("reg", "gate", 2.1, "ok", "scan passed"), s("gate", "deploy", 3.4, "ok", "approved"), s("deploy", "k8s", 4.3, "ok", "rolled out"), s("k8s", "prom", 5.3, "info", "healthy"),
      s("k8s", "prom", 9.0, "warn", "p99 breach"), s("prom", "rollback", 10.0, "bad", "rolling back"),
    ],
  },

  agent: {
    id: "agent", cycle: 15, alt: "A build agent on a customer server polls the control plane over HTTPS, runs signed jobs locally and returns scrubbed results.",
    caption: "Outbound only: the agent asks for work, verifies the signature, runs it next to your systems and reports back.",
    nodes: [
      n("cp", 110, 90, "Control plane", L(Server), "tok∑ner", true),
      n("audit", 110, 270, "Audit log", L(ListChecks), "scrubbed"),
      n("agent", 400, 180, "Build agent", L(Terminal), "your server"),
      n("docker", 720, 70, "Docker", B("Docker"), "containers"),
      n("k8s", 720, 180, "Kubernetes", B("Kubernetes"), "private cluster"),
      n("gpu", 720, 290, "GPU node", B("NVIDIA"), "inference"),
    ],
    edges: [e("agent", "cp"), e("cp", "agent"), e("agent", "docker"), e("agent", "k8s"), e("agent", "gpu"), e("agent", "audit")],
    steps: [
      s("agent", "cp", 0.3, "info", "poll over HTTPS"), s("cp", "agent", 1.5, "ok", "signed job"), s("agent", "k8s", 2.8, "ok", "applied"), s("agent", "audit", 4.0, "info", "result"),
      s("agent", "cp", 5.6, "info", "poll"), s("cp", "agent", 6.8, "ok", "signed job"), s("agent", "docker", 8.1, "ok", "started"), s("agent", "audit", 9.3, "info", "result"),
      s("cp", "agent", 11.0, "ok", "signed job"), s("agent", "gpu", 12.3, "warn", "GPU busy, queued"),
    ],
  },
  automation: {
    id: "automation", cycle: 16, alt: "A schedule starts an agent inside business hours. It reads the calendar and mailbox, asks a model, waits for approval and saves a draft email.",
    caption: "A weekday agent: schedule, business-hours clock, calendar and mail, a model call through the gateway, approval, then a draft.",
    nodes: [
      n("sched", 85, 180, "Schedule", L(Clock), "weekdays 08:00"),
      n("window", 245, 180, "Hours", L(AlarmClock), "07:30 to 17:00"),
      n("cal", 420, 90, "Calendar", B("Google Calendar"), "today"),
      n("mail", 420, 270, "Mailbox", B("Gmail"), "unread"),
      n("llm", 595, 180, "Ask a model", L(Sparkles), "via gateway", true),
      n("approve", 760, 180, "Approval", L(UserCheck), "human review"),
      n("send", 915, 180, "Draft email", B("SendGrid"), "or send"),
    ],
    edges: [e("sched", "window"), e("window", "cal"), e("window", "mail"), e("cal", "llm"), e("mail", "llm"), e("llm", "approve"), e("approve", "send")],
    steps: [
      s("sched", "window", 0.3, "ok", "Mon 08:00"), s("window", "cal", 1.3, "ok", "6 events"), s("window", "mail", 1.3, "ok", "12 messages"), s("cal", "llm", 2.4, "info"), s("mail", "llm", 2.4, "info", "policy and budget ok"),
      s("llm", "approve", 3.7, "ok", "draft ready"), s("approve", "send", 5.0, "ok", "draft saved"),
      s("sched", "window", 8.0, "warn", "closed, hold"), s("window", "cal", 10.0, "ok", "opens 07:30"),
      s("llm", "approve", 12.0, "warn", "external recipient"), s("approve", "send", 13.4, "bad", "held for review"),
    ],
  },
  payments: {
    id: "payments", cycle: 18, alt: "A payment agent receives a signed order, creates a mobile money request, texts the customer a link, and fulfils the order only after the provider's confirmation is verified and read back.",
    caption: "Three orders on a loop: mobile money, PayPal, and one stopped at the limit. Nothing is fulfilled until the provider confirms.",
    nodes: [
      n("app", 75, 180, "Your app", L(AppWindow), "signed order"),
      n("agent", 235, 180, "Pay agent", L(Bot), "tok\u2211ner", true),
      n("mtn", 410, 70, "MTN MoMo", { cdn: "mtn", hex: "FFCC00", fallback: Smartphone }, "request to pay"),
      n("sms", 410, 180, "Text the link", SI(siTwilio), "SMS"),
      n("paypal", 410, 290, "PayPal", SI(siPaypal), "order link"),
      n("customer", 590, 180, "Customer", L(Smartphone), "approves"),
      n("verify", 765, 90, "Verify", L(ShieldCheck), "signed, read back"),
      n("done", 925, 180, "Fulfil", L(PackageCheck), "after paid"),
    ],
    edges: [e("app", "agent"), e("agent", "mtn"), e("agent", "sms"), e("agent", "paypal"), e("sms", "customer"), e("customer", "mtn"), e("paypal", "customer"), e("mtn", "verify"), e("paypal", "verify"), e("verify", "done")],
    steps: [
      s("app", "agent", 0.3, "ok", "signed order"), s("agent", "mtn", 1.4, "ok", "request to pay"), s("agent", "sms", 1.4, "info", "link"), s("sms", "customer", 2.6, "ok", "link opened"),
      s("customer", "mtn", 3.8, "ok", "PIN on phone"), s("mtn", "verify", 5.0, "info", "callback"), s("verify", "done", 6.2, "ok", "paid, read back"),
      s("app", "agent", 8.0, "ok", "order"), s("agent", "paypal", 9.0, "ok", "order created"), s("paypal", "customer", 10.2, "ok", "approves"), s("paypal", "verify", 11.4, "ok", "webhook verified"), s("verify", "done", 12.6, "ok", "captured"),
      s("app", "agent", 14.0, "bad", "over the limit"), s("mtn", "verify", 16.0, "warn", "bad signature"),
    ],
  },
  mcp: {
    id: "mcp", cycle: 16, alt: "An agent calls MCP tools through a tool policy. Approved reads run, writes wait for a person, a blocked tool is refused and a tool whose definition changed is stopped. Every call is audited.",
    caption: "Reads run, writes wait for a person, a blocked tool is refused and a changed tool definition stops the call.",
    nodes: [
      n("agent", 75, 180, "Agent", L(Bot), "pipeline"),
      n("policy", 245, 180, "Tool policy", L(ShieldCheck), "approved", true),
      n("audit", 420, 70, "Audit log", L(ListChecks), "every call"),
      n("approve", 420, 290, "Approval", L(UserCheck), "writes wait"),
      n("remote", 610, 70, "Remote", L(Blocks), "HTTP server"),
      n("local", 610, 290, "Local", L(TerminalSquare), "sandboxed"),
      n("gh", 810, 70, "GitHub", SI(siGithub), "issues"),
      n("files", 810, 290, "Workspace", L(FolderOpen), "read-only"),
    ],
    edges: [e("agent", "policy"), e("policy", "remote"), e("policy", "local"), e("policy", "approve"), e("policy", "audit"), e("approve", "remote"), e("remote", "gh"), e("local", "files")],
    steps: [
      s("agent", "policy", 0.3, "ok", "search_issues"), s("policy", "remote", 1.5, "ok", "approved, read"), s("remote", "gh", 2.7, "ok", "12 issues"), s("policy", "audit", 2.7, "info", "logged"),
      s("policy", "local", 3.9, "ok", "read-only"), s("local", "files", 5.0, "ok", "file read"),
      s("agent", "policy", 6.2, "ok", "create_issue"), s("policy", "approve", 7.3, "warn", "write: ask a person"), s("approve", "remote", 8.7, "ok", "approved"), s("remote", "gh", 9.8, "ok", "issue created"),
      s("agent", "policy", 11.0, "bad", "delete_project blocked"),
      s("agent", "policy", 12.4, "warn", "definition changed"), s("policy", "audit", 13.6, "info", "call stopped"),
    ],
  },

  rag: {
    id: "rag", cycle: 16, alt: "Documents are split, embedded and indexed once. A question passes the gateway, retrieves the best passages from the index, and a model answers with sources. When nothing matches well enough the assistant says it does not know.",
    caption: "Top row: documents become an index. Bottom row: a question finds passages and gets a cited answer, or an honest no.",
    nodes: [
      n("docs", 100, 70, "Documents", B("Amazon S3"), "PDF, Markdown"),
      n("split", 270, 70, "Split", L(Layers), "512 tokens"),
      n("embed", 440, 70, "Embed", L(Sparkles), "vectors"),
      n("index", 620, 180, "Vector index", L(Database), "your store", true),
      n("ask", 100, 290, "Question", L(MessagesSquare), "from a user"),
      n("gateway", 270, 290, "Gateway", L(ShieldCheck), "policy, budget"),
      n("retrieve", 440, 290, "Retrieve", L(ScanSearch), "top 5"),
      n("llm", 790, 290, "Model", B("OpenAI"), "question + passages"),
      n("cite", 905, 120, "Answer", L(Quote), "with sources"),
    ],
    edges: [e("docs", "split"), e("split", "embed"), e("embed", "index"), e("ask", "gateway"), e("gateway", "retrieve"), e("retrieve", "index"), e("index", "llm"), e("llm", "cite")],
    steps: [
      s("docs", "split", 0.3, "info", "12 files"), s("split", "embed", 1.3, "info", "148 passages"), s("embed", "index", 2.3, "ok", "indexed"),
      s("ask", "gateway", 4.0, "info", "reset a password?"), s("gateway", "retrieve", 5.0, "ok", "allowed"), s("retrieve", "index", 6.0, "info", "search"), s("index", "llm", 7.0, "ok", "3 passages"), s("llm", "cite", 8.2, "ok", "cited answer"),
      s("ask", "gateway", 10.0, "info", "who won the cup?"), s("gateway", "retrieve", 11.0, "ok", "allowed"), s("retrieve", "index", 12.0, "warn", "best score 0.21"), s("index", "llm", 13.0, "warn", "none above 0.35"), s("llm", "cite", 14.2, "warn", "says it does not know"),
    ],
  },
  agentflow: {
    id: "agentflow", cycle: 16, alt: "An agent pipeline starts on a schedule, reads tickets through a tool, asks a model to summarise them, waits for a person to approve, then calls a change tool through the tool policy. A rejected approval stops the run and a tool that is not approved is refused. Every call is audited.",
    caption: "An agent is a pipeline you draw: each step is explicit. Reads run, a person approves, the change goes through tool policy, and unapproved tools are refused.",
    nodes: [
      n("trigger", 100, 90, "Trigger", L(Clock), "weekdays 08:00"),
      n("read", 300, 90, "Read tool", L(Search), "search_tickets"),
      n("model", 500, 90, "Ask a model", L(Sparkles), "via gateway", true),
      n("approve", 700, 90, "Approval", L(UserCheck), "a person"),
      n("policy", 700, 270, "Tool policy", L(ShieldCheck), "approved tools"),
      n("write", 900, 270, "Change tool", L(Wrench), "update_ticket"),
      n("audit", 500, 270, "Audit log", L(ListChecks), "every call"),
    ],
    edges: [e("trigger", "read"), e("read", "model"), e("model", "approve"), e("approve", "policy"), e("policy", "write"), e("policy", "audit")],
    steps: [
      s("trigger", "read", 0.3, "info", "Mon 08:00"), s("read", "model", 1.4, "ok", "14 tickets"), s("model", "approve", 2.5, "ok", "summary drafted"), s("approve", "policy", 3.7, "ok", "approved"), s("policy", "write", 4.8, "ok", "update_ticket"), s("policy", "audit", 5.9, "info", "logged"),
      s("trigger", "read", 7.5, "info", "Tue 08:00"), s("read", "model", 8.6, "ok", "9 tickets"), s("model", "approve", 9.7, "warn", "waiting for a person"), s("approve", "policy", 11.2, "bad", "rejected, run stopped"),
      s("approve", "policy", 12.6, "ok", "approved"), s("policy", "write", 13.6, "bad", "delete_ticket not approved"), s("policy", "audit", 14.7, "info", "logged"),
    ],
  },
  connectors: {
    id: "connectors", cycle: 18, alt: "A system calls a connection. The connection resolves its secret by reference, policy checks the action, and the call reaches a database, a tool server or a chat tool. Reads run, writes wait for approval, and out-of-scope calls are refused. Every call is audited.",
    caption: "One connection, one policy, many systems: reads run, writes wait, out-of-scope calls are refused, and every call is audited.",
    nodes: [
      n("app", 98, 180, "Your system", L(AppWindow), "API or webhook"),
      n("conn", 270, 180, "Connection", L(Plug), "scoped, tested", true),
      n("vault", 270, 310, "Secrets", B("HashiCorp Vault"), "reference only"),
      n("policy", 450, 180, "Policy", L(ShieldCheck), "scope and limits"),
      n("audit", 450, 310, "Audit log", L(ListChecks), "every call"),
      n("pg", 700, 40, "PostgreSQL", B("PostgreSQL"), "read-only role"),
      n("gh", 700, 135, "GitHub", B("GitHub"), "MCP server"),
      n("slack", 700, 230, "Slack", B("Slack"), "notifications"),
      n("sf", 700, 325, "Salesforce", B("Salesforce"), "CRM"),
    ],
    edges: [e("app", "conn"), e("conn", "vault"), e("conn", "policy"), e("policy", "pg"), e("policy", "gh"), e("policy", "slack"), e("policy", "sf"), e("policy", "audit")],
    steps: [
      s("app", "conn", 0.3, "info", "call"), s("conn", "vault", 1.2, "info", "secretref resolved"), s("conn", "policy", 2.2, "ok", "in scope"), s("policy", "pg", 3.3, "ok", "SELECT, read-only"), s("policy", "audit", 4.4, "info", "logged"),
      s("app", "conn", 6.0, "info", "call"), s("conn", "policy", 7.0, "ok", "in scope"), s("policy", "gh", 8.1, "ok", "search_issues"), s("policy", "audit", 9.2, "info", "logged"),
      s("app", "conn", 10.8, "info", "call"), s("conn", "policy", 11.8, "ok", "in scope"), s("policy", "slack", 12.9, "warn", "post: needs approval"), s("policy", "audit", 14.0, "info", "logged"),
      s("app", "conn", 15.0, "info", "call"), s("conn", "policy", 15.9, "ok", "checked"), s("policy", "sf", 16.7, "bad", "not in scope"),
    ],
  },
};

export const PRODUCT_SCENE: Record<string, string> = {
  gateway: "gateway", "policy-engine": "policy", "cost-and-budgets": "budgets", documents: "documents",
  observability: "observability", "provider-registry": "failover",
};

/** Heading and lead shown above each scene on product pages. */
export const SCENE_COPY: Record<string, { title: string; lead: string }> = {
  gateway: { title: "Watch a request cross every gate.", lead: "Identity, policy, budget and routing run before a provider is called. A denied request costs nothing, and a failing provider is skipped without a deploy." },
  policy: { title: "One context, every rule, a clear decision.", lead: "Each request is checked against all the rules that apply. The outcome is forward, mask or reject, and the reason is recorded." },
  budgets: { title: "Budgets that act before the invoice.", lead: "Usage is counted as it happens. At each threshold the engine warns, throttles or blocks, and tells the right people." },
  documents: { title: "Process once. Reuse everywhere.", lead: "A file is scanned, read, masked and stored as one canonical document that every model and every prompt can use." },
  observability: { title: "Every request becomes an event.", lead: "Events stream into an analytics store. Dashboards, metrics tools and paging see the same numbers the console shows." },
  refinery: { title: "From raw data to a dataset a training job can read.", lead: "Sources go through a recipe, run on runners in your network and arrive as clean files, a synced table or a versioned dataset. Rejected rows are kept aside with the reason." },
  failover: { title: "Traffic follows health, not hard-coded names.", lead: "When a provider times out the router retries on the next one. Sensitive traffic can be pinned to a model in your own network." },
  mlops: { title: "From source to endpoint, with a gate before production.", lead: "Build, scan, register, approve, deploy and observe. If an objective is breached the previous version comes back automatically." },
  agent: { title: "Run on your servers without opening a port.", lead: "The agent asks for work over HTTPS, checks the signature, runs the job next to your systems and reports a scrubbed result." },
  payments: { title: "Collect a payment without touching card data.", lead: "The agent creates the payment with your provider, sends the customer a link and waits. A payment counts only after the provider confirms it and the platform has verified and read it back." },
  mcp: { title: "Give agents tools, and keep control of them.", lead: "Connect remote or local MCP servers. You approve each tool, writes wait for a person, and a tool whose definition changes is stopped until someone reviews it." },
  automation: { title: "Agents that keep time, read calendars and send mail.", lead: "Triggers, clocks, calendars and mail providers are operators like any other. Model calls go through the gateway, and nothing is sent without the approval you require." },
};


// ------------------------------------------------------------------ home page slides
// Small scenes for the home page carousel. The centre node is always the tok∑ner mark. Each one is a use case, not a feature list.
const M = (id: string, x: number, y: number, label: string, sub?: string): SceneNode => ({ id, x, y, label, sub, icon: L(Plug), core: true, mark: true });

export const HERO_SLIDES: { id: string; tag: string; title: string; scene: Scene }[] = [
  { id: "gateway", tag: "Gateway", title: "Every model call, governed", scene: {
    id: "h-gateway", cycle: 12, height: 250, alt: "Apps and agents call one endpoint. Policy and budget are checked, then the request goes to a hosted model or one of your own.",
    caption: "", nodes: [
      n("app", 90, 75, "Your apps", L(AppWindow)), n("agent", 90, 165, "Agents", L(Bot)), n("pol", 300, 120, "Policy and budget", L(ShieldCheck)),
      M("core", 500, 120, "tok∑ner"),
      n("oa", 910, 50, "OpenAI", B("OpenAI")), n("an", 910, 120, "Anthropic", B("Anthropic")), n("own", 910, 190, "Your model", L(Server)),
    ],
    edges: [e("app", "pol"), e("agent", "pol"), e("pol", "core"), e("core", "oa"), e("core", "an"), e("core", "own")],
    steps: [s("app", "pol", 0.2), s("pol", "core", 1.1, "ok", "allowed"), s("core", "oa", 2.0, "ok", "200 OK"), s("agent", "pol", 4.2), s("pol", "core", 5.1, "warn", "masked"), s("core", "own", 6.0, "ok", "in your network"), s("app", "pol", 8.2), s("pol", "core", 9.1, "bad", "over budget")],
  } },
  { id: "refinery", tag: "Refinery", title: "Raw data in, training data out", scene: {
    id: "h-refinery", cycle: 12, height: 250, alt: "Files, databases and streams are cleaned by Refinery and written to a lake, a training pipeline or a knowledge base.",
    caption: "", nodes: [
      n("s3", 90, 50, "Object storage", SI(siAmazons3)), n("pg", 90, 120, "Databases", SI(siPostgresql)), n("kf", 90, 190, "Streams", SI(siApachekafka)),
      M("core", 500, 120, "Refinery", "clean and shape"),
      n("lake", 910, 50, "Lake files", SI(siMinio)), n("train", 910, 120, "Training pipeline", L(Rocket)), n("kb", 910, 190, "Knowledge", L(Search)),
    ],
    edges: [e("s3", "core"), e("pg", "core"), e("kf", "core"), e("core", "lake"), e("core", "train"), e("core", "kb")],
    steps: [s("s3", "core", 0.2, "info", "94 GB of PDFs"), s("core", "lake", 1.4, "ok", "Parquet"), s("pg", "core", 3.6, "info", "table"), s("core", "train", 4.8, "ok", "split 80/10/10"), s("kf", "core", 7.0, "info", "change log"), s("core", "kb", 8.2, "ok", "chunks")],
  } },
  { id: "models", tag: "Models", title: "Train, gate, deploy, roll back", scene: {
    id: "h-models", cycle: 12, height: 250, alt: "Clean data trains a model. The registry versions it, an evaluation gate decides, and only an approved model is deployed to an endpoint.",
    caption: "", nodes: [
      n("data", 80, 120, "Clean data", L(Database)), n("train", 260, 120, "Train", L(Cpu)), M("core", 440, 120, "Registry"),
      n("eval", 620, 120, "Evaluation", L(ListChecks)), n("dep", 780, 120, "Deploy", L(Rocket)), n("app", 920, 120, "Endpoint", L(AppWindow)),
    ],
    edges: [e("data", "train"), e("train", "core"), e("core", "eval"), e("eval", "dep"), e("dep", "app")],
    steps: [s("data", "train", 0.2), s("train", "core", 1.2, "info", "v7 registered"), s("core", "eval", 2.4), s("eval", "dep", 3.4, "ok", "passed"), s("dep", "app", 4.4, "ok", "live"), s("train", "core", 7.0, "info", "v8 registered"), s("core", "eval", 8.2, "bad", "failed gate")],
  } },
  { id: "agentos", tag: "Agent OS", title: "Agents act. People decide what matters.", scene: {
    id: "h-agentos", cycle: 12, height: 250, alt: "Agents from any framework take on work. A run waits for a person where a rule says so, is traced under one id and is evaluated before a change ships.",
    caption: "", nodes: [
      n("claim", 90, 50, "Claim pack", L(FileText)), n("tk", 90, 120, "Support ticket", L(MessagesSquare)), n("fw", 90, 190, "Any framework", L(Bot)),
      M("core", 500, 120, "Agent OS", "governed runs"),
      n("ap", 910, 50, "Approval", L(UserCheck), "a person decides"), n("tr", 910, 120, "Traces", L(Radar), "one correlation id"), n("ev", 910, 190, "Evals", L(FlaskConical), "before it ships"),
    ],
    edges: [e("claim", "core"), e("tk", "core"), e("fw", "core"), e("core", "ap"), e("core", "tr"), e("core", "ev")],
    steps: [s("claim", "core", 0.2, "info", "10 values read"), s("core", "ap", 1.4, "warn", "waits for a person"), s("tk", "core", 3.8, "info", "refund request"), s("core", "tr", 5.0, "ok", "traced"), s("fw", "core", 7.4, "info", "registered"), s("core", "ev", 8.6, "ok", "cases passed")],
  } },
  { id: "knowledge", tag: "Knowledge", title: "Your documents, ready for any model", scene: {
    id: "h-knowledge", cycle: 12, height: 250, alt: "Documents, tickets and drives are read once, masked and stored as knowledge that assistants and search use.",
    caption: "", nodes: [
      n("doc", 90, 50, "Files and PDFs", L(FileText)), n("drive", 90, 120, "Cloud drives", L(Cloud)), n("tk", 90, 190, "Tickets", L(MessagesSquare)),
      M("core", 500, 120, "Knowledge", "read, mask, index"),
      n("bot", 910, 80, "Assistants", L(Bot)), n("srch", 910, 165, "Search", L(Search)),
    ],
    edges: [e("doc", "core"), e("drive", "core"), e("tk", "core"), e("core", "bot"), e("core", "srch")],
    steps: [s("doc", "core", 0.2, "info", "scanned"), s("core", "bot", 1.5, "ok", "cited answer"), s("tk", "core", 4.0, "warn", "masked"), s("core", "srch", 5.3, "ok", "indexed"), s("drive", "core", 7.8, "info", "synced"), s("core", "bot", 9.0, "ok", "cited answer")],
  } },
  { id: "agents", tag: "Agents and tools", title: "Tools agents can use, with approval", scene: {
    id: "h-agents", cycle: 12, height: 250, alt: "An agent asks to use a tool. Reads go through, and writes wait for a person to approve.",
    caption: "", nodes: [
      n("agent", 90, 120, "Agent", L(Bot)), n("ok", 300, 120, "Approval", L(UserCheck), "for writes"), M("core", 500, 120, "Tool gate", "MCP servers"),
      n("sl", 910, 50, "Slack", SI(siSlack)), n("gh", 910, 120, "GitHub", SI(siGithub)), n("pay", 910, 190, "Payments", L(Wallet)),
    ],
    edges: [e("agent", "ok"), e("ok", "core"), e("core", "sl"), e("core", "gh"), e("core", "pay")],
    steps: [s("agent", "ok", 0.2), s("ok", "core", 1.1, "ok", "read allowed"), s("core", "gh", 2.0, "ok", "200 OK"), s("agent", "ok", 4.2), s("ok", "core", 5.1, "warn", "approved by Sam"), s("core", "sl", 6.0, "ok", "sent"), s("agent", "ok", 8.2), s("ok", "core", 9.1, "bad", "tool changed")],
  } },
  { id: "anywhere", tag: "Run anywhere", title: "Your cloud, your cluster, your rules", scene: {
    id: "h-anywhere", cycle: 12, height: 250, alt: "One control plane connects a managed cloud, your own cloud account, Kubernetes and air-gapped sites.",
    caption: "", nodes: [
      n("saas", 90, 50, "Managed cloud", L(Cloud)), n("pc", 90, 120, "Your cloud account", L(Boxes)), n("k8s", 90, 190, "Your Kubernetes", L(Workflow)),
      M("core", 500, 120, "Control plane", "one audit trail"),
      n("aud", 910, 80, "Audit and spend", L(Receipt)), n("sec", 910, 165, "Keys and secrets", L(Lock)),
    ],
    edges: [e("saas", "core"), e("pc", "core"), e("k8s", "core"), e("core", "aud"), e("core", "sec")],
    steps: [s("saas", "core", 0.2), s("core", "aud", 1.3, "info", "recorded"), s("pc", "core", 3.4), s("core", "sec", 4.5, "ok", "reference only"), s("k8s", "core", 6.6, "info", "runner connects out"), s("core", "aud", 7.8, "info", "recorded")],
  } },
];
