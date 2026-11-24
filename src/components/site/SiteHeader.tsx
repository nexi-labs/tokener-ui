"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import clsx from "clsx";
import { NAV } from "@/lib/site";

type Item = { label: string; href: string; desc: string; icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> };

const MENUS: { id: string; label: string; items: Item[]; cols: number }[] = [
  { id: "products", label: "Products", items: NAV.products, cols: 2 },
  { id: "solutions", label: "Solutions", items: NAV.solutions, cols: 2 },
  { id: "usecases", label: "Use cases", items: NAV.usecases, cols: 2 },
  { id: "developers", label: "Developers", items: NAV.developers, cols: 1 },
  { id: "resources", label: "Resources", items: NAV.resources, cols: 1 },
];

export function SiteHeader() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>("products");
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(null), setMobile(false));
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobile]);

  const close = () => { setOpen(null); setMobile(false); };

  return (
    <header className="sticky top-0 z-50 bg-ink-800/95 backdrop-blur border-b border-white/10" ref={wrap}>
      <div className="mx-auto max-w-[1520px] px-4 sm:px-6 lg:px-10 xl:px-14 h-16 flex items-center gap-6">
        <Link href="/" onClick={close} className="shrink-0">
          <Image src="/brand/logo-dark.svg" alt="tok∑ner" width={122} height={38} priority />
        </Link>

        <nav className="hidden xl:flex items-center gap-1 flex-1">
          {MENUS.map((m) => (
            <button
              key={m.id}
              onClick={() => setOpen(open === m.id ? null : m.id)}
              onMouseEnter={() => open && setOpen(m.id)}
              aria-expanded={open === m.id}
              className={clsx(
                "h-9 px-2.5 rounded-md text-sm inline-flex items-center gap-1 whitespace-nowrap transition-colors",
                open === m.id ? "text-text-inverse bg-white/10" : "text-text-tertiary hover:text-text-inverse"
              )}
            >
              {m.label}
              <ChevronDown size={14} className={clsx("transition-transform", open === m.id && "rotate-180")} />
            </button>
          ))}
          <Link href="/connectors" className="h-9 px-2.5 rounded-md text-sm inline-flex items-center whitespace-nowrap text-text-tertiary hover:text-text-inverse">Connectors</Link>
          <Link href="/pricing" className="h-9 px-2.5 rounded-md text-sm inline-flex items-center whitespace-nowrap text-text-tertiary hover:text-text-inverse">Pricing</Link>
          <Link href="/customers" className="h-9 px-2.5 rounded-md text-sm inline-flex items-center whitespace-nowrap text-text-tertiary hover:text-text-inverse">Customers</Link>
        </nav>

        <div className="hidden xl:flex items-center gap-2 ml-auto shrink-0 whitespace-nowrap">
          <Link href="/login" className="h-9 px-3 inline-flex items-center text-sm text-text-tertiary hover:text-text-inverse">Sign in</Link>
          <Link href="/dashboard" className="h-9 px-3.5 hidden min-[1440px]:inline-flex items-center rounded-md text-sm border border-white/20 text-text-inverse hover:bg-white/10">Open console</Link>
          <Link href="/signup" className="h-9 px-3.5 inline-flex items-center rounded-md text-sm font-semibold bg-accent-500 text-ink-900 hover:bg-accent-300">Get started</Link>
        </div>

        <button
          aria-label={mobile ? "Close menu" : "Open menu"}
          onClick={() => setMobile((v) => !v)}
          className="xl:hidden ml-auto h-10 w-10 rounded-md flex items-center justify-center text-text-inverse hover:bg-white/10"
        >
          {mobile ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Desktop mega panel */}
      {open && (
        <div className="hidden xl:block absolute left-0 right-0 top-16 bg-surface border-b border-border shadow-popover">
          {MENUS.filter((m) => m.id === open).map((m) => (
            <div key={m.id} className="mx-auto max-w-[1520px] px-4 sm:px-6 lg:px-10 xl:px-14 py-6">
              <div className={clsx("grid gap-x-8 gap-y-1", m.cols === 2 ? "grid-cols-2 max-w-4xl" : "grid-cols-2 max-w-2xl")}>
                {m.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <Link key={it.href} href={it.href} onClick={close} className="flex items-start gap-3 rounded-lg p-3 hover:bg-surface-subtle transition-colors">
                      {Icon && (
                        <span className="h-9 w-9 shrink-0 rounded-md bg-ink-800 text-accent-500 flex items-center justify-center">
                          <Icon size={17} strokeWidth={1.75} />
                        </span>
                      )}
                      <span>
                        <span className="block text-sm font-semibold text-text-primary">{it.label}</span>
                        <span className="block text-xs text-text-secondary mt-0.5 leading-snug">{it.desc}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile drawer */}
      {mobile && (
        <div className="xl:hidden fixed inset-x-0 top-16 bottom-0 bg-ink-800 overflow-y-auto px-5 pb-10">
          <div className="py-2">
            {MENUS.map((m) => (
              <div key={m.id} className="border-b border-white/10">
                <button
                  onClick={() => setMobileSection(mobileSection === m.id ? null : m.id)}
                  className="w-full h-12 flex items-center justify-between text-text-inverse text-[15px] font-medium"
                >
                  {m.label}
                  <ChevronDown size={16} className={clsx("transition-transform", mobileSection === m.id && "rotate-180")} />
                </button>
                {mobileSection === m.id && (
                  <div className="pb-3 flex flex-col">
                    {m.items.map((it) => (
                      <Link key={it.href} href={it.href} onClick={close} className="py-2 text-sm text-text-tertiary hover:text-text-inverse">
                        {it.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {[["Connectors", "/connectors"], ["Pricing", "/pricing"], ["Customers", "/customers"]].map(([l, h]) => (
              <Link key={h} href={h} onClick={close} className="h-12 flex items-center border-b border-white/10 text-text-inverse text-[15px] font-medium">{l}</Link>
            ))}
          </div>
          <div className="flex flex-col gap-2.5 mt-5">
            <Link href="/signup" onClick={close} className="h-11 rounded-md bg-accent-500 text-ink-900 font-semibold text-sm flex items-center justify-center">Get started</Link>
            <Link href="/login" onClick={close} className="h-11 rounded-md border border-white/20 text-text-inverse text-sm flex items-center justify-center">Sign in</Link>
            <Link href="/dashboard" onClick={close} className="h-11 rounded-md text-text-tertiary text-sm flex items-center justify-center">Open console</Link>
          </div>
        </div>
      )}
    </header>
  );
}
