import type { Metadata } from "next";
import { DocsShell } from "@/components/docs/DocsShell";

export const metadata: Metadata = {
  title: { default: "Documentation | tok∑ner", template: "%s | tok∑ner documentation" },
  description: "How to use every part of the tok∑ner control plane, with screenshots, diagrams and things to try.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
