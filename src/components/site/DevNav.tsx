"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  ["Overview", "/developers"],
  ["Quickstart", "/developers/quickstart"],
  ["Guides", "/developers/docs"],
  ["API reference", "/developers/api"],
  ["SDKs", "/developers/sdks"],
  ["Tutorials", "/developers/tutorials"],
  ["Errors", "/developers/errors"],
  ["Roadmap", "/developers/changelog"],
];

export function DevNav() {
  const path = usePathname();
  return (
    <div className="sticky top-16 z-40 bg-surface border-b border-border">
      <div className="mx-auto max-w-[1520px] px-4 sm:px-6 lg:px-10 xl:px-14 flex gap-1 overflow-x-auto">
        {TABS.map(([l, h]) => (
          <Link
            key={h}
            href={h}
            className={clsx(
              "h-11 px-3 inline-flex items-center text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
              (path === h || (h !== "/developers" && path.startsWith(h + "/"))) ? "border-accent-600 text-text-primary font-medium" : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            {l}
          </Link>
        ))}
      </div>
    </div>
  );
}
