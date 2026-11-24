export type TutorialStep = {
  title: string;
  body: string;
  code?: { title: string; lang: "bash" | "yaml" | "sql" | "ts" | "python" | "hcl" | "ini"; text: string };
  /** What a person does in the tok∑ner console for this step. */
  console?: string;
  /** A screenshot of the screen this step happens on. */
  shot?: { src: string; alt: string; url?: string };
};

export type Tutorial = {
  slug: string;
  title: string;
  summary: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  minutes: number;
  /** Optional note on scope, shown only when present. */
  availability?: string;
  prerequisites: string[];
  versions: string[];
  warnings: { kind: "Security" | "Cost" | "Data"; text: string }[];
  steps: TutorialStep[];
  verification: string[];
  expected: string;
  cleanup: string[];
  troubleshooting: { problem: string; fix: string }[];
  references: { label: string; url: string }[];
  consoleLink?: { label: string; href: string };
};


export const TUTORIALS: Tutorial[] = [
  {
    slug: "secure-kubernetes-connection", title: "Connect a Kubernetes cluster securely", level: "Beginner", minutes: 20,
    summary: "Create a read-only, namespaced identity, verify what it can do, then connect it with TLS verification on.",
    prerequisites: ["kubectl 1.28 or later with access to the cluster", "Permission to create a ServiceAccount, Role and RoleBinding in one namespace", "The cluster API server reachable from the control plane, or an agent inside the network"],
    versions: ["Kubernetes 1.28 to 1.32"],
    warnings: [{ kind: "Security", text: "Never use cluster-admin for a connection. The role below is namespaced and read-only." }, { kind: "Security", text: "Do not paste the token into chat, tickets or source control. The wizard moves it to your secret manager." }],
    steps: [
      { title: "Create a namespace and a dedicated identity", body: "One ServiceAccount per connection keeps access reviewable and revocable.", code: { title: "Namespace and ServiceAccount", lang: "bash", text: "kubectl create namespace models\nkubectl -n models create serviceaccount tokener-discovery" } },
      { title: "Grant read-only discovery permissions", body: "Start with get, list and watch only. Add write verbs later, for the resources a pipeline needs.", code: { title: "tokener-discovery-role.yaml", lang: "yaml", text: "apiVersion: rbac.authorization.k8s.io/v1\nkind: Role\nmetadata:\n  name: tokener-discovery\n  namespace: models\nrules:\n  - apiGroups: [\"\"]\n    resources: [\"pods\", \"services\", \"events\"]\n    verbs: [\"get\", \"list\", \"watch\"]\n  - apiGroups: [\"apps\"]\n    resources: [\"deployments\"]\n    verbs: [\"get\", \"list\", \"watch\"]\n  - apiGroups: [\"serving.kserve.io\"]\n    resources: [\"inferenceservices\"]\n    verbs: [\"get\", \"list\", \"watch\"]\n---\napiVersion: rbac.authorization.k8s.io/v1\nkind: RoleBinding\nmetadata:\n  name: tokener-discovery\n  namespace: models\nsubjects:\n  - kind: ServiceAccount\n    name: tokener-discovery\n    namespace: models\nroleRef:\n  kind: Role\n  name: tokener-discovery\n  apiGroup: rbac.authorization.k8s.io" } },
      { title: "Check the permissions before connecting", body: "Confirm the identity can read and cannot write.", code: { title: "Verify with kubectl auth", lang: "bash", text: "kubectl auth can-i list pods -n models \\\n  --as=system:serviceaccount:models:tokener-discovery\n# yes\nkubectl auth can-i delete deployments -n models \\\n  --as=system:serviceaccount:models:tokener-discovery\n# no" } },
      { title: "Collect the endpoint, CA and a short-lived token", body: "Use a bounded token duration and rotate it. Where your platform supports it, prefer OIDC or workload identity over tokens.", code: { title: "Connection facts", lang: "bash", text: "# API server URL\nkubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'\n\n# CA certificate (public)\nkubectl config view --raw --minify \\\n  -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d > ca.crt\n\n# Token valid for 24 hours\nkubectl -n models create token tokener-discovery --duration=24h" } },
      { title: "Add the connection", body: "Choose Kubernetes, the environment, Kubernetes service-account token as the auth mode, paste the endpoint, upload the CA bundle, leave TLS verification on, and keep access read-only. Run the connectivity test and read each result.", console: "MLOps, Integrations, Add connection. Each failing check names its class: DNS, network, TLS, authentication, permission or version." },
    ],
    verification: ["The test passes DNS, network, TLS, authentication, permission and version checks", "The connection shows read-only access and a secret reference, not a secret"],
    expected: "A healthy connection labelled read-only, with a verified timestamp and a secretref:// reference.",
    cleanup: ["kubectl -n models delete rolebinding,role,serviceaccount tokener-discovery", "Delete the connection in the console. The secret stays in your secret manager until you delete it there."],
    troubleshooting: [{ problem: "x509: certificate signed by unknown authority", fix: "Provide the CA bundle from step 4. Do not turn TLS verification off." }, { problem: "Forbidden on the permission check", fix: "The RoleBinding is in a different namespace than the one selected, or a verb is missing from the Role." }, { problem: "Connection times out", fix: "The control plane cannot reach a private API server. Use an agent inside the network or a private link." }],
    references: [{ label: "Kubernetes RBAC", url: "https://kubernetes.io/docs/reference/access-authn-authz/rbac/" }, { label: "kubectl create token", url: "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_token/" }],
    consoleLink: { label: "Open Integrations", href: "/mlops/integrations" },
  },
  {
    slug: "register-model-deploy-endpoint", title: "Register a model and deploy an endpoint", level: "Beginner", minutes: 25,
    summary: "Walk the release pipeline end to end: register a version with provenance, plan, apply a canary, verify and promote.",
    prerequisites: ["A healthy staging Kubernetes or KServe connection", "An OCI registry connection", "A model artifact or image you control"],
    versions: ["KServe 0.13 or later"],
    warnings: [{ kind: "Cost", text: "Replicas and GPUs bill by the hour on most targets. The plan shows an estimate from list-price assumptions, not billed data." }],
    steps: [
      { title: "Open the model and read its provenance", body: "Check the commit, dataset hash, checksum, license and evaluation metrics before anything deploys.", console: "MLOps, Models, customer-support-classifier, version 4. Notice the pending approval and the signature state." },
      { title: "Create a pipeline from the release template", body: "The template is Source, Build, Validate, Register, Deploy canary, Verify, Promote and Notify. Choose the staging environment. Connections are suggested only from staging.", console: "MLOps, Pipelines, New pipeline. Choose Guided wizard or Visual builder. Both edit the same spec." },
      { title: "Review the plan and manifests", body: "The plan lists each step with risk and a cost estimate. The manifests show exactly what would be applied, with secrets as references.", console: "Review, Plan and Manifests tabs. The InferenceService is generated from your settings." },
      { title: "Publish and run", body: "Publishing creates an immutable version with a digest. A run executes exactly that version.", console: "Publish version, then Run. Choose the execution mode and confirm." },
      { title: "Watch the canary and verify", body: "The run graph overlays live status on each operator. Verification compares observed p95 latency and error rate with your limits.", console: "Open the run, select Verify, read its logs, then open the deployment." },
      { title: "Call the endpoint", body: "Payloads depend on the runtime. This example uses the Open Inference Protocol v2 shape that KServe supports.", code: { title: "Smoke test", lang: "bash", text: "curl -sS https://staging.ml.example/v2/models/support-classifier/infer \\\n  -H \"Authorization: Bearer $TOKEN\" \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"inputs\":[{\"name\":\"text\",\"shape\":[1],\"datatype\":\"BYTES\",\"data\":[\"My invoice is wrong\"]}]}'" } },
    ],
    verification: ["The deployment is healthy with the expected ready replicas", "The run snapshot shows the exact spec and digest that executed", "The audit log lists the plan, apply and promotion"],
    expected: "support-classifier-staging serving the new version, with a recorded run, snapshot and audit trail.",
    cleanup: ["Scale the staging deployment to its minimum or delete it when finished", "Archive the model version if it is not promoted"],
    troubleshooting: [{ problem: "Validation failed: connection belongs to production", fix: "Connections never cross environments. Pick the staging connection or change the pipeline environment." }, { problem: "Run blocked: no online build agent", fix: "Enroll or resume a build agent whose labels match the Build operator." }],
    references: [{ label: "KServe documentation", url: "https://kserve.github.io/website/" }, { label: "Open Inference Protocol", url: "https://kserve.github.io/website/latest/modelserving/data_plane/v2_protocol/" }],
    consoleLink: { label: "Open Pipelines", href: "/mlops/pipelines" },
  },
  {
    slug: "kserve-mlflow-custom-container", title: "Serve with KServe, MLflow or a custom container", level: "Intermediate", minutes: 35,
    summary: "Three ways to package the same model and what each means for the control plane.",
    prerequisites: ["A Kubernetes cluster with KServe installed", "A model in an artifact store, an MLflow registry, or an image in a registry"],
    versions: ["KServe 0.13 or later", "MLflow 2.x"],
    warnings: [{ kind: "Security", text: "Pin images by digest. A tag can move after you validated it." }],
    steps: [
      { title: "Option A: a supported model format", body: "KServe pulls the artifact from storage and serves it with a matching runtime.", code: { title: "inferenceservice.yaml", lang: "yaml", text: "apiVersion: serving.kserve.io/v1beta1\nkind: InferenceService\nmetadata:\n  name: support-classifier\n  namespace: models\nspec:\n  predictor:\n    minReplicas: 2\n    maxReplicas: 6\n    model:\n      modelFormat:\n        name: sklearn\n      storageUri: s3://nexi-models/support-classifier/4" } },
      { title: "Option B: serve an MLflow model", body: "Build a serving image from a registered version, or use the MLflow runtime in KServe with the v2 protocol. Check the KServe docs for the exact runtime options in your version.", code: { title: "Build an image from a registry version", lang: "bash", text: "mlflow models build-docker \\\n  --model-uri models:/customer-support-classifier/4 \\\n  --name registry.example.com/ml/support-classifier:4" } },
      { title: "Option C: your own container", body: "Any image that exposes HTTP and a health route works. Declare the port, probes and resources.", code: { title: "Custom container predictor", lang: "yaml", text: "spec:\n  predictor:\n    containers:\n      - name: kserve-container\n        image: registry.example.com/ml/support-classifier@sha256:<digest>\n        ports:\n          - containerPort: 8080\n        readinessProbe:\n          httpGet: { path: /healthz, port: 8080 }\n        resources:\n          requests: { cpu: \"2\", memory: 4Gi }\n          limits: { cpu: \"2\", memory: 4Gi }" } },
      { title: "Model it in a pipeline", body: "In the builder, the Deploy endpoint operator takes a runtime option. The generated manifest changes with it. Review it before applying.", console: "MLOps, Pipelines, open a pipeline, select Deploy canary, review the Manifests tab." },
    ],
    verification: ["kubectl get inferenceservice -n models shows READY True", "The endpoint answers your smoke test"],
    expected: "The same model served three ways, each with a visible, reviewable manifest.",
    cleanup: ["kubectl -n models delete inferenceservice support-classifier"],
    troubleshooting: [{ problem: "InferenceService stuck not ready", fix: "Run kubectl describe inferenceservice and read the conditions. Common causes are a wrong storageUri, missing credentials or an unsupported runtime version." }],
    references: [{ label: "KServe model serving", url: "https://kserve.github.io/website/latest/modelserving/v1beta1/serving_runtime/" }, { label: "MLflow models", url: "https://mlflow.org/docs/latest/models.html" }],
  },
  {
    slug: "gpu-resources-autoscaling", title: "Request GPUs and configure autoscaling", level: "Intermediate", minutes: 30,
    summary: "Ask for GPU resources, set an autoscaling range, and understand what the control plane does not change.",
    prerequisites: ["A cluster with the NVIDIA device plugin or GPU Operator already installed", "A quota for the namespace"],
    versions: ["Kubernetes 1.28 to 1.32", "NVIDIA GPU Operator, as installed by you"],
    warnings: [{ kind: "Cost", text: "GPU replicas are the largest line item in most serving bills. Set a maximum, and review the estimate before applying." }, { kind: "Security", text: "tok∑ner requests GPU resources only. It does not install or change host drivers, firmware or the kernel, and will not without a separate compatible agent capability and explicit authorization." }],
    steps: [
      { title: "See what the cluster offers", body: "List allocatable GPUs per node.", code: { title: "GPU inventory", lang: "bash", text: "kubectl get nodes -o custom-columns='NAME:.metadata.name,GPU:.status.allocatable.nvidia\\.com/gpu'" } },
      { title: "Request GPUs on the endpoint", body: "Set the GPU count per replica. The scheduler places pods only where capacity exists.", code: { title: "Resource limits", lang: "yaml", text: "resources:\n  requests: { cpu: \"4\", memory: 8Gi }\n  limits:   { cpu: \"4\", memory: 8Gi, nvidia.com/gpu: \"1\" }" }, console: "Deploy operator, GPUs per replica. The validator reminds you that drivers must already exist." },
      { title: "Set the autoscaling range", body: "Choose minimum and maximum replicas and a target concurrency. A minimum above zero avoids cold starts at the cost of idle spend.", code: { title: "KServe predictor scaling", lang: "yaml", text: "spec:\n  predictor:\n    minReplicas: 1\n    maxReplicas: 3\n    scaleMetric: concurrency\n    scaleTarget: 8" }, console: "MLOps, Deployments, support-embedder-staging, Scale. The seeded deployment shows a replica pending because GPU capacity is exhausted." },
      { title: "Read the capacity signal", body: "Pending pods with insufficient GPU are a capacity problem on the target. Add nodes or lower the maximum.", console: "Deployment, Metrics and Events." },
    ],
    verification: ["Pods schedule onto GPU nodes", "kubectl describe pod shows nvidia.com/gpu in limits"],
    expected: "An endpoint with a bounded autoscaling range and an explicit GPU request.",
    cleanup: ["Lower maxReplicas or delete the endpoint to stop GPU spend"],
    troubleshooting: [{ problem: "0/6 nodes are available: insufficient nvidia.com/gpu", fix: "No node has a free GPU. Add GPU capacity or reduce replicas." }, { problem: "Pod Pending with no GPU nodes", fix: "The device plugin is not installed or nodes lack the label your selector needs." }],
    references: [{ label: "Schedule GPUs in Kubernetes", url: "https://kubernetes.io/docs/tasks/manage-gpus/scheduling-gpus/" }, { label: "NVIDIA GPU Operator", url: "https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/" }, { label: "KServe autoscaling", url: "https://kserve.github.io/website/latest/modelserving/autoscaling/autoscaling/" }],
  },
  {
    slug: "data-and-vector-connections", title: "Connect object storage, a database, a stream and a vector store", level: "Intermediate", minutes: 40,
    summary: "Create least-privilege access on each system, then connect them for a retrieval pipeline.",
    prerequisites: ["Admin access to each system you are connecting", "A secret manager for the credentials"],
    versions: ["PostgreSQL 13 to 17", "pgvector 0.7 or later", "Kafka 3.x", "MinIO or any S3-compatible store"],
    warnings: [{ kind: "Data", text: "Pipelines read data in place and store references and checksums. Confirm your data handling rules before connecting a system that holds personal data." }, { kind: "Security", text: "Use read-only roles first. Statement timeouts and row limits apply to every query a pipeline runs." }],
    steps: [
      { title: "PostgreSQL: a read-only role", body: "Grant connect and select on named tables only.", code: { title: "Read-only role", lang: "sql", text: "CREATE ROLE tokener_ro LOGIN;\n-- set the password interactively with \\password tokener_ro\nGRANT CONNECT ON DATABASE features TO tokener_ro;\nGRANT USAGE ON SCHEMA public TO tokener_ro;\nGRANT SELECT ON tickets TO tokener_ro;\nALTER ROLE tokener_ro SET statement_timeout = '30s';" } },
      { title: "pgvector: the extension, table and index", body: "The embedding dimension must match your embedding model.", code: { title: "Vector table", lang: "sql", text: "CREATE EXTENSION IF NOT EXISTS vector;\nCREATE TABLE support_kb (\n  id bigserial PRIMARY KEY,\n  doc_id text NOT NULL,\n  content text NOT NULL,\n  embedding vector(768)\n);\nCREATE INDEX ON support_kb USING hnsw (embedding vector_cosine_ops);" } },
      { title: "MinIO or S3: a prefix-scoped policy", body: "Allow listing the bucket and reading and writing one prefix.", code: { title: "Scoped policy", lang: "bash", text: "cat > kb-policy.json <<'EOF'\n{\n  \"Version\": \"2012-10-17\",\n  \"Statement\": [\n    { \"Effect\": \"Allow\", \"Action\": [\"s3:ListBucket\"], \"Resource\": [\"arn:aws:s3:::kb\"], \"Condition\": {\"StringLike\": {\"s3:prefix\": [\"articles/*\"]}} },\n    { \"Effect\": \"Allow\", \"Action\": [\"s3:GetObject\", \"s3:PutObject\"], \"Resource\": [\"arn:aws:s3:::kb/articles/*\"] }\n  ]\n}\nEOF" } },
      { title: "Kafka: ACLs for one topic and group", body: "Grant read on one topic and one consumer group prefix.", code: { title: "kafka-acls", lang: "bash", text: "kafka-acls.sh --bootstrap-server broker-1:9093 --command-config client.properties \\\n  --add --allow-principal User:tokener \\\n  --operation Read --operation Describe --topic tickets.created\nkafka-acls.sh --bootstrap-server broker-1:9093 --command-config client.properties \\\n  --add --allow-principal User:tokener \\\n  --operation Read --group tokener-pipeline --resource-pattern-type prefixed" } },
      { title: "Connect each system and wire the pipeline", body: "Add four connections, then open the Retrieval assistant template: Ingest, Store, Embed, Vector index, Retrieve, Serve agent, Observe.", console: "MLOps, Integrations, then Pipelines, New pipeline, Retrieval assistant." },
    ],
    verification: ["Each connection test passes read-only checks", "A pipeline run indexes documents and the index row count increases"],
    expected: "Four verified connections and a retrieval pipeline that validates cleanly.",
    cleanup: ["DROP ROLE tokener_ro after revoking grants", "Remove the ACLs and the MinIO policy", "Delete the test connections"],
    troubleshooting: [{ problem: "permission denied for table", fix: "Grant SELECT on the specific table. Default privileges do not cover existing tables." }, { problem: "dimension mismatch on insert", fix: "The vector column dimension must equal your embedding model output size." }],
    references: [{ label: "PostgreSQL GRANT", url: "https://www.postgresql.org/docs/current/sql-grant.html" }, { label: "pgvector", url: "https://github.com/pgvector/pgvector" }, { label: "MinIO policies", url: "https://min.io/docs/minio/linux/administration/identity-access-management/policy-based-access-control.html" }, { label: "Kafka authorization", url: "https://kafka.apache.org/documentation/#security_authz" }],
  },
  {
    slug: "app-to-inference-endpoint", title: "Call an inference endpoint from an enterprise app", level: "Intermediate", minutes: 20,
    summary: "Call a model from server-side code with a key held in your secret manager, never in a browser or mobile app.",
    prerequisites: ["A tok∑ner application key stored server-side", "An endpoint deployed and healthy"],
    versions: ["Any HTTP client"],
    warnings: [{ kind: "Security", text: "Keys must never ship to browsers, mobile apps or client-visible JSON. Call from your backend." }],
    steps: [
      { title: "Create an application key and store it server-side", body: "Create it under API Keys. Put the value in your secret manager and inject it as an environment variable.", console: "Developer, API Keys." },
      { title: "Call from TypeScript on the server", body: "Set a timeout, send an idempotency key for non-read operations, and do not log request bodies.", code: { title: "server.ts", lang: "ts", text: "const res = await fetch(process.env.TOKENER_ENDPOINT_URL!, {\n  method: \"POST\",\n  headers: {\n    Authorization: `Bearer ${process.env.TOKENER_API_KEY}`,\n    \"Content-Type\": \"application/json\",\n  },\n  body: JSON.stringify({ inputs: [{ name: \"text\", shape: [1], datatype: \"BYTES\", data: [text] }] }),\n  signal: AbortSignal.timeout(5000),\n});\nif (!res.ok) throw new Error(`inference failed: ${res.status}`);\nconst out = await res.json();" } },
      { title: "The same call in Python", body: "Use a session with retries only for idempotent calls.", code: { title: "client.py", lang: "python", text: "import os, requests\n\nr = requests.post(\n    os.environ[\"TOKENER_ENDPOINT_URL\"],\n    headers={\"Authorization\": f\"Bearer {os.environ['TOKENER_API_KEY']}\"},\n    json={\"inputs\": [{\"name\": \"text\", \"shape\": [1], \"datatype\": \"BYTES\", \"data\": [text]}]},\n    timeout=5,\n)\nr.raise_for_status()\nout = r.json()" } },
    ],
    verification: ["A 200 response from your server code", "The call appears in Usage Explorer attributed to the application"],
    expected: "A server-side integration whose key is rotatable without a deploy.",
    cleanup: ["Revoke the application key if this was a test"],
    troubleshooting: [{ problem: "401 Unauthorized", fix: "The key is wrong, revoked or for another application." }, { problem: "429 Too Many Requests", fix: "A quota or rate limit applies. Check Quota Management and retry with backoff." }],
    references: [{ label: "Open Inference Protocol", url: "https://kserve.github.io/website/latest/modelserving/data_plane/v2_protocol/" }],
    consoleLink: { label: "Open API Keys", href: "/api-keys" },
  },
  {
    slug: "gateway-identity-policy-budget", title: "Apply gateway identity, policy, budget and quota to an endpoint", level: "Intermediate", minutes: 25,
    summary: "Use the governance features you already have: identity, policy, budgets, quotas and usage accounting.",
    prerequisites: ["An application and key", "A budget and quota owner"],
    versions: ["Current tok∑ner console"],
    warnings: [{ kind: "Cost", text: "Budgets cap spend per period. Test thresholds on a small value first." }],
    steps: [
      { title: "Create a policy in Policy Studio", body: "Allow only the models and hours you intend and deny the rest.", console: "Governance, Policy Studio." },
      { title: "Set a budget and a quota", body: "A budget caps cost. A quota caps tokens or requests. Add alerts before the hard stop.", console: "Governance, Budget Management and Quota Management." },
      { title: "Attach to the application", body: "Policies and limits apply to the application that holds the key.", console: "Developer, API Keys." },
      { title: "Read usage and traces", body: "Check the Usage Explorer and a request trace to see which rule applied.", console: "Observability, Usage Explorer and Request Trace." },
    ],
    verification: ["A request over quota is refused with a clear reason", "Usage shows tokens and estimated cost by application"],
    expected: "An application with identity, policy and spend limits that are visible in usage and audit.",
    cleanup: ["Delete the test policy, budget and key"],
    troubleshooting: [{ problem: "Requests refused unexpectedly", fix: "Open Request Trace to see the filter that rejected it." }],
    references: [],
    consoleLink: { label: "Open Policy Studio", href: "/policy-studio" },
  },
  {
    slug: "promote-and-rollback", title: "Promote staging to production, observe the rollout and roll back", level: "Advanced", minutes: 30,
    summary: "Move an approved version to production behind an approval gate, watch the canary, and return to the previous version.",
    prerequisites: ["A model version approved for production", "A production connection", "Someone with the approver role"],
    versions: ["Current console release"],
    warnings: [{ kind: "Security", text: "Production runs need the approver role and an approval gate upstream of every change. The requester cannot approve their own run." }, { kind: "Cost", text: "A canary runs two versions at once, so cost rises until promotion or abort." }],
    steps: [
      { title: "Switch role and open the production pipeline", body: "As a developer you can draft. Only an approver can approve and promote.", console: "Use the Viewing as selector, then MLOps, Pipelines, support-classifier-prod-promote." },
      { title: "Run it and wait at the gate", body: "The run pauses with no resources held and notifies approvers.", console: "Run the pipeline. Open the run to see the approval banner." },
      { title: "Approve as a different role", body: "Switch to approver and approve. Rejection stops the run with your reason recorded.", console: "Run detail, Approve or Reject." },
      { title: "Observe the canary", body: "Watch traffic split, latency and error rate. The Verify operator decides whether to continue.", console: "Deployments, support-classifier-prod, Metrics." },
      { title: "Roll back", body: "If something is wrong, abort the canary or roll back to the previous version. Both are confirmed and audited.", console: "Deployment, Roll back. Production asks you to type the deployment name." },
    ],
    verification: ["The audit log shows approval, promotion and rollback with actors", "The deployment reports the expected serving version"],
    expected: "A completed promotion and a rollback, both fully attributed.",
    cleanup: ["Roll back the test deployment if you created one"],
    troubleshooting: [{ problem: "Approve is disabled", fix: "Your role is below approver, or you started the run. Switch role or ask another approver." }],
    references: [{ label: "Kubernetes rollout concepts", url: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment" }],
    consoleLink: { label: "Open Deployments", href: "/mlops/deployments" },
  },
  {
    slug: "secrets-rbac-audit", title: "Secrets, roles and audit", level: "Intermediate", minutes: 25,
    summary: "Keep secrets out of the platform, grant the smallest role, and review who did what.",
    prerequisites: ["A secret manager such as Vault", "An admin in your organization"],
    versions: ["HashiCorp Vault KV v2, as an example"],
    warnings: [{ kind: "Security", text: "Secrets in specs, URLs, logs, exports or version control are rejected by validation. Only secretref:// references are accepted." }],
    steps: [
      { title: "Give the platform a read-only path", body: "The control plane resolves references at run time. Grant it read on one prefix.", code: { title: "Vault policy", lang: "hcl", text: "path \"secret/data/nexi/staging/*\" {\n  capabilities = [\"read\"]\n}" } },
      { title: "Reference, do not paste", body: "In any operator, add a secret reference such as secretref://vault/nexi/staging/registry-token. Try pasting a raw token and read the validation error.", console: "Pipeline builder, select an operator, Secret references." },
      { title: "Review roles", body: "Viewer reads. Developer drafts and runs outside production. Approver approves and promotes. Admin manages connections, agents and settings.", console: "MLOps, Settings and access, Role matrix." },
      { title: "Rotate a credential", body: "Rotation changes the secret, not the reference, so pipelines keep working.", console: "Integrations, Connections, open one, Rotate credential." },
      { title: "Read the audit log", body: "Every change records an actor, action, resource and environment.", console: "MLOps, Settings and access, Audit." },
    ],
    verification: ["A pasted secret is rejected", "Rotation appears in the audit log with no secret value"],
    expected: "A workflow where no secret value is ever stored by the platform.",
    cleanup: ["Remove the Vault policy and the test references"],
    troubleshooting: [{ problem: "Reference does not resolve", fix: "Check the path, the mount and that the platform policy can read it." }],
    references: [{ label: "Vault policies", url: "https://developer.hashicorp.com/vault/docs/concepts/policies" }],
    consoleLink: { label: "Open Settings and access", href: "/mlops/settings" },
  },
  {
    slug: "build-agent-linux", title: "Install a build agent on a Linux server", level: "Intermediate", minutes: 25,
    summary: "Run image builds on your own server. The agent connects out, runs only allowlisted operations, and holds no inbound ports.",
    prerequisites: ["A Linux server with systemd 245 or later and Docker or Podman", "Outbound HTTPS to the control plane and your registry", "A non-root service user"],
    versions: ["Agent contract 0.4 preview", "Ubuntu 22.04 or later, Debian 12 or later"],
    warnings: [{ kind: "Security", text: "The enrollment token is shown once and expires in 24 hours. Keep it out of shell history by writing it to a root-only file." }, { kind: "Security", text: "The agent never installs or changes GPU drivers, firmware or the kernel. It reports what it detects, read-only." }],
    steps: [
      { title: "Choose where it runs and name it", body: "Pick Linux server, an environment and labels. Pipelines match build jobs to agents by label.", console: "MLOps, Build Agents, Enroll agent." },
      { title: "Set the boundaries", body: "Allow the registries it may push to and the exact hosts it may reach. Wildcards are refused.", console: "Identity and scope, then Boundaries." },
      { title: "Create the one-time token", body: "The token is exchanged for a short-lived credential on first contact and stored by the control plane only as a hash.", console: "Create enrollment token." },
      { title: "Download, verify and install", body: "Verify the checksum before you run anything, and read the script.", code: { title: "Install", lang: "bash", text: "curl -fsSLO https://get.tokener.io/agent/v0.4.0-preview/install-agent.sh\ncurl -fsSLO https://get.tokener.io/agent/v0.4.0-preview/install-agent.sh.sha256\nsha256sum -c install-agent.sh.sha256\nsudo install -m 600 /dev/null /etc/tokener-agent.env\necho 'TOKENER_ENROLL_TOKEN=<token>' | sudo tee /etc/tokener-agent.env >/dev/null\nsudo sh ./install-agent.sh --name nexi-build-03 --env-file /etc/tokener-agent.env" } },
      { title: "What the service looks like", body: "A hardened systemd unit limits what the agent can touch. This is the intended shape.", code: { title: "tokener-agent.service (excerpt)", lang: "ini", text: "[Service]\nUser=tokener-agent\nEnvironmentFile=/etc/tokener-agent.env\nNoNewPrivileges=true\nProtectSystem=strict\nProtectHome=true\nPrivateTmp=true\nReadWritePaths=/var/lib/tokener-agent\nRestart=on-failure" } },
      { title: "Confirm the first heartbeat", body: "The agent appears online with its OS, architecture and any detected GPU.", console: "Verify step. The wizard waits for the first heartbeat." },
    ],
    verification: ["systemctl status tokener-agent shows active", "The agent shows online with the expected labels and free slots", "A Build operator with matching labels is routed to it"],
    expected: "An online agent that builds images, pushes to your registry and reports the digest, with no inbound listener.",
    cleanup: ["Revoke the agent in the console, then: sudo systemctl disable --now tokener-agent and remove /var/lib/tokener-agent and /etc/tokener-agent.env"],
    troubleshooting: [{ problem: "Agent stays offline", fix: "Check outbound HTTPS to the control plane, the proxy settings and the system clock." }, { problem: "Build refused: registry not allowed", fix: "Add the exact registry host to the agent's registry allowlist." }, { problem: "Token rejected", fix: "Enrollment tokens are single use and expire in 24 hours. Create a new one." }],
    references: [{ label: "systemd.exec hardening options", url: "https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html" }, { label: "Docker buildx", url: "https://docs.docker.com/reference/cli/docker/buildx/build/" }],
    consoleLink: { label: "Open Build Agents", href: "/mlops/build-agents" },
  },
  {
    slug: "scheduled-briefing-agent", title: "Build a scheduled briefing agent with calendar and email", level: "Intermediate", minutes: 30,
    summary: "Run an agent every weekday morning inside business hours. It reads a calendar and a mailbox, asks a model through the gateway, waits for approval, and saves a draft email.",
    prerequisites: ["A Google Workspace or Microsoft 365 account you may connect, with an administrator who can grant consent", "A tok\u2211ner gateway policy and budget for the assistant (see the gateway tutorial)", "A verified sender if you will use SendGrid, Amazon SES, Mailgun or Postmark"],
    versions: ["Gmail API v1, Google Calendar API v3", "Microsoft Graph v1.0", "SendGrid v3 Mail Send"],
    warnings: [
      { kind: "Data", text: "Mailboxes and calendars hold personal data. Start with one test mailbox, keep attendee addresses off, and leave Redact turned on." },
      { kind: "Security", text: "Grant the narrowest scopes. Read-only for reading, compose for drafts, and send only if you truly need it. Restrict Microsoft apps to named mailboxes with an application access policy." },
      { kind: "Cost", text: "A model call runs every time the schedule fires. Set a budget on the gateway policy and a small maximum for output tokens." },
    ],
    steps: [
      { title: "Choose what the agent may touch", body: "Decide the mailbox, the calendar and the sending route before you create anything. A dedicated assistant mailbox is easier to review than a person's own.", console: "MLOps, Integrations. Open Gmail or Microsoft 365 mail to read the permissions it will request.", shot: { src: "/screens/mlops-integrations.webp", alt: "The integration catalogue filtered to email and calendar", url: "app.tokener.io/mlops/integrations" } },
      { title: "Create a Google OAuth client with narrow scopes", body: "In Google Cloud, enable the two APIs and create an OAuth client. Request only the scopes the operators need.", code: { title: "Enable the APIs and list scopes", lang: "bash", text: "gcloud services enable gmail.googleapis.com calendar-json.googleapis.com --project=YOUR_PROJECT\n\n# Scopes to request on the consent screen:\n#   https://www.googleapis.com/auth/gmail.readonly\n#   https://www.googleapis.com/auth/gmail.compose\n#   https://www.googleapis.com/auth/calendar.readonly" }, console: "Add the client id on the connection form. Store the client secret in your secret manager and paste its reference." },
      { title: "Or register a Microsoft app limited to named mailboxes", body: "Create the app registration, grant Graph application permissions, then restrict it to a mail-enabled security group with an application access policy so it cannot read every mailbox.", code: { title: "Register and restrict", lang: "bash", text: "az ad app create --display-name tokener-assistant --sign-in-audience AzureADMyOrg\n\n# In Exchange Online PowerShell:\n# New-ApplicationAccessPolicy -AppId <APP_ID> -PolicyScopeGroupId assistant-mailboxes@example.com -AccessRight RestrictAccess -Description \"tokener assistant\"" } },
      { title: "Set up a sending provider if you do not send from the mailbox", body: "For SendGrid, Amazon SES, Mailgun or Postmark, verify the domain and publish the records they give you. Mail that fails SPF and DKIM lands in spam.", code: { title: "Example DNS records (values come from your provider)", lang: "bash", text: "example.com.            TXT  \"v=spf1 include:sendgrid.net ~all\"\ns1._domainkey.example.com. CNAME s1.domainkey.u0000000.wl000.sendgrid.net.\n_dmarc.example.com.     TXT  \"v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com\"" } },
      { title: "Create the connections and run the test", body: "Create one connection per service, each read-only unless the pipeline needs to write. The test lists a mailbox label and a calendar without reading any content.", console: "Integrations, choose the service, then Connect. Use the Test step before saving.", shot: { src: "/screens/mlops-connection-wizard.webp", alt: "The connection wizard with the checklist to finish before going live", url: "app.tokener.io/mlops/integrations" } },
      { title: "Start from the briefing template", body: "The template wires Schedule, Business hours, Read calendar, Read mailbox, Ask a model, Approval and Send email. Set the time zone on both time operators.", console: "Pipelines, New pipeline, Scheduled briefing agent. Choose Builder or Wizard. Both edit the same pipeline.", shot: { src: "/screens/mlops-agent-builder.webp", alt: "The scheduled briefing pipeline on the builder canvas", url: "app.tokener.io/mlops/pipelines/edit" } },
      { title: "Set the time operators", body: "Use an IANA time zone name so daylight saving is handled for you. Choose what happens to a missed run, and whether work outside the window waits or is skipped.", code: { title: "What the pipeline stores", lang: "yaml", text: "- operator: schedule_trigger\n  config: { mode: Every weekday, at: \"08:00\", timezone: Asia/Bahrain, missed: Run once when back }\n- operator: time_window\n  config: { days: \"Mon,Tue,Wed,Thu,Fri\", from: \"07:30\", to: \"17:00\", outside: Hold until it opens }" } },
      { title: "Keep delivery safe", body: "Leave Delivery on Save as draft while you test. Add allowed recipient domains so anything external is held for approval, and keep Redact on.", console: "Select the Send email operator, then Delivery and Allowed recipient domains." },
      { title: "Review, publish and simulate a run", body: "Review shows the plan and any policy blocks. A simulated run walks every operator and logs what each would do, without contacting your mailbox.", console: "Review, Publish version, then Run and choose Simulated." },
    ],
    verification: ["The schedule shows the next fire time in the time zone you chose", "The simulated run passes the business-hours window and stops at Approval until someone approves", "A test recipient outside the allowed domains is held, not sent"],
    expected: "Each weekday at the chosen time, a draft briefing appears in the assistant mailbox after an approver confirms it. Every model call shows in usage under the assistant's gateway policy and budget.",
    cleanup: ["Disable the schedule from the pipeline page", "Revoke the OAuth grant or delete the app registration", "Delete the assistant mailbox if it was only for testing"],
    troubleshooting: [
      { problem: "The schedule fires an hour early or late", fix: "Check the time zone on the Schedule operator. Use an IANA name, not an abbreviation such as EST." },
      { problem: "The connection test fails with a permission error", fix: "The admin consent step is missing, or the application access policy does not include the mailbox." },
      { problem: "Mail is delivered to spam", fix: "Confirm SPF, DKIM and DMARC records for the sending domain and send from an address on that domain." },
    ],
    references: [{ label: "Gmail API scopes", url: "https://developers.google.com/gmail/api/auth/scopes" }, { label: "Limiting application permissions to specific Exchange mailboxes", url: "https://learn.microsoft.com/graph/auth-limit-mailbox-access" }, { label: "SendGrid sender authentication", url: "https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication" }, { label: "IANA time zone database", url: "https://www.iana.org/time-zones" }],
    consoleLink: { label: "Open Pipelines", href: "/mlops/pipelines" },
  },
  {
    slug: "payment-link-agent", title: "Build an agent that sends a payment link and waits for payment", level: "Advanced", minutes: 60,
    summary: "Accept an order from your app, create a payment with MTN Mobile Money, Orange Money, PayPal, a card provider, Bitcoin or your own provider, text the customer a link and fulfil only after the provider confirms.",
    prerequisites: [
      "A business that the payment provider has approved. Sandbox access is enough to follow the steps, live access needs the provider's approval and can take days",
      "A secret manager with a reference for each provider credential",
      "A public HTTPS address for provider notifications, and return and cancel pages on your own domain",
      "An SMS provider (Twilio or Africa's Talking) or an email route to deliver the link",
      "The admin role, to set payment limits and to switch on real payments later",
    ],
    versions: ["MTN MoMo Collections (Request to Pay)", "Orange Money Web Payment", "PayPal Orders v2 and Webhooks", "Stripe Checkout Sessions", "BTCPay Server Greenfield API"],
    availability: "Compliance notes are a summary to help you prepare. They are not legal advice. Provider onboarding rules, limits and licensing differ by country, so confirm them with the provider and your own counsel before you take real money.",
    warnings: [
      { kind: "Security", text: "Never paste a provider key, a wallet seed, a card number or a customer's PIN anywhere in a pipeline. Credentials are secret references, and the provider pages collect everything the customer types." },
      { kind: "Data", text: "Phone numbers and emails are personal data. Collect only what the payment needs, say why, keep it only as long as required, and follow the data protection law of the customers' country." },
      { kind: "Cost", text: "Providers charge per transaction and some charge for refunds and disputes. A payment test in live mode moves real money." },
    ],
    steps: [
      {
        title: "Work out what each provider needs from you", body: "Before you build anything, collect what the provider requires. Missing paperwork is the most common reason a launch slips.\n\nMTN Mobile Money: a developer portal account with a subscription to the Collections product, an API user and key, the target environment for your country, a callback host, and a business relationship with MTN in that country.\n\nOrange Money: a registered Orange Money merchant account in your country, a developer portal app with the Web Payment API, a client id and secret, the merchant key, and public notification, return and cancel URLs.\n\nPayPal: a verified Business account, a REST app for sandbox and one for live, a webhook with its id, and return and cancel pages.\n\nVisa and Mastercard: a Stripe, Adyen, Flutterwave or Paystack account approved for live payments, a restricted API key, and a signed webhook endpoint.\n\nBitcoin: a BTCPay Server you run or trust, a store with a watch-only wallet or your own Lightning node, a store-scoped API key and a webhook secret.\n\nCustom: the provider's API reference, a sandbox, and the list of credentials it needs.",
        console: "MLOps, Integrations, Payments. Each provider's page lists its prerequisites, limitations and a Compliance and go-live checklist.", shot: { src: "/screens/mlops-integrations.webp", alt: "The integration catalogue with the payment providers", url: "app.tokener.io/mlops/integrations" },
      },
      {
        title: "Understand the compliance you take on", body: "Using a provider-hosted page keeps card numbers away from you, so a card business usually completes the lightest self-assessment (SAQ A). Embedding a form in your own page raises the scope and adds script-protection duties. In the EEA and the UK, strong customer authentication applies, and the hosted pages apply 3-D Secure when the issuer asks. Mobile money is regulated by the central bank of each country and has its own limits and anti-money-laundering rules. Bitcoin rules differ by country: accepting it for goods or services is usually treated differently from holding, exchanging or sending it for others, which can need a licence. tok∑ner enforces the parts it can, such as hosted pages, signed requests, limits, address screening and approvals. The rest is yours to confirm.",
        console: "Settings, Policy. Read Payment limits and Allow real payments in production before you continue.",
      },
      {
        title: "MTN MoMo: create sandbox credentials", body: "Subscribe to Collections on the MoMo developer portal. In the sandbox you create the API user and key through the API. In production MTN issues them after your onboarding is approved.",
        code: { title: "Sandbox API user and key", lang: "bash", text: "UUID=$(uuidgen)\ncurl -X POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser \\\n  -H \"X-Reference-Id: $UUID\" -H \"Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY\" \\\n  -H \"Content-Type: application/json\" -d '{\"providerCallbackHost\":\"pay-callbacks.example.com\"}'\n\ncurl -X POST https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/$UUID/apikey \\\n  -H \"Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY\"" },
      },
      {
        title: "MTN MoMo: what the agent sends", body: "A request to pay prompts the customer's phone. MTN has no hosted page, so the agent's link opens a tok∑ner pay page where the customer confirms their number. The agent then calls Request to Pay with a fresh reference id, and reads the status back instead of trusting the callback.",
        code: { title: "Request to Pay and status (shown for reference, the operator does this for you)", lang: "bash", text: "curl -X POST https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay \\\n  -H \"Authorization: Bearer $ACCESS_TOKEN\" -H \"X-Reference-Id: $REFERENCE\" \\\n  -H \"X-Target-Environment: sandbox\" -H \"Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"amount\":\"10\",\"currency\":\"EUR\",\"externalId\":\"ORDER-1001\",\"payer\":{\"partyIdType\":\"MSISDN\",\"partyId\":\"<customer number>\"},\"payerMessage\":\"Payment to NexI\",\"payeeNote\":\"ORDER-1001\"}'\n\ncurl https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay/$REFERENCE \\\n  -H \"Authorization: Bearer $ACCESS_TOKEN\" -H \"X-Target-Environment: sandbox\" \\\n  -H \"Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY\"" },
        console: "The sandbox accepts EUR only. In production use the currency of your market, and never keep sandbox credentials on a production connection.",
      },
      {
        title: "Orange Money: get a token and create a web payment", body: "Authenticate with your client id and secret, then create the payment. The response holds the hosted payment link, a pay token and a notification token. Orange posts to your notification URL, and the agent checks the notification token and then asks for the transaction status.",
        code: { title: "Token and web payment (sandbox path shown)", lang: "bash", text: "curl -X POST https://api.orange.com/oauth/v3/token \\\n  -H \"Authorization: Basic $(printf '%s' \"$CLIENT_ID:$CLIENT_SECRET\" | base64)\" \\\n  -d grant_type=client_credentials\n\ncurl -X POST https://api.orange.com/orange-money-webpay/dev/v1/webpayment \\\n  -H \"Authorization: Bearer $ACCESS_TOKEN\" -H \"Content-Type: application/json\" \\\n  -d '{\"merchant_key\":\"'$MERCHANT_KEY'\",\"currency\":\"OUV\",\"order_id\":\"ORDER-1001\",\"amount\":1000,\"return_url\":\"https://pay.example.com/thanks\",\"cancel_url\":\"https://pay.example.com/cancelled\",\"notif_url\":\"https://pay-callbacks.example.com/orange\",\"lang\":\"fr\",\"reference\":\"ORDER-1001\"}'" },
        console: "OUV is the sandbox currency and is blocked in production. XOF and XAF amounts are whole numbers.",
      },
      {
        title: "PayPal: create the order and the webhook", body: "Create an order and send the customer the approval link from the response. After they approve, capture the order. Verify every webhook with PayPal's verification call and the webhook id.",
        code: { title: "Create an order, then verify a webhook", lang: "bash", text: "curl -X POST https://api-m.sandbox.paypal.com/v2/checkout/orders \\\n  -H \"Authorization: Bearer $ACCESS_TOKEN\" -H \"PayPal-Request-Id: ORDER-1001\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"intent\":\"CAPTURE\",\"purchase_units\":[{\"reference_id\":\"ORDER-1001\",\"amount\":{\"currency_code\":\"USD\",\"value\":\"10.00\"}}],\"payment_source\":{\"paypal\":{\"experience_context\":{\"return_url\":\"https://pay.example.com/thanks\",\"cancel_url\":\"https://pay.example.com/cancelled\"}}}}'\n\n# Webhook verification: POST /v1/notifications/verify-webhook-signature with the\n# transmission headers, the webhook id and the raw event body." },
      },
      {
        title: "Cards: use a hosted page", body: "With Stripe, create a Checkout Session for the exact amount and send the customer its url. With Adyen, Flutterwave or Paystack the flow is the same with that provider's hosted link. Verify the signed webhook before you act on it.",
        code: { title: "Stripe Checkout Session", lang: "bash", text: "curl https://api.stripe.com/v1/checkout/sessions -u \"$STRIPE_RESTRICTED_KEY:\" \\\n  -H \"Idempotency-Key: ORDER-1001\" \\\n  -d mode=payment \\\n  -d \"line_items[0][price_data][currency]=usd\" \\\n  -d \"line_items[0][price_data][unit_amount]=1000\" \\\n  -d \"line_items[0][price_data][product_data][name]=Order ORDER-1001\" \\\n  -d \"line_items[0][quantity]=1\" \\\n  -d client_reference_id=ORDER-1001 \\\n  -d success_url=https://pay.example.com/thanks \\\n  -d expires_at=$(($(date +%s)+3600))" },
        console: "Strong customer authentication cannot be turned off on the card operator.",
      },
      {
        title: "Bitcoin: create an invoice on your BTCPay Server", body: "BTCPay creates an invoice with a checkout link. Funds go straight to the wallet on your store, and tok∑ner never holds keys. Use a watch-only wallet or your own Lightning node, scope the API key to one store, and verify the BTCPay-Sig header on webhooks.",
        code: { title: "Create an invoice", lang: "bash", text: "curl -X POST https://btcpay.example.com/api/v1/stores/$STORE_ID/invoices \\\n  -H \"Authorization: token $BTCPAY_API_KEY\" -H \"Content-Type: application/json\" \\\n  -d '{\"amount\":\"10.00\",\"currency\":\"USD\",\"metadata\":{\"orderId\":\"ORDER-1001\"},\"checkout\":{\"expirationMinutes\":30,\"redirectURL\":\"https://pay.example.com/thanks\"}}'\n\n# Verify webhooks: BTCPay-Sig is sha256= followed by the HMAC-SHA256 of the raw body with your webhook secret." },
        console: "Address screening stays on. Orders above the review threshold wait for a person before fulfilment.",
      },
      {
        title: "Custom provider: define its credentials and calls", body: "Add the connection, then list every credential the provider needs as NAME=secretref://... lines. Add as many as you need. On the operator, set the create path, the JSON body with placeholders, where the payment link and id are in the response, how to read the status, which status value means paid, and how webhooks are signed.",
        code: { title: "What the operator stores", lang: "yaml", text: "operator: pay_custom\nconfig:\n  authRefs: |\n    api_key=secretref://vault/nexi/prod/provider#api_key\n    merchant_id=secretref://vault/nexi/prod/provider#merchant_id\n  createPath: /v1/payments\n  bodyTemplate: '{\"amount\": {{amount}}, \"currency\": \"{{currency}}\", \"reference\": \"{{orderRef}}\"}'\n  linkPath: $.checkout_url\n  idPath: $.id\n  statusPath: /v1/payments/{id}\n  statusPathValue: $.status\n  paidValue: succeeded\n  webhookVerify: HMAC SHA-256 in a header\n  signatureHeader: X-Signature" },
      },
      {
        title: "Add the connections", body: "Create one connection per provider in the environment where you will use it. Sandbox accounts go on staging, live accounts on production. The wizard shows each provider's go-live checklist before you finish.",
        console: "Integrations, choose the provider, Connect. Run the connectivity test before saving.", shot: { src: "/screens/mlops-connection-wizard.webp", alt: "The connection wizard with the compliance checklist", url: "app.tokener.io/mlops/integrations" },
      },
      {
        title: "Start from the payment link template", body: "The template wires Payment request, Collect with MTN MoMo, Send SMS, Wait for payment and two notifications. To use another provider, delete the collect step and add the one you want. Connect its Payment link output to Send SMS and its Payment output to Wait for payment.",
        console: "Pipelines, New pipeline, Payment link agent.", shot: { src: "/screens/mlops-payments.webp", alt: "The payment link agent on the builder canvas", url: "app.tokener.io/mlops/pipelines/edit" },
      },
      {
        title: "Set amounts, limits and the edge cases", body: "Prefer the amount from order data. Set a maximum on the operator, and let the organisation limit in Settings catch anything above it. In Wait for payment, choose what happens when a customer pays too little, too much, late, or twice. Holding for review is the safe default.",
        console: "Select the collect operator, then Amount comes from, Maximum for this operator and Link valid for. Select Wait for payment for the edge cases.",
      },
      {
        title: "Send your app's order and test", body: "Your app creates the order and calls the pipeline with a signed request. The platform rejects unsigned requests, drops fields you did not list and rate limits callers. Run a simulated run first, then a sandbox payment end to end.",
        code: { title: "Signing a request (HMAC-SHA256 over the raw body)", lang: "bash", text: "BODY='{\"id\":\"ORDER-1001\",\"amount\":10,\"currency\":\"EUR\",\"phone\":\"+256700000000\",\"name\":\"Amina\"}'\nSIG=$(printf '%s' \"$BODY\" | openssl dgst -sha256 -hmac \"$SIGNING_SECRET\" -hex | sed 's/^.* //')\ncurl -X POST https://api.tokener.example/v1/pipelines/payment-link-agent/runs \\\n  -H \"X-Tokener-Signature: sha256=$SIG\" -H \"Content-Type: application/json\" -d \"$BODY\"" },
        console: "Review, Publish version, then Run with Simulated.",
      },
      {
        title: "Go live", body: "Finish the provider's go-live checks, create production connections with live credentials, ask an admin to turn on Allow real payments in production, publish the pipeline for production with its approval, and make a small real payment to yourself. Then check that the audit log shows the request, the link, the confirmation and the fulfilment.",
        console: "Settings, Policy, then Allow real payments in production.",
      },
    ],
    verification: [
      "The simulated run creates a link, sends the text, waits and then continues only after a confirmed payment",
      "An unsigned request is rejected and a request above the limit never creates a payment",
      "A payment made after the link expired is held for review, not fulfilled",
      "Production refuses a test currency and a sandbox connection",
    ],
    expected: "Each order produces one payment request and one link, sent to the customer. The order is fulfilled once, after the provider has confirmed the payment and the platform has read the status back. Every step appears in the audit log.",
    cleanup: ["Revoke sandbox keys and delete test webhooks", "Delete test invoices and orders in the provider dashboard", "Remove the pay-callbacks host if it was only for testing"],
    troubleshooting: [
      { problem: "The customer pays but the order is not fulfilled", fix: "Check that the notification URL is public HTTPS and that the signature secret matches. The platform never fulfils on a notification it cannot verify, and it reads the status back from the provider." },
      { problem: "MTN returns a 409 conflict", fix: "The reference id was used before. Every request needs a new UUID. The order reference is the idempotency key for the order, not the MTN reference." },
      { problem: "Orange Money rejects the amount", fix: "XOF and XAF amounts have no decimals. Use a whole number, and use OUV only in the sandbox." },
      { problem: "PayPal says the order is not approved", fix: "The customer has not approved yet, or the order expired. Create the order again with a new link." },
      { problem: "Validation blocks the pipeline in production", fix: "Read the message. The usual causes are a sandbox connection, a test currency, a fixed order reference, or real payments not yet allowed in Settings." },
    ],
    references: [
      { label: "MTN MoMo developer portal", url: "https://momodeveloper.mtn.com/" },
      { label: "Orange Money Web Payment", url: "https://developer.orange.com/apis/om-webpay" },
      { label: "PayPal Orders API v2", url: "https://developer.paypal.com/docs/api/orders/v2/" },
      { label: "Stripe Checkout Sessions", url: "https://docs.stripe.com/api/checkout/sessions" },
      { label: "BTCPay Server Greenfield API", url: "https://docs.btcpayserver.org/API/Greenfield/v1/" },
      { label: "PCI DSS document library", url: "https://www.pcisecuritystandards.org/document_library/" },
    ],
    consoleLink: { label: "Open Pipelines", href: "/mlops/pipelines" },
  },
  {
    slug: "mcp-tool-agent", title: "Connect an MCP server and build a tool-using agent", level: "Intermediate", minutes: 35,
    summary: "Add a remote MCP server with OAuth and a local one over stdio, approve the tools agents may use, then build an agent that reads with one tool and writes with another only after approval.",
    prerequisites: [
      "The address of a remote MCP server you may use, and an account on it",
      "For a local server, an enrolled build agent and a pinned package version or container image digest",
      "A tok∑ner gateway policy and budget for the agent's model calls",
    ],
    versions: ["MCP revisions 2025-03-26 through 2026-07-28", "Streamable HTTP and legacy HTTP+SSE", "stdio"],
    warnings: [
      { kind: "Security", text: "Treat every tool description and every result as untrusted text. A server can try to steer your model. Approve tools one by one and keep writes behind an approval gate." },
      { kind: "Data", text: "A third-party server receives every argument you send. Check where it processes data and sign a data processing agreement if personal data is involved." },
      { kind: "Security", text: "A local server is code running on your machine. Pin its version or image digest, give it no network or an allowlist, and share only the folders it needs." },
    ],
    steps: [
      { title: "Choose the connection type", body: "Use Streamable HTTP for a remote server. Use legacy SSE only when the server has not moved to Streamable HTTP. Use stdio when the server is a program you run, such as a file or database server, so it stays inside your network.", console: "MLOps, Integrations, MCP servers.", shot: { src: "/screens/mlops-integrations.webp", alt: "The integration catalogue showing the MCP server connection types", url: "app.tokener.io/mlops/integrations" } },
      { title: "Check how a remote server asks for authorisation", body: "A server that needs OAuth answers an unauthenticated request with 401 and points to its protected resource metadata, which names the authorization server. tok∑ner reads it, so you usually only need to choose how the client id is obtained.", code: { title: "Look at the challenge", lang: "bash", text: "curl -i -X POST https://mcp.example.com/mcp -H 'Content-Type: application/json' -d '{}'\n# Look for: WWW-Authenticate: Bearer resource_metadata=\"https://mcp.example.com/.well-known/oauth-protected-resource\"\n\ncurl https://mcp.example.com/.well-known/oauth-protected-resource" } },
      { title: "Add the remote connection", body: "Choose Authorization code with PKCE when the agent acts for a person, or Client credentials for service to service. Prefer a pre-registered client or a client ID metadata document. Dynamic registration is deprecated and kept for servers that cannot use the others. Ask for the narrowest scopes. For an API key or bearer token choose the header and prefix. Add any extra headers as secret references.", console: "Connect, fill in the server address and the authentication fields, then run the test.", shot: { src: "/screens/mlops-mcp-connection.webp", alt: "The connection form for a remote MCP server", url: "app.tokener.io/mlops/integrations" } },
      { title: "Approve the tools", body: "Leave Tool exposure on Only tools I approve, list the tools agents may call, and block any you never want, such as deletes. Keep Ask a person before tools that change data on, and keep Pin tool definitions on so a changed tool stops until it is reviewed.", console: "On the connection form, Which tools agents may use." },
      { title: "Add a local server over stdio", body: "Choose the agent, run it as a container with no extra privileges, and pin the image by digest. Give it no network or an allowlist, and share only the folders it needs as read-only roots. Credentials the server reads from its environment are secret references.", code: { title: "Environment lines", lang: "ini", text: "GITHUB_TOKEN=secretref://vault/nexi/mcp/github#token" } },
      { title: "Set limits", body: "Set a connect timeout, a call timeout, how many calls may run at once and the largest result accepted. Keep result redaction on. Leave prompts, sampling and elicitation off unless you need them.", console: "Limits and What the server may offer." },
      { title: "Start from the tool-using agent template", body: "The template runs on a schedule, searches with a read-only tool, asks a model for a proposal, waits for approval and files the follow-up with a write tool. Choose your connection on both tool operators.", console: "Pipelines, New pipeline, Tool-using agent with MCP.", shot: { src: "/screens/mlops-mcp-agent.webp", alt: "The tool-using agent on the builder canvas", url: "app.tokener.io/mlops/pipelines/edit" } },
      { title: "Say honestly what each tool does", body: "On each Call MCP tool operator, set What the tool does. Changes data needs an approval gate upstream and a connection with write access. The pipeline will not validate if the tool is blocked, not on the approved list, or the arguments are not valid JSON.", code: { title: "Arguments are JSON with placeholders", lang: "yaml", text: "operator: mcp_tool\nconfig:\n  tool: create_issue\n  effect: Changes data\n  arguments: |\n    {\n      \"title\": \"Weekly triage summary\",\n      \"body\": \"{{context}}\"\n    }" } },
      { title: "Review, publish and simulate", body: "Review shows the plan and any policy blocks. A simulated run walks each operator, shows the approved tool check and stops at the approval before the write.", console: "Review, Publish version, then Run with Simulated." },
    ],
    verification: [
      "The test on the connection lists the server's tools and none run",
      "A tool that is not approved fails validation with a clear message",
      "The write tool does not run until an approver accepts",
      "Changing a tool's description on the server stops the next call",
    ],
    expected: "The agent reads through one approved tool, proposes an action, and only after a person approves does it call the write tool. Every call is in the audit log with its tool, caller, duration and result size.",
    cleanup: ["Disable the schedule", "Revoke the OAuth grant on the server", "Remove the connection, and stop and delete the local container"],
    troubleshooting: [
      { problem: "The connection test fails with 401", fix: "The token was issued for a different resource. The server address on the connection must match the server's canonical address, because it is sent as the OAuth resource." },
      { problem: "A tool is missing from the list", fix: "With Only tools I approve, a tool must be on the approved list. Discover tools first and approve them one by one." },
      { problem: "Calls stop after a server update", fix: "A tool definition changed and no longer matches its pinned hash. Review the change and approve it again." },
      { problem: "The local server cannot reach a host", fix: "Its network is none or an allowlist. Add the host and port to Allowed hosts." },
    ],
    references: [
      { label: "MCP specification", url: "https://modelcontextprotocol.io/specification" },
      { label: "MCP authorization", url: "https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization" },
      { label: "MCP transports", url: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports" },
      { label: "OAuth Protected Resource Metadata (RFC 9728)", url: "https://datatracker.ietf.org/doc/html/rfc9728" },
      { label: "Resource Indicators (RFC 8707)", url: "https://www.rfc-editor.org/rfc/rfc8707.html" },
    ],
    consoleLink: { label: "Open Integrations", href: "/mlops/integrations" },
  },
  {
    slug: "build-custom-mcp-server", title: "Build and publish your own MCP server", level: "Intermediate", minutes: 30,
    summary: "Create a server with a read tool and a write tool, fix what the checks report, publish it, connect a client, and export the same server as a TypeScript or Python project.",
    prerequisites: [
      "A published pipeline that performs the change you want to expose, such as updating a record",
      "A data connection with a read-only account, for a query tool",
      "A role that may edit and publish pipelines. Production publishing needs an approver",
    ],
    versions: ["MCP revisions 2025-03-26 through 2026-07-28", "Streamable HTTP", "TypeScript SDK 1.x, Python mcp 2.x for exported projects"],
    warnings: [
      { kind: "Security", text: "A tool that changes data must run a pipeline and wait for approval. The builder enforces this and will not publish otherwise." },
      { kind: "Data", text: "Arguments can contain personal data. Keep the audit setting on metadata unless your retention policy allows storing arguments." },
      { kind: "Security", text: "Tool descriptions are read by a model. Write them for that reader, and never put secrets or internal host names in them." },
    ],
    steps: [
      { title: "Create the server", body: "Choose a name, an environment and how clients authenticate. Start in development while you work, and move to staging and production when the checks are clean. Only development may skip authentication.", console: "MLOps, MCP Servers, New server." },
      { title: "Add a read tool", body: "Choose SQL query. Write one SELECT with named parameters such as :order_id, add a field for each parameter, and keep a LIMIT. The query runs in a read-only transaction on the data connection you choose.", code: { title: "A read tool", lang: "sql", text: "select id, status, total, updated_at\nfrom orders\nwhere id = :order_id\nlimit 1" } },
      { title: "Describe the tool for a model", body: "Say what the tool returns and when to use it, and describe every field. The builder warns on short descriptions because a vague tool is called at the wrong time.", console: "Tool editor, Description and Fields." },
      { title: "Add a write tool", body: "Choose Pipeline, pick the published pipeline and set how long the call may wait. Mark the effect as Changes data. Approval is on and cannot be turned off, so a person decides before the pipeline runs.", console: "Add tool, Pipeline, Effect: Changes data." },
      { title: "Fix what the checks report", body: "The Checks tab lists errors and warnings with the tool they belong to. Errors block publishing. Typical ones are a placeholder with no matching field, a query that is not a single SELECT, and a private address in an HTTPS tool.", console: "Checks tab." },
      { title: "Preview what a client will receive", body: "The Preview tab shows the exact tools/list document, with input schemas and the read-only and destructive hints. Check that the names and descriptions read well.", console: "Preview tab." },
      { title: "Publish", body: "Publishing creates a version and serves the server at its address. Editing a published server returns it to draft, so what clients see is always what was checked.", console: "Publish version." },
      { title: "Connect a client", body: "Copy the address and add it to your client with the key in a header. Ask the client to list its tools and call the read tool first.", code: { title: "Add the server to Claude Code", lang: "bash", text: "claude mcp add --transport http orders https://mcp.example.tokener.io/orders/mcp \\\n  --header \"Authorization: Bearer $TOKENER_MCP_KEY\"" } },
      { title: "Or export the project and run it yourself", body: "The Code tab produces a TypeScript or Python project with the same tools, a package file and a README. Download it as a zip, fill in the environment variables it lists and deploy it where you like.", console: "Code tab, Download project." },
    ],
    verification: [
      "The Checks tab shows no errors before you publish",
      "The client lists exactly the tools in the Preview tab",
      "The read tool returns one row for a known order number",
      "The write tool does not run its pipeline until an approver accepts",
      "Each call appears in the audit log with the tool, caller and duration",
    ],
    expected: "A published MCP server with a read tool and an approval-gated write tool. Clients list and call the tools, writes wait for a person, and every call is audited. The exported project exposes the same list.",
    cleanup: ["Unpublish the server and remove it", "Revoke the API key you gave the client", "Delete any exported project and its deployment"],
    troubleshooting: [
      { problem: "Publish is blocked with a placeholder error", fix: "A {{name}} in the address or a :name in the query has no field with that name. Add the field or fix the spelling." },
      { problem: "The SQL tool is refused", fix: "It must be one SELECT or WITH ... SELECT with no semicolon in the middle and no write keywords. Move changes into a pipeline." },
      { problem: "An HTTPS tool is refused for its address", fix: "Calls go over https only and cannot reach private addresses outside development. Use a public address or route through a build agent." },
      { problem: "The client cannot connect", fix: "Check the header carries the key, the environment's address is the one you copied, and the server is published and not back in draft after an edit." },
    ],
    references: [
      { label: "MCP specification", url: "https://modelcontextprotocol.io/specification" },
      { label: "MCP TypeScript SDK", url: "https://github.com/modelcontextprotocol/typescript-sdk" },
      { label: "MCP Python SDK", url: "https://github.com/modelcontextprotocol/python-sdk" },
    ],
    consoleLink: { label: "Open MCP Servers", href: "/mlops/mcp-servers" },
  },
];

export const tutorialBySlug = (s: string) => TUTORIALS.find((t) => t.slug === s);
