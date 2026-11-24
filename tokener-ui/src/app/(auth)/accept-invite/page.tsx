import { Suspense } from "react";
import { AcceptInviteView } from "./AcceptInviteView";

export const metadata = { title: "Accept invitation | tok∑ner" };

export default function AcceptInvitePage() {
  return <Suspense fallback={null}><AcceptInviteView /></Suspense>;
}
