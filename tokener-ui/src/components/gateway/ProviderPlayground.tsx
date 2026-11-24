"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Form";
import { CodeBlock } from "@/components/mlops/Code";
import { sampleReply } from "@/lib/gateway/provider-catalog";

/**
 * Sends one prompt through the gateway to a single provider so a customer can see that the credential works end to end. Naming the provider in the
 * model string (`provider-id/model`) pins the request to it and skips routing. In the sample workspace the reply is a stand-in and says so.
 */
export function ProviderPlayground({ providerId, models }: { providerId: string; models: string[] }) {
  const [model, setModel] = useState(models[0] ?? "");
  const [prompt, setPrompt] = useState("Reply with the single word: ready");
  const [out, setOut] = useState<null | ReturnType<typeof sampleReply>>(null);
  const body = JSON.stringify({ model: `${providerId}/${model || "model"}`, messages: [{ role: "user", content: prompt }], max_tokens: 64 }, null, 2);
  const curl = `curl https://gateway.your-company.tokener.io/v1/chat/completions \\\n  -H "Authorization: Bearer $TOKENER_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        <Field label="Model">
          <Select value={model} onChange={(e) => setModel(e.target.value)} disabled={!models.length}>{models.length ? models.map((m) => <option key={m}>{m}</option>) : <option>No model enabled</option>}</Select>
        </Field>
        <Field label="Prompt">
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-600" />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!model || !prompt.trim()} onClick={() => setOut(sampleReply(model, prompt))}><Send size={14} /> Send through the gateway</Button>
        <span className="text-xs text-text-tertiary">Pinned to this provider, so routing and failover are skipped.</span>
      </div>
      {out && (
        <div className="rounded-md border border-border bg-surface-subtle p-4 space-y-2" aria-live="polite">
          <p className="text-[13px] text-text-primary">{out.text}</p>
          <p className="text-xs text-text-tertiary tabular-nums">{out.tokensIn} tokens in &middot; {out.tokensOut} tokens out &middot; {out.ms} ms &middot; sample reply</p>
        </div>
      )}
      <div>
        <div className="text-[13px] font-medium text-text-primary mb-1.5">The same call from your application</div>
        <CodeBlock code={curl} language="bash" title="curl" maxHeight={260} />
      </div>
    </div>
  );
}
