import { Suspense } from "react";
import { VerifyEmailView } from "./VerifyEmailView";

export const metadata = { title: "Verify your email | tok∑ner" };

export default function VerifyEmailPage() {
  return <Suspense fallback={null}><VerifyEmailView /></Suspense>;
}
