"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

/** Opens the sample workspace: local sample data, no account and no calls to the API. */
export function DemoLink({ className, href = "/dashboard", children = "Try the demo workspace" }: { className?: string; href?: string; children?: React.ReactNode }) {
  const { enterDemo } = useAuth();
  return <Link href={href} onClick={enterDemo} className={className}>{children}</Link>;
}
