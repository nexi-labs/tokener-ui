import { Container, Eyebrow, H2, Screenshot, LinkButton } from "@/components/site/ui";
import { Code } from "@/components/site/CodeTabs";

export const metadata = { title: "Quickstart | tok∑ner" };

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid md:grid-cols-[48px_1fr] gap-4 md:gap-6">
      <div className="h-10 w-10 rounded-full bg-ink-800 text-accent-500 font-mono text-sm flex items-center justify-center">{n}</div>
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
        <div className="mt-3 flex flex-col gap-4 text-text-secondary leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export default function QuickstartPage() {
  return (
    <Container className="py-14 sm:py-20 max-w-[900px]">
      <Eyebrow>Quickstart</Eyebrow>
      <H2>Your first governed request in five minutes.</H2>
      <div className="mt-12 flex flex-col gap-14">
        <Step n={1} title="Create an API key">
          <p>Open API Keys in the Developer group of the console, choose a project, and create a key. Copy it now, because it is shown once.</p>
          <Screenshot src="/screens/api-keys.webp" url="app.tokener.io/api-keys" alt="Creating an API key" />
        </Step>
        <Step n={2} title="Point your client at the gateway">
          <p>Set the base URL and key. Nothing else in your code changes.</p>
          <Code lang="bash">{`export TOKENER_API_KEY=tok_live_...
export OPENAI_BASE_URL=https://api.tokener.io/v1
export OPENAI_API_KEY=$TOKENER_API_KEY`}</Code>
        </Step>
        <Step n={3} title="Make a request">
          <Code lang="bash">{`curl $OPENAI_BASE_URL/chat/completions \\
  -H "Authorization: Bearer $TOKENER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"chat-default","messages":[{"role":"user","content":"Hello"}]}'`}</Code>
          <p>The model name is an alias. The Model Registry maps it to a provider and model, so you can change the target without touching code.</p>
        </Step>
        <Step n={4} title="See it in the console">
          <p>Open Usage Explorer. The request appears with its tokens, cost, latency, policy decision, and the provider that served it.</p>
          <Screenshot src="/screens/analytics.webp" url="app.tokener.io/analytics" alt="Analytics Explorer" />
        </Step>
        <Step n={5} title="Set a budget">
          <p>Create a project budget so a bug cannot become an invoice. Choose a token ceiling, a cost ceiling, or both.</p>
          <Screenshot src="/screens/budget-new.webp" url="app.tokener.io/budgets/new" alt="Creating a budget" />
          <Code lang="http">{`POST /api/v1/budgets`}</Code>
        </Step>
      </div>
      <div className="mt-14 flex flex-wrap gap-3">
        <LinkButton href="/developers/api" variant="ink" arrow>API reference</LinkButton>
        <LinkButton href="/developers/errors" variant="outline">Handle errors</LinkButton>
      </div>
    </Container>
  );
}
