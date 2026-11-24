import type { Contract } from "../contract";

/**
 * Contracts for the integrations the platform ships. They are data, the same kind a platform admin publishes from the console, and the
 * generic runtime executes them. scripts/export-contracts.cjs writes them to the backend as JSON, so both sides read one source.
 *
 * The examples are written from each project's public API reference. They let the console show the request, the answer and the result
 * before anything is connected, and they are not proof against a live system: an entry stays marked as in development until a live
 * contract test has passed against a real instance.
 */

const ns = "{{params.namespace}}";
const NS_DISCOVER = "{{connection.options.namespace|default:default}}";

const deploymentBody = {
  apiVersion: "apps/v1", kind: "Deployment",
  metadata: { name: "{{params.name}}", namespace: ns, labels: { "app.kubernetes.io/name": "{{params.name}}", "app.kubernetes.io/managed-by": "tokener" } },
  spec: {
    replicas: "{{params.replicas}}",
    selector: { matchLabels: { "app.kubernetes.io/name": "{{params.name}}" } },
    template: { metadata: { labels: { "app.kubernetes.io/name": "{{params.name}}" } }, spec: { containers: [{ name: "model", image: "{{params.image}}", ports: [{ containerPort: "{{params.port}}" }] }] } },
  },
};

const deploymentExample = { status: 200, json: { metadata: { name: "support-intent", resourceVersion: "48211" }, spec: { replicas: 2 }, status: { readyReplicas: 2 } } };

const kubernetes: Contract = {
  version: "1",
  timeoutSec: 20,
  auth: { mode: "bearer" },
  test: [
    { name: "Reach the API server and read its version", request: { method: "GET", path: "/version" }, expect: { status: [200] }, version: "$.gitVersion", versionRange: { min: "1.28", max: "1.32" }, example: { status: 200, json: { major: "1", minor: "30", gitVersion: "v1.30.2" } } },
    { name: "Read the target namespace", request: { method: "GET", path: "/api/v1/namespaces/" + NS_DISCOVER }, expect: { status: [200] }, onFail: "PERMISSION", example: { status: 200, json: { metadata: { name: "models" }, status: { phase: "Active" } } } },
    { name: "Check permission to change deployments", scope: "full", requiresWrite: true, request: { method: "POST", path: "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews", body: { apiVersion: "authorization.k8s.io/v1", kind: "SelfSubjectAccessReview", spec: { resourceAttributes: { namespace: NS_DISCOVER, verb: "patch", group: "apps", resource: "deployments" } } } }, expect: { status: [201], json: [{ path: "$.status.allowed", equals: "true" }] }, onFail: "PERMISSION", example: { status: 201, json: { status: { allowed: true } } } },
  ],
  discover: [
    { kind: "namespaces", request: { method: "GET", path: "/api/v1/namespaces" }, items: "$.items", name: "$.metadata.name", attributes: { phase: "$.status.phase" }, example: { status: 200, json: { items: [{ metadata: { name: "models" }, status: { phase: "Active" } }, { metadata: { name: "staging" }, status: { phase: "Active" } }] } } },
    { kind: "deployments", request: { method: "GET", path: "/apis/apps/v1/namespaces/" + NS_DISCOVER + "/deployments" }, items: "$.items", name: "$.metadata.name", namespace: "$.metadata.namespace", attributes: { replicas: "$.spec.replicas", ready: "$.status.readyReplicas" }, example: { status: 200, json: { items: [{ metadata: { name: "support-intent", namespace: "models" }, spec: { replicas: 2 }, status: { readyReplicas: 2 } }] } } },
  ],
  actions: {
    deploy: {
      description: "Create or update a Deployment with server-side apply, so only the fields tok∑ner sets are managed.", capability: "deploy", mode: "write",
      params: [{ name: "namespace", type: "string", required: true }, { name: "name", type: "string", required: true }, { name: "image", type: "string", required: true, description: "Image reference, pinned by digest." }, { name: "replicas", type: "number", default: 1 }, { name: "port", type: "number", default: 8080 }],
      plan: [{ action: "apply", target: { kind: "Deployment", namespace: ns, name: "{{params.name}}" }, summary: "Apply {{params.name}} in {{params.namespace}} with image {{params.image}}", risk: "medium" }],
      steps: [{ name: "Apply the Deployment", request: { method: "PATCH", path: `/apis/apps/v1/namespaces/${ns}/deployments/{{params.name}}`, query: { fieldManager: "tokener", force: "true" }, contentType: "application/apply-patch+yaml", body: deploymentBody }, expect: { status: [200, 201] }, capture: { resourceVersion: "$.metadata.resourceVersion" }, example: deploymentExample }],
      result: { resourceVersion: "$.metadata.resourceVersion", replicas: "$.spec.replicas" },
    },
    scale: {
      description: "Change the number of replicas.", capability: "scale", mode: "write",
      params: [{ name: "namespace", type: "string", required: true }, { name: "name", type: "string", required: true }, { name: "replicas", type: "number", required: true }],
      plan: [{ action: "scale", target: { kind: "Deployment", namespace: ns, name: "{{params.name}}" }, summary: "Set {{params.name}} to {{params.replicas}} replicas", risk: "medium" }],
      steps: [{ name: "Patch the scale subresource", request: { method: "PATCH", path: `/apis/apps/v1/namespaces/${ns}/deployments/{{params.name}}/scale`, contentType: "application/merge-patch+json", body: { spec: { replicas: "{{params.replicas}}" } } }, expect: { status: [200] }, example: { status: 200, json: { spec: { replicas: 4 }, status: { replicas: 2 } } } }],
      result: { replicas: "$.spec.replicas" },
    },
    rollback: {
      description: "Apply the previous revision's image again. tok∑ner keeps each deployed revision, so the earlier image and settings are passed in.", capability: "rollback", mode: "write",
      params: [{ name: "namespace", type: "string", required: true }, { name: "name", type: "string", required: true }, { name: "image", type: "string", required: true }, { name: "replicas", type: "number", default: 1 }, { name: "port", type: "number", default: 8080 }],
      plan: [{ action: "apply", target: { kind: "Deployment", namespace: ns, name: "{{params.name}}" }, summary: "Return {{params.name}} to image {{params.image}}", risk: "high" }],
      steps: [{ name: "Apply the previous revision", request: { method: "PATCH", path: `/apis/apps/v1/namespaces/${ns}/deployments/{{params.name}}`, query: { fieldManager: "tokener", force: "true" }, contentType: "application/apply-patch+yaml", body: deploymentBody }, expect: { status: [200, 201] }, example: deploymentExample }],
      result: { resourceVersion: "$.metadata.resourceVersion" },
    },
  },
  observe: {
    request: { method: "GET", path: `/apis/apps/v1/namespaces/${ns}/deployments/{{params.name}}` }, absentOn: [404],
    state: { ready: [{ path: "$.status.readyReplicas", equals: "$.spec.replicas" }], degraded: [{ path: "$.status.unavailableReplicas", exists: true }] },
    desired: "$.spec.replicas", ready: "$.status.readyReplicas", attributes: { generation: "$.metadata.generation", observedGeneration: "$.status.observedGeneration" }, example: deploymentExample,
  },
};

const mlflow: Contract = {
  version: "1", timeoutSec: 20, pathPrefix: "/api/2.0/mlflow", auth: { mode: "bearer" },
  test: [
    { name: "Reach the tracking server", request: { method: "GET", path: "/experiments/search", query: { max_results: "1" } }, expect: { status: [200] }, example: { status: 200, json: { experiments: [{ experiment_id: "0", name: "Default" }] } } },
    { name: "Read the model registry", request: { method: "GET", path: "/registered-models/search", query: { max_results: "1" } }, expect: { status: [200] }, onFail: "PERMISSION", example: { status: 200, json: { registered_models: [{ name: "support-intent" }] } } },
  ],
  discover: [{ kind: "models", request: { method: "GET", path: "/registered-models/search", query: { max_results: "100" } }, items: "$.registered_models", name: "$.name", attributes: { latestVersion: "$.latest_versions[0].version", stage: "$.latest_versions[0].current_stage" }, example: { status: 200, json: { registered_models: [{ name: "support-intent", latest_versions: [{ version: "7", current_stage: "Production" }] }, { name: "ticket-router", latest_versions: [{ version: "3", current_stage: "Staging" }] }] } } }],
  actions: {
    "resolve-model": {
      description: "Find a model version and the location of its files.", capability: "registry-read", mode: "read",
      params: [{ name: "name", type: "string", required: true }, { name: "version", type: "string", required: true }],
      steps: [{ name: "Read the model version", request: { method: "GET", path: "/model-versions/get", query: { name: "{{params.name}}", version: "{{params.version}}" } }, expect: { status: [200] }, example: { status: 200, json: { model_version: { name: "support-intent", version: "7", source: "s3://nexi-models/support-intent/7", current_stage: "Production", run_id: "a1b2c3" } } } }],
      result: { source: "$.model_version.source", stage: "$.model_version.current_stage", runId: "$.model_version.run_id" },
    },
    metrics: {
      description: "Read the metrics logged for a run.", capability: "metrics", mode: "read",
      params: [{ name: "runId", type: "string", required: true }],
      steps: [{ name: "Read the run", request: { method: "GET", path: "/runs/get", query: { run_id: "{{params.runId}}" } }, expect: { status: [200] }, example: { status: 200, json: { run: { data: { metrics: [{ key: "f1", value: 0.91 }] } } } } }],
      result: { metrics: "$.run.data.metrics" },
    },
  },
};

const prometheus: Contract = {
  version: "1", timeoutSec: 20, auth: { mode: "bearer" },
  test: [
    { name: "Read build information", request: { method: "GET", path: "/api/v1/status/buildinfo" }, expect: { status: [200], json: [{ path: "$.status", equals: "success" }] }, version: "$.data.version", versionRange: { min: "2.30" }, example: { status: 200, json: { status: "success", data: { version: "2.53.1" } } } },
    { name: "Run a query", request: { method: "GET", path: "/api/v1/query", query: { query: "vector(1)" } }, expect: { status: [200], json: [{ path: "$.status", equals: "success" }] }, onFail: "PERMISSION", example: { status: 200, json: { status: "success", data: { resultType: "vector", result: [] } } } },
  ],
  discover: [{ kind: "jobs", request: { method: "GET", path: "/api/v1/label/job/values" }, items: "$.data", name: "$", example: { status: 200, json: { status: "success", data: ["node", "prometheus", "model-gateway"] } } }],
  actions: {
    metrics: {
      description: "Run an instant query, for example the error rate of an endpoint.", capability: "metrics", mode: "read",
      params: [{ name: "query", type: "string", required: true, description: "A PromQL expression." }],
      steps: [{ name: "Query", request: { method: "GET", path: "/api/v1/query", query: { query: "{{params.query}}" } }, expect: { status: [200], json: [{ path: "$.status", equals: "success" }] }, example: { status: 200, json: { status: "success", data: { resultType: "vector", result: [{ metric: { job: "model-gateway" }, value: [1760000000, "0.002"] }] } } } }],
      result: { result: "$.data.result" },
    },
  },
};

const ociRegistry: Contract = {
  version: "1", timeoutSec: 20, auth: { mode: "basic" },
  test: [
    { name: "Reach the registry", request: { method: "GET", path: "/v2/" }, expect: { status: [200] }, example: { status: 200, json: {} } },
    { name: "List repositories", request: { method: "GET", path: "/v2/_catalog", query: { n: "1" } }, expect: { status: [200] }, onFail: "PERMISSION", example: { status: 200, json: { repositories: ["nexi/support-intent"] } } },
  ],
  discover: [{ kind: "repositories", request: { method: "GET", path: "/v2/_catalog", query: { n: "100" } }, items: "$.repositories", name: "$", example: { status: 200, json: { repositories: ["nexi/support-intent", "nexi/ticket-router"] } } }],
  actions: {
    "list-tags": {
      description: "List the tags of a repository.", capability: "registry-read", mode: "read",
      params: [{ name: "repository", type: "string", required: true }],
      steps: [{ name: "List tags", request: { method: "GET", path: "/v2/{{params.repository|path}}/tags/list" }, expect: { status: [200] }, example: { status: 200, json: { name: "nexi/support-intent", tags: ["1.0.0", "1.1.0"] } } }],
      result: { tags: "$.tags" },
    },
  },
};

const kserveIsvc = (spec: unknown) => ({ apiVersion: "serving.kserve.io/v1beta1", kind: "InferenceService", metadata: { name: "{{params.name}}", namespace: ns, labels: { "app.kubernetes.io/managed-by": "tokener" } }, spec });
const kserveModel = { predictor: { model: { modelFormat: { name: "{{params.format}}" }, storageUri: "{{params.storageUri}}" } } };
const isvcPath = `/apis/serving.kserve.io/v1beta1/namespaces/${ns}/inferenceservices/{{params.name}}`;
const isvcExample = { status: 200, json: { metadata: { name: "support-intent", resourceVersion: "9001" }, status: { modelStatus: { states: { activeModelState: "Loaded" } } } } };
const nsParams = [{ name: "namespace", type: "string" as const, required: true }, { name: "name", type: "string" as const, required: true }];
const modelParams = [...nsParams, { name: "format", type: "string" as const, required: true, description: "Model format, for example sklearn or pytorch." }, { name: "storageUri", type: "string" as const, required: true }];

const kserve: Contract = {
  version: "1", via: "kubernetes", timeoutSec: 20, auth: { mode: "bearer" },
  test: [
    { name: "Find the InferenceService API", request: { method: "GET", path: "/apis/serving.kserve.io/v1beta1" }, expect: { status: [200] }, onFail: "UNSUPPORTED", example: { status: 200, json: { kind: "APIResourceList", groupVersion: "serving.kserve.io/v1beta1" } } },
    { name: "List InferenceServices in the namespace", request: { method: "GET", path: `/apis/serving.kserve.io/v1beta1/namespaces/${NS_DISCOVER}/inferenceservices`, query: { limit: "1" } }, expect: { status: [200] }, onFail: "PERMISSION", example: { status: 200, json: { items: [] } } },
  ],
  discover: [{ kind: "inferenceservices", request: { method: "GET", path: `/apis/serving.kserve.io/v1beta1/namespaces/${NS_DISCOVER}/inferenceservices` }, items: "$.items", name: "$.metadata.name", namespace: "$.metadata.namespace", example: { status: 200, json: { items: [{ metadata: { name: "support-intent", namespace: "models" } }] } } }],
  actions: {
    deploy: { description: "Create or update an InferenceService.", capability: "deploy", mode: "write", params: modelParams,
      plan: [{ action: "apply", target: { kind: "InferenceService", namespace: ns, name: "{{params.name}}" }, summary: "Serve {{params.storageUri}} as {{params.name}}", risk: "medium" }],
      steps: [{ name: "Apply the InferenceService", request: { method: "PATCH", path: isvcPath, query: { fieldManager: "tokener", force: "true" }, contentType: "application/apply-patch+yaml", body: kserveIsvc(kserveModel) }, expect: { status: [200, 201] }, example: isvcExample }], result: { resourceVersion: "$.metadata.resourceVersion" } },
    canary: { description: "Send a share of traffic to the new model and keep the rest on the previous one.", capability: "canary", mode: "write", params: [...modelParams, { name: "percent", type: "number", required: true }],
      plan: [{ action: "canary", target: { kind: "InferenceService", namespace: ns, name: "{{params.name}}" }, summary: "Send {{params.percent}} percent of traffic to {{params.storageUri}}", risk: "high" }],
      steps: [{ name: "Apply with a canary share", request: { method: "PATCH", path: isvcPath, query: { fieldManager: "tokener", force: "true" }, contentType: "application/apply-patch+yaml", body: kserveIsvc({ predictor: { canaryTrafficPercent: "{{params.percent}}", model: kserveModel.predictor.model } }) }, expect: { status: [200, 201] }, example: isvcExample }], result: { resourceVersion: "$.metadata.resourceVersion" } },
    promote: { description: "Move all traffic to the latest model.", capability: "traffic-split", mode: "write", params: [...modelParams],
      plan: [{ action: "promote", target: { kind: "InferenceService", namespace: ns, name: "{{params.name}}" }, summary: "Send all traffic to {{params.storageUri}}", risk: "high" }],
      steps: [{ name: "Apply with all traffic", request: { method: "PATCH", path: isvcPath, query: { fieldManager: "tokener", force: "true" }, contentType: "application/apply-patch+yaml", body: kserveIsvc({ predictor: { canaryTrafficPercent: 100, model: kserveModel.predictor.model } }) }, expect: { status: [200, 201] }, example: isvcExample }], result: { resourceVersion: "$.metadata.resourceVersion" } },
    rollback: { description: "Apply the previous model again.", capability: "rollback", mode: "write", params: modelParams,
      plan: [{ action: "rollback", target: { kind: "InferenceService", namespace: ns, name: "{{params.name}}" }, summary: "Return {{params.name}} to {{params.storageUri}}", risk: "high" }],
      steps: [{ name: "Apply the previous model", request: { method: "PATCH", path: isvcPath, query: { fieldManager: "tokener", force: "true" }, contentType: "application/apply-patch+yaml", body: kserveIsvc({ predictor: { canaryTrafficPercent: 100, model: kserveModel.predictor.model } }) }, expect: { status: [200, 201] }, example: isvcExample }], result: { resourceVersion: "$.metadata.resourceVersion" } },
  },
  observe: { request: { method: "GET", path: isvcPath }, absentOn: [404], state: { ready: [{ path: "$.status.modelStatus.states.activeModelState", equals: "Loaded" }], failed: [{ path: "$.status.modelStatus.lastFailureInfo", exists: true }] }, example: isvcExample },
};

const ksvcPath = `/apis/serving.knative.dev/v1/namespaces/${ns}/services/{{params.name}}`;
const ksvc = (traffic: unknown) => ({ apiVersion: "serving.knative.dev/v1", kind: "Service", metadata: { name: "{{params.name}}", namespace: ns, labels: { "app.kubernetes.io/managed-by": "tokener" } }, spec: { template: { spec: { containers: [{ image: "{{params.image}}", ports: [{ containerPort: "{{params.port}}" }] }] } }, ...(traffic ? { traffic } : {}) } });
const ksvcExample = { status: 200, json: { metadata: { name: "support-intent", resourceVersion: "5521" }, status: { latestCreatedRevisionName: "support-intent-00004", latestReadyRevisionName: "support-intent-00004" } } };
const kParams = [...nsParams, { name: "image", type: "string" as const, required: true }, { name: "port", type: "number" as const, default: 8080 }];

const knative: Contract = {
  version: "1", via: "kubernetes", timeoutSec: 20, auth: { mode: "bearer" },
  test: [
    { name: "Find the Knative Serving API", request: { method: "GET", path: "/apis/serving.knative.dev/v1" }, expect: { status: [200] }, onFail: "UNSUPPORTED", example: { status: 200, json: { kind: "APIResourceList", groupVersion: "serving.knative.dev/v1" } } },
    { name: "List Services in the namespace", request: { method: "GET", path: `/apis/serving.knative.dev/v1/namespaces/${NS_DISCOVER}/services`, query: { limit: "1" } }, expect: { status: [200] }, onFail: "PERMISSION", example: { status: 200, json: { items: [] } } },
  ],
  discover: [{ kind: "services", request: { method: "GET", path: `/apis/serving.knative.dev/v1/namespaces/${NS_DISCOVER}/services` }, items: "$.items", name: "$.metadata.name", namespace: "$.metadata.namespace", example: { status: 200, json: { items: [{ metadata: { name: "support-intent", namespace: "models" } }] } } }],
  actions: {
    deploy: { description: "Create or update a Knative Service. Traffic follows the latest ready revision.", capability: "deploy", mode: "write", params: kParams,
      plan: [{ action: "apply", target: { kind: "Service", namespace: ns, name: "{{params.name}}" }, summary: "Serve image {{params.image}} as {{params.name}}", risk: "medium" }],
      steps: [{ name: "Apply the Service", request: { method: "PATCH", path: ksvcPath, query: { fieldManager: "tokener", force: "true" }, contentType: "application/apply-patch+yaml", body: ksvc(undefined) }, expect: { status: [200, 201] }, example: ksvcExample }], result: { revision: "$.status.latestCreatedRevisionName" } },
    rollback: { description: "Send all traffic back to an earlier revision.", capability: "rollback", mode: "write", params: [...nsParams, { name: "revision", type: "string", required: true }],
      plan: [{ action: "route", target: { kind: "Service", namespace: ns, name: "{{params.name}}" }, summary: "Send all traffic of {{params.name}} to revision {{params.revision}}", risk: "high" }],
      steps: [{ name: "Route to the revision", request: { method: "PATCH", path: ksvcPath, contentType: "application/merge-patch+json", body: { spec: { traffic: [{ revisionName: "{{params.revision}}", percent: 100 }] } } }, expect: { status: [200] }, example: ksvcExample }], result: { revision: "$.status.latestReadyRevisionName" } },
    split: { description: "Split traffic between two revisions.", capability: "traffic-split", mode: "write", params: [...nsParams, { name: "revision", type: "string", required: true }, { name: "previousRevision", type: "string", required: true }, { name: "percent", type: "number", required: true, description: "Share for the new revision, 0 to 100." }, { name: "previousPercent", type: "number", required: true }],
      plan: [{ action: "route", target: { kind: "Service", namespace: ns, name: "{{params.name}}" }, summary: "Send {{params.percent}} percent to {{params.revision}} and {{params.previousPercent}} percent to {{params.previousRevision}}", risk: "high" }],
      steps: [{ name: "Set the traffic split", request: { method: "PATCH", path: ksvcPath, contentType: "application/merge-patch+json", body: { spec: { traffic: [{ revisionName: "{{params.revision}}", percent: "{{params.percent}}" }, { revisionName: "{{params.previousRevision}}", percent: "{{params.previousPercent}}" }] } } }, expect: { status: [200] }, example: ksvcExample }], result: { revision: "$.status.latestReadyRevisionName" } },
  },
  observe: { request: { method: "GET", path: ksvcPath }, absentOn: [404], state: { ready: [{ path: "$.status.latestReadyRevisionName", equals: "$.status.latestCreatedRevisionName" }] }, example: ksvcExample },
};

export const SHIPPED_CONTRACTS: Record<string, Contract> = { kubernetes, mlflow, prometheus, "oci-registry": ociRegistry, kserve, knative };
