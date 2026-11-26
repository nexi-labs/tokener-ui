import { redirect } from "next/navigation";

/** The Graph used to be its own page. It is now a view inside Constellation, so old links land there. */
export default async function GraphPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { agent } = await searchParams;
  redirect(`/agents/constellation?view=graph${agent ? `&agent=${encodeURIComponent(agent)}` : ""}`);
}
