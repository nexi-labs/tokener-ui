import type { IntegrationDef, IntegrationStatus } from "./types";

type J = Record<string, any>;

/** The manifest the control plane stores for a connector. It is the console definition without the parts only the console holds (the published block). */
export function toManifest(def: IntegrationDef): J {
  const m: J = {
    id: def.id, name: def.name, vendor: def.vendor, family: def.family, icon: def.icon, status: def.status, blurb: def.blurb, versionTarget: def.versionTarget,
    auth: def.auth, prerequisites: def.prerequisites, capabilities: def.capabilities, limitations: def.limitations, permissions: def.permissions,
    fields: def.fields, docs: def.docs, privateConnectivity: def.privateConnectivity === true,
  };
  if (def.wave !== undefined) m.wave = def.wave;
  if (def.compliance?.length) m.compliance = def.compliance;
  if (def.contract) m.contract = def.contract;
  return m;
}

/** The console definition for a manifest, with the status the listing holds. */
export function defFromManifest(mf: J, status: IntegrationStatus): IntegrationDef {
  return {
    id: String(mf.id), name: String(mf.name ?? mf.id), vendor: String(mf.vendor ?? ""), family: (mf.family ?? "other") as IntegrationDef["family"], icon: mf.icon as IntegrationDef["icon"],
    status, wave: mf.wave as IntegrationDef["wave"], blurb: String(mf.blurb ?? ""), versionTarget: String(mf.versionTarget ?? ""), auth: (mf.auth ?? []) as IntegrationDef["auth"],
    prerequisites: mf.prerequisites ?? [], capabilities: mf.capabilities ?? [], limitations: mf.limitations ?? [], permissions: mf.permissions ?? { read: [], write: [] },
    compliance: mf.compliance, fields: mf.fields ?? [], docs: mf.docs ?? [], privateConnectivity: mf.privateConnectivity === true, contract: mf.contract,
  };
}

/**
 * What an organization sees of a listing from GET /integrations. A listing the platform has switched off, or one that is on the roadmap, cannot be connected,
 * so it reads as Planned and says why. Connections that already use it keep resolving by id.
 */
export function defFromOrgListing(x: J): IntegrationDef {
  const status = String(x.status ?? "planned").toLowerCase() as IntegrationStatus;
  const def = defFromManifest(x, status);
  if (x.usable === false && status !== "planned") return { ...def, status: "planned", limitations: ["Switched off by the platform administrators.", ...def.limitations] };
  return def;
}
