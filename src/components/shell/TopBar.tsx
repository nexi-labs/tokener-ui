"use client";

import { DEMO_USER } from "@/lib/auth/demoUser";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Search, Bell, HelpCircle, Menu, LogOut, Settings, CreditCard } from "lucide-react";
import { ALL_NAV_ITEMS, isActive } from "@/lib/nav";
import { useShell } from "./ShellContext";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { CreditChip } from "@/components/billing/CreditChip";

const BRAND = "tok∑ner";

export function TopBar() {
  const pathname = usePathname();
  const { setMobileOpen } = useShell();
  // Longest matching href wins so /budgets/new beats /budgets.
  const current = [...ALL_NAV_ITEMS].sort((a, b) => b.href.length - a.href.length).find((item) => isActive(pathname, item.href));
  const breadcrumb = current ? [BRAND, current.label] : [BRAND];

  return (
    <header className="h-16 border-b border-border bg-surface flex items-center justify-between pl-3 sm:pl-6 pr-3 sm:pr-4 sticky top-0 z-20">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="lg:hidden h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-text-secondary hover:bg-surface-muted"
        >
          <Menu size={19} />
        </button>
        <OrgSwitcher />
        <div className="h-5 w-px bg-border hidden md:block" />
        <nav className="hidden md:flex items-center gap-1.5 text-sm text-text-secondary min-w-0">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb} className="flex items-center gap-1.5 truncate">
              {i > 0 && <span className="text-text-tertiary">/</span>}
              {crumb === BRAND
                ? <Image src="/brand/logo-light.svg" alt={BRAND} width={56} height={18} className="h-[18px] w-auto shrink-0" />
                : <span className={i === breadcrumb.length - 1 ? "text-text-primary font-medium" : ""}>{crumb}</span>}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <CreditChip />
        <button aria-label="Search" className="h-9 px-2.5 sm:px-3 rounded-md flex items-center gap-2 text-sm text-text-secondary hover:bg-surface-muted transition-colors">
          <Search size={16} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline text-[10px] text-text-tertiary bg-surface-muted border border-border rounded px-1.5 py-0.5 ml-1">
            ⌘K
          </kbd>
        </button>
        <span className="hidden sm:block"><IconButton icon={HelpCircle} label="Help" /></span>
        <IconButton icon={Bell} label="Notifications" dot />
        <div className="h-5 w-px bg-border mx-1" />
        <UserMenu />
      </div>
    </header>
  );
}

function OrgSwitcher() {
  const { status, user, orgId } = useAuth();
  const real = status === "session" && user;
  const org = real ? user.organizations?.find((o) => o.id === orgId) ?? user.organizations?.[0] : undefined;
  const name = real ? (org?.name ?? (user.assignments.some((a) => a.scope.type === "platform") ? "Platform operations" : "No organization")) : "NexI Corp";
  const sub = real ? (org ? "Organization" : "Operator") : "prod";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <button className="flex items-center gap-2 h-9 px-2.5 rounded-md hover:bg-surface-muted transition-colors">
      <div className="h-6 w-6 rounded bg-emph text-on-emph text-[11px] font-semibold flex items-center justify-center shrink-0">
        {real ? initials : "NX"}
      </div>
      <div className="text-left leading-tight hidden sm:block">
        <div className="text-[13px] font-medium text-text-primary">{name}</div>
        <div className="text-[11px] text-text-tertiary">{sub}</div>
      </div>
      <ChevronDown size={14} className="text-text-tertiary" />
    </button>
  );
}

function IconButton({ icon: Icon, label, dot }: { icon: typeof Bell; label: string; dot?: boolean }) {
  return (
    <button aria-label={label} className="h-9 w-9 rounded-md flex items-center justify-center text-text-secondary hover:bg-surface-muted transition-colors relative">
      <Icon size={17} />
      {dot && <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-accent-500" />}
    </button>
  );
}

function UserMenu() {
  const { role, setRole } = useShell();
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const name = status === "session" && user ? user.displayName || user.email : DEMO_USER.name;
  const email = status === "session" && user ? user.email : DEMO_USER.email;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <div className="relative">
      <button
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="h-9 w-9 rounded-full bg-emph text-on-emph text-[12px] font-semibold flex items-center justify-center"
      >
        {initials}
      </button>
      {open && (
        <>
          <button aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-64 rounded-lg border border-border bg-surface shadow-popover p-1.5">
            <div className="px-2.5 py-2">
              <div className="text-[13px] font-medium text-text-primary">{name}</div>
              <div className="text-xs text-text-tertiary">{email}{status === "demo" && " (demo workspace)"}</div>
            </div>
            <div className="h-px bg-border my-1" />
            <div className="px-2.5 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-text-tertiary">View as</div>
            {([
              ["org_admin", "Customer org admin", "Governance, budgets, keys"],
              ["operator", "Platform operator", "Adds platform administration"],
            ] as const).map(([value, label, hint]) => (
              <button
                key={value}
                onClick={() => { setRole(value); setOpen(false); }}
                className="w-full text-left px-2.5 py-2 rounded-md hover:bg-surface-muted flex items-start gap-2"
              >
                <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${role === value ? "bg-accent-600" : "bg-border-strong"}`} />
                <span>
                  <span className="block text-[13px] text-text-primary">{label}</span>
                  <span className="block text-xs text-text-tertiary">{hint}</span>
                </span>
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            <Link href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-surface-muted text-[13px] text-text-primary"><Settings size={15} className="text-text-tertiary" />Account settings</Link>
            <Link href="/billing" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-surface-muted text-[13px] text-text-primary"><CreditCard size={15} className="text-text-tertiary" />Billing and payment</Link>
            <div className="h-px bg-border my-1" />
            <button onClick={async () => { setOpen(false); await signOut(); router.replace("/login"); }}
              className="w-full text-left px-2.5 py-2 rounded-md hover:bg-surface-muted text-[13px] text-text-primary flex items-center gap-2.5">
              <LogOut size={15} className="text-text-tertiary" />{status === "demo" ? "Leave the demo" : "Sign out"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
