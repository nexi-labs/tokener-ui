import { Suspense } from "react";
import { ResetView } from "./ResetView";

export const metadata = { title: "Reset password | tok∑ner" };

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetView /></Suspense>;
}
