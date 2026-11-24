import { siPython, siNodedotjs, siGo, siRust, siOpenjdk, siDotnet } from "simple-icons";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { Container, Eyebrow, H2 } from "@/components/site/ui";
import { CodeTabs } from "@/components/site/CodeTabs";

export const metadata = { title: "SDKs | tok∑ner" };

const SDKS = [
  [siPython, "Python"], [siNodedotjs, "Node.js"], [siGo, "Go"], [siRust, "Rust"], [siOpenjdk, "Java"], [siDotnet, ".NET"],
] as const;

export default function SdksPage() {
  return (
    <Container className="py-14 sm:py-20 max-w-[960px]">
      <Eyebrow>SDKs</Eyebrow>
      <H2>Generated from the spec, typed end to end.</H2>
      <p className="text-text-secondary mt-4 leading-relaxed max-w-2xl">
        SDKs for Java, Python, Go, Node.js, Rust, and .NET are generated from the same OpenAPI specification that documents the API, and they surface typed exceptions mapped from error codes. Until the packages are published, any OpenAI-compatible client works against the gateway.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-10">
        {SDKS.map(([ic, name]) => (
          <div key={name} className="rounded-xl border border-border p-6 flex items-center gap-3">
            <SimpleIcon icon={ic} size={26} className="text-ink-800" />
            <span className="font-medium text-text-primary">{name}</span>
          </div>
        ))}
      </div>
      <div className="mt-12">
        <CodeTabs
          tabs={[
            { label: "Typed errors (Java)", lang: "java", code: `try {
    client.chat().completions().create(request);
} catch (TokenerBudgetExceededException e) {
    log.warn("Budget exhausted for {}", e.getScope());
}` },
            { label: "Typed errors (Go)", lang: "go", code: `_, err := client.Chat.Completions.Create(ctx, req)
var be *tokener.BudgetExceededError
if errors.As(err, &be) {
    log.Printf("budget exhausted for %s", be.Scope)
}` },
          ]}
        />
      </div>
    </Container>
  );
}
