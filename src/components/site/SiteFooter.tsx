import Image from "next/image";
import Link from "next/link";
import { siGithub, siX, siLinkedin } from "simple-icons";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { FOOTER_COLS, FOOTER_LEGAL } from "@/lib/site";
import { Container } from "./ui";

export function SiteFooter() {
  return (
    <footer className="bg-ink-900 text-text-tertiary">
      <Container className="pt-14 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)] gap-x-8 gap-y-10">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Image src="/brand/logo-dark.svg" alt="tok∑ner" width={122} height={38} />
            <p className="text-xs leading-relaxed mt-4 max-w-[220px]">The enterprise control plane for the AI you call and the AI you run.</p>
            <div className="flex gap-3 mt-5">
              {[siGithub, siX, siLinkedin].map((ic) => (
                <a key={ic.title} href="#" aria-label={ic.title} className="text-text-tertiary hover:text-text-inverse">
                  <SimpleIcon icon={ic} size={17} />
                </a>
              ))}
            </div>
          </div>
          {FOOTER_COLS.map((c) => (
            <div key={c.title}>
              <h3 className="text-text-inverse text-xs font-semibold uppercase tracking-wider mb-3.5">{c.title}</h3>
              <ul className="flex flex-col gap-2">
                {c.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="text-[13px] hover:text-text-inverse transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-xs">
          <span>&copy; {new Date().getFullYear()} tok&#8721;ner. All rights reserved.</span>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            {FOOTER_LEGAL.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-text-inverse transition-colors">{l.label}</Link>
            ))}
          </nav>
        </div>
      </Container>
    </footer>
  );
}
