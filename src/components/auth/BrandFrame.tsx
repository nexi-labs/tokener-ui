import Image from "next/image";
import Link from "next/link";

/**
 * The dark panel on the left of every sign-in and sign-up screen. It matches the console's own sidebar so signing in does not feel like a
 * separate marketing site bolted onto the product: ruled-paper lines and an oversized outlined Sigma, so the panel reads like a working notebook.
 */
export function BrandFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative hidden lg:flex lg:w-[58%] xl:w-[60%] bg-ink-800 flex-col px-10 xl:px-14 py-8 h-screen sticky top-0 overflow-y-auto overflow-x-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)", backgroundSize: "100% 44px" }} />
      <span aria-hidden className="absolute left-10 xl:left-[3.2rem] top-0 bottom-0 w-px bg-accent-500/20 pointer-events-none" />
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        <svg className="absolute -right-24 -bottom-24 opacity-[0.07]" width="520" height="560" viewBox="0 0 520 560" fill="none" stroke="#02F5A1" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round">
          <path d="M470 40 H70 L330 280 L70 520 H470" />
        </svg>
      </div>

      <div className="relative flex-1 flex flex-col w-full max-w-[752px] mx-auto min-h-0">
        <Link href="/" className="shrink-0 w-fit">
          <Image src="/brand/logo-dark.svg" alt="tok∑ner" width={150} height={47} priority />
        </Link>
        <div className="flex-1 flex flex-col mt-6 min-h-0">{children}</div>
        <p className="text-text-tertiary text-[11px] mt-4 shrink-0 font-code [@media(max-height:800px)]:hidden">
          &copy; {new Date().getFullYear()} tok&sum;ner &middot; SOC 2 Type II in progress
        </p>
      </div>
    </div>
  );
}
