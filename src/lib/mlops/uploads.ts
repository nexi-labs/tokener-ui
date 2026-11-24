/**
 * Model upload history. An upload is announced, its bytes are streamed, and the server inspects the file and decides. The server keeps the record of each one
 * (UploadSession.java): what was declared, what was received and what the inspection found. A person can abort one that is still open, and an upload nobody finishes
 * expires after 24 hours. The console only reads this record and sends the abort.
 */
export type UploadStatus = "open" | "receiving" | "accepted" | "rejected" | "aborted" | "expired";

export type UploadRecord = {
  id: string; modelName: string; fileName: string; format: string; framework: string; task: string; license: string;
  declaredBytes: number; receivedBytes: number; sha256: string;
  status: UploadStatus; createdBy: string; createdAt: string; expiresAt: string;
  summary: string; findings: string[]; modelId: string; version: number | null;
};

/** The server keeps at most three uploads in progress for one person. */
export const MAX_OPEN_PER_PERSON = 3;
/** An upload that is not finished closes after this long. */
export const SESSION_HOURS = 24;

const STATUSES: UploadStatus[] = ["open", "receiving", "accepted", "rejected", "aborted", "expired"];

/** Reads one server upload session. The status arrives in capitals. */
export function toUpload(x: Record<string, any>): UploadRecord {
  const st = String(x.status ?? "open").toLowerCase() as UploadStatus;
  return {
    id: String(x.id ?? ""), modelName: String(x.modelName ?? ""), fileName: String(x.fileName ?? ""), format: String(x.declaredFormat ?? x.format ?? "").toLowerCase(),
    framework: String(x.framework ?? ""), task: String(x.task ?? ""), license: String(x.license ?? ""),
    declaredBytes: Number(x.declaredBytes ?? 0), receivedBytes: Number(x.bytes ?? 0), sha256: String(x.sha256 ?? ""),
    status: STATUSES.includes(st) ? st : "open", createdBy: String(x.createdBy ?? ""), createdAt: String(x.createdAt ?? ""), expiresAt: String(x.expiresAt ?? ""),
    summary: String(x.summary ?? ""), findings: Array.isArray(x.findings) ? x.findings.map(String) : [],
    modelId: String(x.modelId ?? ""), version: typeof x.version === "number" ? x.version : null,
  };
}

/** An upload can be aborted until it has a verdict. */
export const canAbort = (u: UploadRecord) => u.status === "open" || u.status === "receiving";
export const inProgress = (list: UploadRecord[]) => list.filter(canAbort);

export const STATUS_LABEL: Record<UploadStatus, string> = {
  open: "Waiting for the file", receiving: "Receiving", accepted: "Accepted", rejected: "Rejected", aborted: "Aborted", expired: "Expired",
};
export const STATUS_TONE: Record<UploadStatus, "healthy" | "down" | "degraded" | "neutral" | "info"> = {
  open: "info", receiving: "info", accepted: "healthy", rejected: "down", aborted: "neutral", expired: "neutral",
};

/** Minutes until an open upload expires, or null when it is not open or has passed. */
export function minutesLeft(u: UploadRecord, now: number): number | null {
  if (!canAbort(u)) return null;
  const t = Date.parse(u.expiresAt);
  return Number.isFinite(t) && t > now ? Math.round((t - now) / 60000) : null;
}

/** "5 h 10 min" or "40 min". */
export function leftText(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/** The errors the server gives when an abort does not apply. */
export function abortProblem(u: UploadRecord | undefined): string | null {
  if (!u) return "That upload is not in the list.";
  return canAbort(u) ? null : `This upload already finished (${u.status}).`;
}

/** Newest first. */
export const newestFirst = (list: UploadRecord[]) => [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
