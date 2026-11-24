"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export type Role = "org_admin" | "operator";

type Shell = {
  role: Role;
  setRole: (r: Role) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean | ((c: boolean) => boolean)) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
};

const Ctx = createContext<Shell | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRoleState] = useState<Role>("org_admin");
  const pathname = usePathname();

  useEffect(() => {
    try {
      const v = localStorage.getItem("tokener.role");
      if (v === "operator" || v === "org_admin") setRoleState(v);
    } catch {}
  }, []);
  const setRole = (r: Role) => {
    setRoleState(r);
    try { localStorage.setItem("tokener.role", r); } catch {}
  };

  // Close the drawer whenever the route changes.
  useEffect(() => setMobileOpen(false), [pathname]);

  // Auto-collapse the rail on tablet widths, expand again on large screens.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (max-width: 1279px)");
    const apply = () => setCollapsed(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return <Ctx.Provider value={{ role, setRole, collapsed, setCollapsed, mobileOpen, setMobileOpen }}>{children}</Ctx.Provider>;
}

export function useShell() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShell must be used inside ShellProvider");
  return v;
}
