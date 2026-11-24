"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { NAV_GROUPS, TOP_NAV, itemActive, type NavItem } from "@/lib/nav";
import { useShell } from "./ShellContext";
import { AccountFooter } from "./AccountFooter";

export function Sidebar() {
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen, role } = useShell();
  const groups = NAV_GROUPS.filter((g) => !g.operatorOnly || role === "operator");
  const pathname = usePathname();
  const [open, setOpen] = useState<Set<string>>(new Set());

  // The group holding the active route opens itself; the rest stay closed.
  useEffect(() => {
    const g = NAV_GROUPS.find((x) => x.items.some((i) => itemActive(pathname, i)));
    if (g) setOpen((prev) => (prev.has(g.id) ? prev : new Set(prev).add(g.id)));
  }, [pathname]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // On the mobile drawer the rail is never icon-only.
  const rail = collapsed;

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}
      <aside
        className={clsx(
          "bg-ink-800 flex flex-col h-screen shrink-0 z-40 transition-[width,transform] duration-200",
          "fixed top-0 left-0 w-[272px] lg:sticky",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          rail ? "lg:w-[68px]" : "lg:w-[256px]"
        )}
      >
        <div className={clsx("flex items-center justify-between h-14 px-4 shrink-0", rail && "lg:justify-center lg:px-0")}>
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/brand/logo-dark.svg"
              alt="tok∑ner"
              width={104}
              height={33}
              priority
              className={clsx(rail && "lg:hidden")}
            />
            {rail && (
              <Image src="/brand/logomark-dark.svg" alt="tok∑ner" width={30} height={25} className="hidden lg:block" />
            )}
          </Link>
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden h-9 w-9 flex items-center justify-center rounded-md text-text-tertiary hover:text-text-inverse hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-0.5">
          {TOP_NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} rail={rail} />
          ))}
          <div className="h-px bg-white/10 my-2.5 mx-2 shrink-0" />

          {groups.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = open.has(group.id);
            const hasActive = group.items.some((i) => itemActive(pathname, i));

            if (rail) {
              // Icon-only rail: the group icon links to its first item.
              return (
                <Link
                  key={group.id}
                  href={group.items[0].href}
                  title={group.label}
                  className={clsx(
                    "hidden lg:flex h-9 shrink-0 items-center justify-center rounded-md transition-colors",
                    hasActive ? "bg-white/[0.08] text-text-inverse" : "text-text-tertiary hover:text-text-inverse hover:bg-white/[0.05]"
                  )}
                >
                  <GroupIcon size={17} strokeWidth={1.75} />
                </Link>
              );
            }

            return (
              <div key={group.id} className="flex flex-col shrink-0">
                <button
                  onClick={() => toggle(group.id)}
                  aria-expanded={isOpen}
                  className={clsx(
                    "flex items-center gap-3 h-9 shrink-0 px-2.5 rounded-md text-[13px] transition-colors",
                    hasActive ? "text-text-inverse" : "text-text-tertiary hover:text-text-inverse hover:bg-white/[0.05]"
                  )}
                >
                  <GroupIcon size={17} strokeWidth={1.75} className="shrink-0" />
                  <span className="flex-1 text-left truncate font-medium">{group.label}</span>
                  {group.operatorOnly && (
                    <span className="text-[9px] uppercase tracking-wider text-accent-500 border border-accent-500/40 rounded px-1 py-px">Operator</span>
                  )}
                  <ChevronDown
                    size={14}
                    className={clsx("shrink-0 transition-transform duration-150", isOpen ? "rotate-0" : "-rotate-90")}
                  />
                </button>
                {isOpen && (
                  <div className="ml-[18px] pl-3 border-l border-white/10 flex flex-col shrink-0 gap-0.5 my-0.5">
                    {group.items.map((item, i) => (
                      <div key={item.href} className="flex flex-col shrink-0">
                        {item.section && item.section !== group.items[i - 1]?.section && (
                          <span className={clsx("px-2.5 pb-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-text-tertiary/70", i === 0 ? "pt-1" : "pt-3")}>{item.section}</span>
                        )}
                        <NavLink item={item} pathname={pathname} rail={false} nested />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <AccountFooter rail={rail} onNavigate={() => setMobileOpen(false)} />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex h-11 items-center gap-2 px-4 text-text-tertiary hover:text-text-inverse text-xs shrink-0 border-t border-white/10"
        >
          {rail ? (
            <ChevronsRight size={16} />
          ) : (
            <>
              <ChevronsLeft size={16} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </aside>
    </>
  );
}

function NavLink({
  item,
  pathname,
  rail,
  nested,
}: {
  item: NavItem;
  pathname: string;
  rail: boolean;
  nested?: boolean;
}) {
  const active = itemActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={rail ? item.label : undefined}
      className={clsx(
        "flex items-center gap-3 shrink-0 rounded-md text-[13px] transition-colors relative",
        nested ? "h-8 px-2.5" : "h-9 px-2.5",
        rail && "lg:justify-center lg:px-0",
        active ? "bg-white/[0.08] text-text-inverse" : "text-text-tertiary hover:text-text-inverse hover:bg-white/[0.05]"
      )}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent-500" />}
      {!nested && <Icon size={17} strokeWidth={1.75} className="shrink-0" />}
      <span className={clsx("truncate", rail && "lg:hidden")}>{item.label}</span>
    </Link>
  );
}
