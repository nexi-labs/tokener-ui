"use client";

import "@fontsource/caveat/latin-600.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import { BadgeCheck, FileText, Gauge, KeyRound, Network, ScrollText, ShieldCheck, UserPlus, type LucideIcon } from "lucide-react";

export type AsideKind = "signup" | "recovery" | "invite" | "access";

type Point = { icon: LucideIcon; title: string; body: string };
type Aside = { eyebrow: string; lead: string; hand: string; body: string; points?: Point[]; steps?: string[]; note: string };

const ASIDES: Record<AsideKind, Aside> = {
  signup: {
    eyebrow: "Get started free",
    lead: "Put one control plane in front of",
    hand: "every model you use.",
    body: "Create your organization in a few minutes and start with free usage credit. You can try any feature, and a payment method is asked for only when you save or launch something metered.",
    points: [
      { icon: Network, title: "One gateway for every provider", body: "Route requests to the models you already pay for, with keys kept as references and never copied." },
      { icon: Gauge, title: "Budgets and quotas on each request", body: "Set limits per team, tenant or application and see spend as it happens." },
      { icon: ScrollText, title: "An audit trail you can hand over", body: "Who asked, which model answered, under which policy and at what cost, exportable as evidence." },
    ],
    steps: ["Tell us who you are", "Open the link we email you", "Choose a password and start"],
    note: "free to start",
  },
  recovery: {
    eyebrow: "Account recovery",
    lead: "Back in, with the same",
    hand: "audit trail intact.",
    body: "Resetting a password signs you out everywhere else and is recorded, so the trail stays complete.",
    points: [
      { icon: ShieldCheck, title: "Links work once", body: "Each link expires on its own and stops working after it is used." },
      { icon: KeyRound, title: "Other sessions end", body: "Every device that was signed in is signed out when the password changes." },
    ],
    note: "recorded in the security log",
  },
  invite: {
    eyebrow: "You are invited",
    lead: "Your team is already",
    hand: "working here.",
    body: "Choose a password and you are in, with the access your administrator gave you and nothing more.",
    points: [
      { icon: UserPlus, title: "Access set by your administrator", body: "Your role and the tenants you can reach were chosen for you." },
      { icon: ShieldCheck, title: "Every action is attributable", body: "Changes you make are tied to your account in the audit trail." },
    ],
    note: "one step left",
  },
  access: {
    eyebrow: "Request access",
    lead: "Join the organization",
    hand: "that already runs here.",
    body: "An administrator of your organization reviews each request. When it is approved you get an email with a link to set a password.",
    points: [
      { icon: BadgeCheck, title: "Reviewed by a person", body: "Nobody is added automatically, so access stays deliberate." },
      { icon: FileText, title: "Say what you need", body: "A line on what you will use it for helps the reviewer answer quickly." },
    ],
    note: "approved by an administrator",
  },
};

function Underline() {
  return (
    <svg className="absolute left-0 right-0 -bottom-1.5 w-full h-2.5 overflow-visible" viewBox="0 0 200 10" preserveAspectRatio="none" fill="none" aria-hidden>
      <path d="M2 6 C 30 1, 55 9, 90 5 S 150 2, 198 6" stroke="#02F5A1" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** What the brand panel says beside a form: the benefit of the step the person is on, in the same voice as the sign-in carousel. */
export function AuthAside({ kind }: { kind: AsideKind }) {
  const a = ASIDES[kind];
  return (
    <div className="tok-keep relative flex-1 flex flex-col min-h-0">
      <div className="mt-[clamp(8px,6vh,56px)]">
        <p className="font-code text-accent-500 text-[11px] font-medium tracking-[0.2em] uppercase mb-3">{a.eyebrow}</p>
        <h2 className="font-editorial text-text-inverse text-[2.5rem] xl:text-[3rem] leading-[1.04] max-w-[640px]">
          {a.lead}{" "}
          <span className="relative inline-block font-hand text-accent-500 text-[2.8rem] xl:text-[3.3rem] leading-[0.9] -rotate-1 whitespace-nowrap">
            {a.hand}
            <Underline />
          </span>
        </h2>
        <p className="text-text-tertiary text-[15px] leading-relaxed mt-5 max-w-[560px]">{a.body}</p>

        {a.points && (
          <ul className="mt-9 flex flex-col gap-5 max-w-[560px] [@media(max-height:760px)]:hidden">
            {a.points.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="mt-0.5 h-9 w-9 shrink-0 rounded-md border border-accent-500/30 bg-accent-500/[0.07] grid place-items-center text-accent-500"><p.icon size={17} strokeWidth={1.75} /></span>
                <div>
                  <p className="text-text-inverse text-[14.5px] font-medium">{p.title}</p>
                  <p className="text-text-tertiary text-[13.5px] leading-relaxed mt-0.5">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {a.steps && (
          <ol className="mt-9 flex flex-wrap items-center gap-x-3 gap-y-2 font-code text-[11.5px] text-text-tertiary [@media(max-height:700px)]:hidden">
            {a.steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border border-accent-500/50 text-accent-500 grid place-items-center text-[10px]">{i + 1}</span>{s}</span>
                {i < a.steps!.length - 1 && <span aria-hidden className="text-accent-500/50">&rarr;</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="mt-auto pt-6 font-hand text-accent-500 text-[1.45rem] leading-none -rotate-1 w-fit">{a.note}</p>
    </div>
  );
}
