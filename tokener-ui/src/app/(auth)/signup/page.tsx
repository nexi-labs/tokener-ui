import { Suspense } from "react";
import { SignupView } from "./SignupView";

export const metadata = { title: "Sign up | tok∑ner" };

export default function SignupPage() {
  return <Suspense fallback={null}><SignupView /></Suspense>;
}
