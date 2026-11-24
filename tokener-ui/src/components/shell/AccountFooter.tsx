"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronUp, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DEMO_USER, initialsOf } from "@/lib/auth/demoUser";

/**
 * The account at the foot of the sidebar: one profile button that opens one menu holding Account settings and Sign out (Leave the demo in the sample
 * workspace). Grouped like this so the sidebar's own items are not mixed with account actions.
 */
export function AccountFooter({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const demo = status === "demo";
  const name = demo ? DEMO_USER.name : user?.displayName || user?.email || "";
  const email = demo ? DEMO_USER.email : user?.email || "";
  const initials = initialsOf(name);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const out = async () => { setOpen(false); onNavigate?.(); await signOut(); router.replace("/login"); };
  const item = "flex items-center gap-3 h-9 px-2.5 rounded-md text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors w-full text-left";

  const menu = (
    <div role="menu" aria-label="Account" className={clsx("absolute z-50 bottom-full mb-2 w-60 rounded-lg border border-border bg-surface shadow-popover p-1.5", rail ? "left-1" : "left-0")}>
      <div className="px-2.5 py-2">
        <div className="text-[13px] font-medium text-text-primary truncate">{name}</div>
        <div className="text-xs text-text-tertiary truncate">{email}</div>
        {demo && <div className="text-[11px] text-text-tertiary mt-0.5">Sample workspace</div>}
      </div>
      <div className="h-px bg-border my-1" />
      <Link role="menuitem" href="/account" onClick={() => { setOpen(false); onNavigate?.(); }} className={item}><Settings size={15} strokeWidth={1.75} className="shrink-0" />Account settings</Link>
      <button role="menuitem" onClick={out} className={item}><LogOut size={15} strokeWidth={1.75} className="shrink-0" />{demo ? "Leave the demo" : "Sign out"}</button>
    </div>
  );

  if (rail) {
    return (
      <div ref={box} className="hidden lg:flex flex-col items-center px-2.5 py-2 border-t border-white/10 relative">
        <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" title={name}
          className="h-9 w-9 rounded-full bg-accent-500/15 text-accent-500 text-[11px] font-semibold grid place-items-center hover:bg-accent-500/25">{initials}</button>
        {open && menu}
      </div>
    );
  }
  return (
    <div ref={box} className="px-2.5 py-2 border-t border-white/10 shrink-0 relative">
      {open && menu}
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="w-full flex items-center gap-2.5 px-2.5 py-2 min-w-0 rounded-md hover:bg-white/[0.05] transition-colors text-left">
        <span className="h-8 w-8 shrink-0 rounded-full bg-accent-500/15 text-accent-500 text-[11px] font-semibold grid place-items-center">{initials}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[13px] text-text-inverse truncate">{name}</span>
          <span className="block text-[11px] text-text-tertiary truncate">{email}{demo && " (demo)"}</span>
        </span>
        <ChevronUp size={15} className={clsx("shrink-0 text-text-tertiary transition-transform", !open && "rotate-180")} />
      </button>
    </div>
  );
}
