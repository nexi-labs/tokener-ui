import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { CodeBlock } from "@/components/mlops/Code";
import { Notice } from "@/components/mlops/ui";
import { siPython, siNodedotjs, siGo, siRust, siOpenjdk, siDotnet } from "simple-icons";

/**
 * What a team can actually use today. The gateway speaks the OpenAI chat completions shape, so the OpenAI client libraries work against it with a
 * different base URL and an application key. Tokener's own client libraries are not published, and this page does not pretend otherwise.
 */
const PLANNED = [
  { lang: "Python", icon: siPython }, { lang: "Node.js", icon: siNodedotjs }, { lang: "Go", icon: siGo },
  { lang: "Rust", icon: siRust }, { lang: "Java", icon: siOpenjdk }, { lang: ".NET", icon: siDotnet },
];

const PYTHON = `from openai import OpenAI

client = OpenAI(
    base_url="https://<your-gateway-host>/v1",
    api_key="<application key>",
)

reply = client.chat.completions.create(
    model="<model id from GET /v1/models>",
    messages=[{"role": "user", "content": "Hello"}],
)
print(reply.choices[0].message.content)`;

const NODE = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://<your-gateway-host>/v1",
  apiKey: process.env.TOKENER_API_KEY,
});

const reply = await client.chat.completions.create({
  model: "<model id from GET /v1/models>",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(reply.choices[0].message.content);`;

const CURL = `curl https://<your-gateway-host>/v1/chat/completions \\
  -H "Authorization: Bearer $TOKENER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "<model id>",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;

const GENERATE = `# The specification is served here. It is off by
# default in the production profile.
curl https://<your-control-plane-host>/v1/openapi \\
  -o tokener-openapi.json

# Generate a client in the language you use
npx @openapitools/openapi-generator-cli generate \\
  -i tokener-openapi.json -g python -o tokener-client`;

export default function SdksPage() {
  return (
    <>
      <PageHeader title="SDK Downloads" description="How to call the platform from code today, and which client libraries are planned." />

      <div className="mb-6 max-w-3xl">
        <Notice tone="info" title="Tokener client libraries are not published yet">
          There are no packages to download. The gateway accepts OpenAI style requests, so the OpenAI client library for your language works today. Keys are issued to an application on the{" "}
          <Link href="/api-keys" className="underline underline-offset-2">API Keys</Link> screen.
        </Notice>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-6xl">
        <Card>
          <CardHeader title="Python" subtitle="With the OpenAI client library" />
          <div className="px-6 pb-5"><CodeBlock code={PYTHON} language="python" title="python" maxHeight={420} /></div>
        </Card>
        <Card>
          <CardHeader title="Node.js" subtitle="With the OpenAI client library" />
          <div className="px-6 pb-5"><CodeBlock code={NODE} language="javascript" title="node" maxHeight={420} /></div>
        </Card>
        <Card>
          <CardHeader title="Any language" subtitle="Plain HTTP" />
          <div className="px-6 pb-5"><CodeBlock code={CURL} language="bash" title="curl" maxHeight={420} /></div>
          <p className="px-6 pb-5 -mt-2 text-xs text-text-tertiary">Replace the host with your deployment's gateway address. The models your key may use are listed by <span className="font-mono">GET /v1/models</span>.</p>
        </Card>
        <Card>
          <CardHeader title="Generate a client" subtitle="From the OpenAPI specification" />
          <div className="px-6 pb-5"><CodeBlock code={GENERATE} language="bash" title="shell" maxHeight={420} /></div>
          <p className="px-6 pb-5 -mt-2 text-xs text-text-tertiary">The specification describes the control plane routes the server has today.</p>
        </Card>
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold text-text-primary">Planned client libraries</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 max-w-6xl">
        {PLANNED.map((s) => (
          <div key={s.lang} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="h-9 w-9 rounded-md bg-surface-muted flex items-center justify-center shrink-0"><SimpleIcon icon={s.icon} size={18} monochrome={false} /></div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">{s.lang}</div>
              <Badge tone="neutral">Planned</Badge>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
