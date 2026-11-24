/**
 * Data quality gate for model approval. A model version records which dataset it was trained on and that dataset's quality when it was prepared.
 * When the gate is on, an approver cannot approve a version whose training data scored below the organisation's thresholds. An admin can approve
 * anyway with a written reason, which lands in the audit log.
 *
 * The scores are those of the Refinery data preparation report: the quality score (completeness, uniqueness, consistency, validity) and, for time series,
 * the sensor quality score. They are indicators set by the product, not certifications.
 */
export type TrainingData = {
  datasetId: string; datasetName: string; datasetVersion: number; quality: number; sensorQuality?: number;
  /** Document id of the Refinery report that measured these scores. */
  reportId?: string; measuredAt: string;
};
export type DataQualityGate = { enabled: boolean; minQuality: number; minSensorQuality: number; requireTrainingData: boolean };
export const DEFAULT_GATE: DataQualityGate = { enabled: true, minQuality: 80, minSensorQuality: 85, requireTrainingData: false };
export type GateCheck = { label: string; ok: boolean; detail: string };
export type GateResult = { status: "off" | "pass" | "fail" | "missing"; checks: GateCheck[]; summary: string };

export const gateOf = (s: { dataQualityGate?: DataQualityGate }): DataQualityGate => ({ ...DEFAULT_GATE, ...(s.dataQualityGate ?? {}) });

export function evaluateGate(gate: DataQualityGate, td: TrainingData | undefined): GateResult {
  if (!gate.enabled) return { status: "off", checks: [], summary: "The data quality gate is off." };
  if (!td) return gate.requireTrainingData
    ? { status: "missing", checks: [{ label: "Training data recorded", ok: false, detail: "This version does not say which dataset it was trained on, and the organisation requires it." }], summary: "Blocked: no training data recorded." }
    : { status: "pass", checks: [{ label: "Training data recorded", ok: true, detail: "Not recorded. The organisation does not require it, so the gate has nothing to check." }], summary: "No training data recorded. Nothing to check." };
  const checks: GateCheck[] = [{ label: "Quality score", ok: td.quality >= gate.minQuality, detail: `${td.quality} against a minimum of ${gate.minQuality}.` }];
  if (td.sensorQuality !== undefined) checks.push({ label: "Sensor quality score", ok: td.sensorQuality >= gate.minSensorQuality, detail: `${td.sensorQuality} against a minimum of ${gate.minSensorQuality}.` });
  const failed = checks.filter((c) => !c.ok);
  return failed.length
    ? { status: "fail", checks, summary: `Blocked: ${failed.map((c) => `${c.label.toLowerCase()} ${c.detail.replace(/ against a minimum of /, " is below ").replace(/\.$/, "")}`).join("; ")}.` }
    : { status: "pass", checks, summary: "The training data meets the thresholds." };
}
