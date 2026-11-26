"use client";

import { LiveActivity } from "@/components/crucible/live/Activity";

/** The activity trail exists only in a signed-in workspace. The layout shows its tab to admins only. */
export default function ActivityPage() { return <LiveActivity />; }
