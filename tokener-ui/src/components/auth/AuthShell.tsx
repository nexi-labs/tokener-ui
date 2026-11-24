import Image from "next/image";
import Link from "next/link";
import { AuthAside, type AsideKind } from "./AuthAside";
import { BrandFrame } from "./BrandFrame";

/**
 * The frame every sign-up, recovery and invitation screen sits in: the brand panel on the left, as on the sign-in page, and the form on the
 * right. `aside` picks what the panel says. On narrow screens the panel is hidden and the logo moves above the form.
 */
export function AuthShell({ title, subtitle, children, footer, wide, aside = "signup" }: {
  title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; aside?: AsideKind;
}) {
  return (
    <div className="min-h-screen w-full bg-surface flex">
      <BrandFrame><AuthAside kind={aside} /></BrandFrame>
      <div className="flex-1 min-w-0 flex flex-col items-center px-6 sm:px-10 py-10">
        <div className={`w-full my-auto ${wide ? "max-w-[460px]" : "max-w-[420px]"}`}>
          <div className="lg:hidden mb-9 flex justify-center">
            <Link href="/" aria-label="tok∑ner home"><Image src="/brand/logo-light.svg" alt="tok∑ner" width={152} height={48} priority /></Link>
          </div>
          <h1 className="text-[1.9rem] leading-tight font-semibold tracking-tight text-text-primary">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-text-secondary">{footer}</div>}
        </div>
        <p className="mt-10 text-[11px] text-text-tertiary text-center">
          <Link href="/legal/terms" className="hover:text-text-secondary">Terms</Link>
          <span className="mx-2">&middot;</span>
          <Link href="/legal/privacy" className="hover:text-text-secondary">Privacy</Link>
          <span className="mx-2">&middot;</span>
          <Link href="/security" className="hover:text-text-secondary">Security</Link>
        </p>
      </div>
    </div>
  );
}
