import { Suspense } from "react";
import { CallbackView } from "./CallbackView";

export const metadata = { title: "Signing you in | tok∑ner" };

export default function CallbackPage() {
  return <Suspense fallback={null}><CallbackView /></Suspense>;
}
