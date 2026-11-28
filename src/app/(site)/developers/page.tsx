import Link from "next/link";
import { Terminal, BookOpen, Braces, Boxes, AlertTriangle, Map } from "lucide-react";
import { Container, PageHero, Eyebrow, H2, LinkButton, Screenshot, CtaBand } from "@/components/site/ui";
import { CodeTabs } from "@/components/site/CodeTabs";

export const metadata = { title: "Developers | tok∑ner" };

const CARDS = [
  { icon: Terminal, title: "Quickstart", body: "Create a key and make your first governed request.", href: "/developers/quickstart" },
  { icon: BookOpen, title: "Guides", body: "Concepts, policies, budgets, and documents explained.", href: "/developers/docs" },
  { icon: Braces, title: "API reference", body: "Data plane and control plane endpoints.", href: "/developers/api" },
  { icon: Boxes, title: "SDKs", body: "Generated clients for six languages.", href: "/developers/sdks" },
  { icon: AlertTriangle, title: "Errors", body: "A typed contract you can switch on.", href: "/developers/errors" },
  { icon: Map, title: "Platform scope", body: "What the platform covers, area by area.", href: "/developers/changelog" },
];

const SNIPPETS = [
  { label: "Stream (Node.js)", lang: "javascript", code: `const stream = await client.chat.completions.create({
  model: "chat-default",
  messages: [{ role: "user", content: "Draft a release note." }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}` },
  { label: "Embeddings (Python)", lang: "python", code: `emb = client.embeddings.create(
    model="embed-default",
    input=["policy as data", "budgets before invoices"],
)
print(len(emb.data[0].embedding))` },
  { label: "Handle a block (Python)", lang: "python", code: `import openai

try:
    client.chat.completions.create(model="chat-default", messages=msgs)
except openai.RateLimitError as e:
    body = e.response.json()["error"]
    if body["code"] == "budget_exceeded":
        notify_owner(body["details"]["scope"])` },
];

export default function DevelopersPage() {
  return (
    <>
      <PageHero eyebrow="Developers" title="Governed AI calls with the client you already use." lead="OpenAI-compatible endpoints, typed errors and a control plane API.">
        <LinkButton href="/developers/quickstart" arrow>Start the quickstart</LinkButton>
        <LinkButton href="/developers/api" variant="ghost-dark">API reference</LinkButton>
      </PageHero>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <Link key={c.href} href={c.href} className="rounded-xl border border-border p-6 hover:border-border-strong hover:shadow-card transition-all">
                  <Icon size={20} strokeWidth={1.6} className="text-ink-500 mb-4" />
                  <h2 className="font-semibold text-text-primary">{c.title}</h2>
                  <p className="text-sm text-text-secondary mt-1.5">{c.body}</p>
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20 bg-ink-800">
        <Container className="grid lg:grid-cols-[0.8fr_1.2fr] gap-10 items-center">
          <div>
            <Eyebrow dark>Examples</Eyebrow>
            <H2 dark className="text-[1.6rem] sm:text-[2rem]">Everything works the way you expect.</H2>
            <p className="text-text-tertiary mt-4 leading-relaxed">Streaming, embeddings, and tool calls pass straight through. When policy, budget, or quota stops a request, you get a typed error with the scope and the numbers.</p>
          </div>
          <CodeTabs tabs={SNIPPETS} />
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <Eyebrow>Keys and service accounts</Eyebrow>
            <H2 className="text-[1.6rem] sm:text-[2rem]">One key per application, scoped and revocable.</H2>
            <p className="text-text-secondary mt-4 leading-relaxed">Create keys in the console or through the control plane API. Keys are shown once, hashed at rest, and tied to a project so budgets and quotas apply automatically. Workloads that already have an identity can use short-lived JWTs through service accounts.</p>
          </div>
          <Screenshot src="/screens/api-keys.webp" url="app.tokener.io/api-keys" alt="API keys page in the console" />
        </Container>
      </section>
      <CtaBand title="Ship governed AI features today." />
    </>
  );
}
