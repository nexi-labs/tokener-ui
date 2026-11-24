import { siAmazons3, siAmazonsqs, siApachekafka, siApachepulsar, siApacherocketmq, siDatabricks, siGooglebigquery, siGooglecloudstorage, siGooglepubsub, siInfluxdb, siSiemens, siHivemq, siMinio, siMongodb, siMqtt, siMysql, siNatsdotio, siOracle, siPostgresql, siRabbitmq, siSnowflake } from "simple-icons";
import { Database, Factory, Globe, HardDrive, Inbox, Mail, Radio, Server, Upload, Cloud, Waves, type LucideIcon } from "lucide-react";

/**
 * The connector catalogue for Refinery with the authentication methods each system really offers (docs/46, Connections and authentication).
 * A field of kind "secret" is stored as a secret reference, never as a value. Methods marked `identity` rely on the runner's own identity,
 * so they only work on a pool that runs inside the customer's cloud account or network.
 */
export type FieldKind = "text" | "secret" | "select" | "textarea";
export type Field = { key: string; label: string; kind: FieldKind; options?: string[]; placeholder?: string; hint?: string; optional?: boolean; def?: string };
export type AuthMethod = { id: string; label: string; blurb: string; fields: Field[]; identity?: boolean };
export type Group = "Object storage" | "Databases" | "Warehouses and lakehouses" | "Streaming" | "Industrial and OT" | "Files and APIs";
export type Connector = {
  id: string; name: string; group: Group;
  brand?: { title: string; path: string; hex: string }; glyph?: LucideIcon;
  /** Settings that are not secret (where the system is). */
  settings: Field[];
  auth: AuthMethod[];
  /** Roles this connector can play. */
  can: ("source" | "sink")[];
  note?: string;
  /** Present on systems that carry messages. Streams read from and write to these. */
  messaging?: Messaging;
};
/**
 * What a stream needs to know about a messaging system. Systems differ: a log (Kafka, Pulsar) keeps records so a reader can start again from the beginning,
 * a queue (RabbitMQ, SQS, ActiveMQ) hands each message to a consumer and forgets it once acknowledged.
 */
export type Messaging = {
  family: "log" | "queue" | "subject" | "cloud-log";
  /** What the system calls the thing a stream reads from. */
  unit: "Topic" | "Queue" | "Subject" | "Stream" | "Subscription" | "Event hub" | "Node set" | "Sparkplug group";
  /** What it is called when the stream writes to it, when that differs. */
  sinkUnit?: string;
  example: string;
  /** Can a reader start again from earlier records. */
  replay: boolean;
  /** Can the stream deliver each record exactly once end to end when this system is the source or the destination. */
  exactlyOnce: boolean;
  order: string;
  /** Plain language note shown when this system is picked. */
  semantics: string;
};

const secret = (key: string, label: string, hint?: string, optional?: boolean): Field => ({ key, label, kind: "secret", hint, optional });
const text = (key: string, label: string, placeholder?: string, hint?: string, optional?: boolean, def?: string): Field => ({ key, label, kind: "text", placeholder, hint, optional, def });
const select = (key: string, label: string, options: string[], def?: string, hint?: string): Field => ({ key, label, kind: "select", options, def: def ?? options[0], hint });

const TLS = select("tls", "TLS mode", ["require", "verify-ca", "verify-full", "disable"], "verify-full", "Verify full checks the certificate and the host name.");
const dbSettings = (port: string): Field[] => [text("host", "Host", "db.internal.example.com"), text("port", "Port", port), text("database", "Database", "analytics"), TLS];
const dbAuth = (extra: AuthMethod[] = []): AuthMethod[] => [
  { id: "password", label: "Username and password", blurb: "A database user. Give it read access to the tables you need, and write access only for sinks.", fields: [text("username", "Username"), secret("password", "Password")] },
  { id: "mtls", label: "Client certificate (mutual TLS)", blurb: "The runner proves who it is with a certificate instead of a password.", fields: [text("username", "Username"), secret("clientCert", "Client certificate"), secret("clientKey", "Private key"), secret("caCert", "CA certificate", undefined, true)] },
  ...extra,
];

const KAFKA_SETTINGS: Field[] = [text("brokers", "Bootstrap servers", "b-1.kafka.example.com:9093,b-2.kafka.example.com:9093"), select("protocol", "Security protocol", ["SASL_SSL", "SSL", "SASL_PLAINTEXT"], "SASL_SSL"), text("registry", "Schema registry address", "https://registry.example.com", "Optional. Used for Avro, Protobuf and JSON Schema topics.", true)];
const KAFKA_AUTH: AuthMethod[] = [
  { id: "sasl-plain", label: "SASL PLAIN", blurb: "Username and password. Common on Confluent Cloud with an API key and secret.", fields: [text("username", "Username or API key"), secret("password", "Password or API secret")] },
  { id: "sasl-scram", label: "SASL SCRAM", blurb: "Salted challenge response, SHA-256 or SHA-512.", fields: [select("mechanism", "Mechanism", ["SCRAM-SHA-256", "SCRAM-SHA-512"]), text("username", "Username"), secret("password", "Password")] },
  { id: "oauthbearer", label: "SASL OAUTHBEARER", blurb: "A token from your identity provider.", fields: [text("tokenUrl", "Token URL", "https://login.example.com/oauth/token"), text("clientId", "Client id"), secret("clientSecret", "Client secret"), text("scope", "Scope", undefined, undefined, true)] },
  { id: "mtls", label: "Mutual TLS", blurb: "The client presents a certificate.", fields: [secret("clientCert", "Client certificate"), secret("clientKey", "Private key"), secret("caCert", "CA certificate", undefined, true)] },
];

export const CONNECTORS: Connector[] = [
  { id: "s3", name: "Amazon S3", group: "Object storage", brand: siAmazons3, can: ["source", "sink"],
    settings: [text("bucket", "Bucket", "acme-data-lake"), text("region", "Region", "eu-west-1"), text("endpoint", "Custom endpoint", "https://storage.example.com", "Only for other S3 compatible stores. MinIO has its own entry.", true), text("prefix", "Default path prefix", "raw/", undefined, true)],
    auth: [
      { id: "access-key", label: "Access key and secret", blurb: "An IAM user key pair. Prefer a role where you can.", fields: [text("accessKeyId", "Access key id"), secret("secretAccessKey", "Secret access key")] },
      { id: "iam-role", label: "IAM role of the runner", blurb: "The runner uses the role of the machine or Kubernetes service account it runs on (instance profile or IRSA). No key is stored.", identity: true, fields: [] },
      { id: "assume-role", label: "Assume a cross account role", blurb: "The runner assumes a role in your account. Use the external id to stop another party from using the same role.", identity: true, fields: [text("roleArn", "Role ARN", "arn:aws:iam::123456789012:role/refinery-read"), text("externalId", "External id", undefined, undefined, true)] },
    ] },
  { id: "minio", name: "MinIO and S3 compatible storage", group: "Object storage", brand: siMinio, can: ["source", "sink"],
    settings: [text("endpoint", "Endpoint", "https://minio.internal.example.com:9000"), text("bucket", "Bucket", "datalake"), text("region", "Region", "us-east-1", "MinIO accepts any value. Leave the default if unsure.", true, "us-east-1"), select("pathStyle", "Addressing", ["path", "virtual-host"], "path", "MinIO uses path style unless a wildcard domain is set up."), TLS, text("prefix", "Default path prefix", "raw/", undefined, true)],
    auth: [
      { id: "access-key", label: "Access key and secret", blurb: "A MinIO user or service account. Give it the policy for this bucket only.", fields: [text("accessKeyId", "Access key"), secret("secretAccessKey", "Secret key")] },
      { id: "sts", label: "Temporary credentials (STS)", blurb: "A short lived key, secret and session token issued by MinIO STS or your identity provider.", fields: [text("accessKeyId", "Access key"), secret("secretAccessKey", "Secret key"), secret("sessionToken", "Session token")] },
    ], note: "Works with any store that speaks the S3 API, such as Ceph or Cloudflare R2, by changing the endpoint." },
  { id: "azure-blob", name: "Azure Blob and Data Lake Storage", group: "Object storage", glyph: Cloud, can: ["source", "sink"],
    settings: [text("account", "Storage account", "acmedatalake"), text("container", "Container", "raw"), text("prefix", "Default path prefix", "support/", undefined, true)],
    auth: [
      { id: "account-key", label: "Account key", blurb: "Full access to the account. Use only where a narrower option is not possible.", fields: [secret("accountKey", "Account key")] },
      { id: "sas", label: "Shared access signature", blurb: "A time limited token scoped to a container or path.", fields: [secret("sasToken", "SAS token")] },
      { id: "service-principal", label: "Service principal", blurb: "A Microsoft Entra application with a client secret.", fields: [text("tenantId", "Directory (tenant) id"), text("clientId", "Application (client) id"), secret("clientSecret", "Client secret")] },
      { id: "managed-identity", label: "Managed identity of the runner", blurb: "The runner uses the managed identity of the virtual machine or pod. No secret is stored.", identity: true, fields: [text("clientId", "Client id", undefined, "Only for a user assigned identity.", true)] },
    ], note: "Microsoft Azure has no entry in the open brand icon set, so a neutral cloud glyph is shown." },
  { id: "gcs", name: "Google Cloud Storage", group: "Object storage", brand: siGooglecloudstorage, can: ["source", "sink"],
    settings: [text("bucket", "Bucket", "acme-data-lake"), text("project", "Project id", "acme-prod"), text("prefix", "Default path prefix", undefined, undefined, true)],
    auth: [
      { id: "service-account", label: "Service account key", blurb: "A JSON key for a service account with the storage roles it needs.", fields: [secret("keyJson", "Service account key (JSON)")] },
      { id: "workload-identity", label: "Workload identity of the runner", blurb: "The runner acts as a Google service account through GKE workload identity or the machine's service account. No key is stored.", identity: true, fields: [text("serviceAccount", "Service account", "refinery@acme-prod.iam.gserviceaccount.com", undefined, true)] },
    ] },
  { id: "postgres", name: "PostgreSQL", group: "Databases", brand: siPostgresql, can: ["source", "sink"], settings: dbSettings("5432"),
    auth: dbAuth([{ id: "iam-token", label: "Cloud database IAM token", blurb: "The runner requests a short lived token from the cloud account (Amazon RDS, Cloud SQL, Azure Database).", identity: true, fields: [text("username", "Database user"), select("provider", "Cloud", ["aws", "gcp", "azure"], "aws")] }]) },
  { id: "mysql", name: "MySQL and MariaDB", group: "Databases", brand: siMysql, can: ["source", "sink"], settings: dbSettings("3306"), auth: dbAuth() },
  { id: "sqlserver", name: "Microsoft SQL Server", group: "Databases", glyph: Database, can: ["source", "sink"], settings: dbSettings("1433"),
    auth: dbAuth([{ id: "entra", label: "Microsoft Entra service principal", blurb: "Sign in with an application identity instead of a database user.", fields: [text("tenantId", "Directory (tenant) id"), text("clientId", "Application (client) id"), secret("clientSecret", "Client secret")] }]),
    note: "Microsoft SQL Server has no entry in the open brand icon set, so a neutral database glyph is shown." },
  { id: "oracle", name: "Oracle Database", group: "Databases", brand: siOracle, can: ["source"], settings: [text("host", "Host"), text("port", "Port", "1521"), text("service", "Service name", "ORCLPDB1"), TLS], auth: dbAuth() },
  { id: "mongodb", name: "MongoDB", group: "Databases", brand: siMongodb, can: ["source", "sink"],
    settings: [text("uri", "Connection host list", "mongo-0.internal:27017,mongo-1.internal:27017", "Hosts only. The user and password are added from the secrets below."), text("database", "Database", "support"), select("replicaSet", "Read from", ["primary", "secondary preferred", "nearest"], "secondary preferred")],
    auth: [
      { id: "scram", label: "SCRAM username and password", blurb: "The default MongoDB sign in.", fields: [text("username", "Username"), secret("password", "Password"), text("authSource", "Auth database", "admin", undefined, true, "admin")] },
      { id: "x509", label: "X.509 certificate", blurb: "Sign in with a client certificate.", fields: [secret("clientCert", "Client certificate and key (PEM)"), secret("caCert", "CA certificate", undefined, true)] },
    ] },
  { id: "snowflake", name: "Snowflake", group: "Warehouses and lakehouses", brand: siSnowflake, can: ["source", "sink"],
    settings: [text("account", "Account identifier", "acme-prod.eu-west-1"), text("warehouse", "Warehouse", "REFINERY_WH"), text("database", "Database", "ANALYTICS"), text("schema", "Schema", "PUBLIC"), text("role", "Role", "REFINERY", undefined, true)],
    auth: [
      { id: "password", label: "Username and password", blurb: "A Snowflake user. Snowflake is retiring password only sign in for people; a service user should use a key pair.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "key-pair", label: "Key pair", blurb: "The recommended way for a service user. Store the private key; register the public key on the user.", fields: [text("username", "Username"), secret("privateKey", "Private key (PEM)"), secret("passphrase", "Passphrase", undefined, true)] },
      { id: "oauth", label: "OAuth", blurb: "A token issued by your identity provider or Snowflake OAuth.", fields: [text("tokenUrl", "Token URL", "https://login.example.com/oauth/token"), text("clientId", "Client id"), secret("clientSecret", "Client secret")] },
    ] },
  { id: "bigquery", name: "Google BigQuery", group: "Warehouses and lakehouses", brand: siGooglebigquery, can: ["source", "sink"],
    settings: [text("project", "Project id", "acme-prod"), text("dataset", "Dataset", "analytics"), select("location", "Location", ["EU", "US", "europe-west1", "us-central1"], "EU")],
    auth: [
      { id: "service-account", label: "Service account key", blurb: "A JSON key with BigQuery data access.", fields: [secret("keyJson", "Service account key (JSON)")] },
      { id: "workload-identity", label: "Workload identity of the runner", blurb: "No key is stored.", identity: true, fields: [] },
    ] },
  { id: "databricks", name: "Databricks", group: "Warehouses and lakehouses", brand: siDatabricks, can: ["source", "sink"],
    settings: [text("host", "Workspace address", "https://adb-1234567890.1.azuredatabricks.net"), text("httpPath", "SQL warehouse path", "/sql/1.0/warehouses/abc123"), text("catalog", "Catalog", "main", undefined, true)],
    auth: [
      { id: "pat", label: "Personal access token", blurb: "A token for a user or service principal.", fields: [secret("token", "Access token")] },
      { id: "oauth-m2m", label: "OAuth machine to machine", blurb: "A service principal with a client secret.", fields: [text("clientId", "Client id"), secret("clientSecret", "Client secret")] },
    ] },
  { id: "kafka", name: "Apache Kafka", group: "Streaming", brand: siApachekafka, can: ["source", "sink"], settings: KAFKA_SETTINGS,
    auth: [...KAFKA_AUTH, { id: "msk-iam", label: "Amazon MSK IAM", blurb: "The runner signs requests with its AWS identity. No secret is stored.", identity: true, fields: [text("region", "Region", "eu-west-1"), text("roleArn", "Role to assume", undefined, undefined, true)] }],
    messaging: { family: "log", unit: "Topic", example: "support.tickets.raw, or a pattern such as events.*", replay: true, exactlyOnce: true, order: "Kept per partition", semantics: "Kafka keeps records, so a stream can start from the earliest offset or from now and can be rewound. Exactly once uses transactions and needs a transactional id." } },
  { id: "automq", name: "AutoMQ", group: "Streaming", glyph: Radio, can: ["source", "sink"], settings: KAFKA_SETTINGS, auth: KAFKA_AUTH,
    note: "AutoMQ speaks the Kafka protocol, so the Kafka client is used.",
    messaging: { family: "log", unit: "Topic", example: "events.clicks", replay: true, exactlyOnce: true, order: "Kept per partition", semantics: "AutoMQ is Kafka compatible and stores data in object storage. A stream behaves as on Kafka. Reading old offsets can be slower than on brokers that keep data on local disks." } },
  { id: "redpanda", name: "Redpanda", group: "Streaming", glyph: Radio, can: ["source", "sink"], settings: KAFKA_SETTINGS, auth: KAFKA_AUTH,
    note: "Redpanda speaks the Kafka protocol, so the Kafka client is used.",
    messaging: { family: "log", unit: "Topic", example: "orders.created", replay: true, exactlyOnce: true, order: "Kept per partition", semantics: "Redpanda is Kafka compatible. A stream behaves as on Kafka, including transactions for exactly once delivery." } },
  { id: "rabbitmq", name: "RabbitMQ", group: "Streaming", brand: siRabbitmq, can: ["source", "sink"],
    settings: [text("host", "Host", "rabbit.internal.example.com"), text("port", "Port", "5671"), text("vhost", "Virtual host", "/"), select("kind", "Reads from", ["Queue", "RabbitMQ Stream"], "Queue", "A stream queue keeps messages, so it can be read again. A classic or quorum queue cannot."), text("prefetch", "Prefetch count", "200", "Messages a runner may hold unacknowledged. Lower is safer, higher is faster.", true, "200"), TLS],
    auth: [
      { id: "password", label: "Username and password", blurb: "A RabbitMQ user with configure, write and read permission on the virtual host.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "mtls", label: "Client certificate (mutual TLS)", blurb: "The user is taken from the certificate (rabbitmq_auth_mechanism_ssl).", fields: [secret("clientCert", "Client certificate"), secret("clientKey", "Private key"), secret("caCert", "CA certificate", undefined, true)] },
    ],
    messaging: { family: "queue", unit: "Queue", sinkUnit: "Exchange or queue", example: "support.tickets", replay: false, exactlyOnce: false, order: "Kept per queue, not across several consumers", semantics: "A queue hands each message to the stream and forgets it once acknowledged, so a stream cannot start again from the beginning. A restart resumes from messages that were not acknowledged, which can repeat a few. Use a RabbitMQ Stream queue when you need to read again." } },
  { id: "pulsar", name: "Apache Pulsar", group: "Streaming", brand: siApachepulsar, can: ["source", "sink"],
    settings: [text("serviceUrl", "Service URL", "pulsar+ssl://pulsar.example.com:6651"), text("adminUrl", "Admin URL", "https://pulsar.example.com:8443", "Used to list topics and read schemas.", true), text("tenant", "Tenant", "acme"), text("namespace", "Namespace", "events")],
    auth: [
      { id: "token", label: "JWT token", blurb: "A token issued to a role that may consume and produce on the namespace.", fields: [secret("token", "Token")] },
      { id: "oauth2", label: "OAuth 2.0 client credentials", blurb: "The runner requests a token from your identity provider.", fields: [text("issuerUrl", "Issuer URL"), text("audience", "Audience"), text("clientId", "Client id"), secret("clientSecret", "Client secret")] },
      { id: "mtls", label: "Mutual TLS", blurb: "The client presents a certificate.", fields: [secret("clientCert", "Client certificate"), secret("clientKey", "Private key"), secret("caCert", "CA certificate", undefined, true)] },
    ],
    messaging: { family: "log", unit: "Topic", example: "persistent://acme/events/clicks", replay: true, exactlyOnce: true, order: "Kept per partition or per key", semantics: "Pulsar keeps messages until every subscription has acknowledged them, and a subscription can be reset to an earlier point. Exactly once uses Pulsar transactions." } },
  { id: "nats", name: "NATS JetStream", group: "Streaming", brand: siNatsdotio, can: ["source", "sink"],
    settings: [text("servers", "Servers", "tls://nats-1.example.com:4222,tls://nats-2.example.com:4222"), text("stream", "JetStream stream", "ORDERS", "The stream that stores the subjects. Plain NATS without JetStream does not keep messages and is not offered."), text("consumer", "Durable consumer name", "refinery-orders", undefined, true)],
    auth: [
      { id: "user", label: "Username and password", blurb: "An account user.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "token", label: "Token", blurb: "A shared token.", fields: [secret("token", "Token")] },
      { id: "creds", label: "User credentials (JWT and NKey)", blurb: "A .creds file for a user in an account.", fields: [secret("creds", "Credentials file")] },
      { id: "mtls", label: "Mutual TLS", blurb: "The client presents a certificate.", fields: [secret("clientCert", "Client certificate"), secret("clientKey", "Private key"), secret("caCert", "CA certificate", undefined, true)] },
    ],
    messaging: { family: "subject", unit: "Subject", example: "orders.created, or a wildcard such as orders.*", replay: true, exactlyOnce: false, order: "Kept per subject", semantics: "JetStream stores messages in a stream, so a durable consumer can start from the first message, from now or from a time. Delivery is at least once. Publishing with a message id lets the server drop repeats inside its duplicate window." } },
  { id: "kinesis", name: "Amazon Kinesis Data Streams", group: "Streaming", glyph: Waves, can: ["source", "sink"],
    settings: [text("region", "Region", "eu-west-1"), text("stream", "Stream name", "orders"), select("mode", "Read mode", ["shared throughput", "enhanced fan-out"], "shared throughput", "Enhanced fan-out gives this reader its own throughput and costs more.")],
    auth: [
      { id: "iam-role", label: "IAM role of the runner", blurb: "The runner uses its own AWS identity. Only on a pool inside your AWS account.", identity: true, fields: [text("roleArn", "Role to assume", undefined, undefined, true)] },
      { id: "access-key", label: "Access key and secret", blurb: "An IAM user key pair. Prefer a role.", fields: [text("accessKeyId", "Access key id"), secret("secretAccessKey", "Secret access key")] },
    ],
    messaging: { family: "cloud-log", unit: "Stream", example: "orders", replay: true, exactlyOnce: false, order: "Kept per shard", semantics: "Kinesis keeps records for the retention period of the stream, so a stream can start from the oldest record, from now or from a time inside that period. Delivery is at least once. Progress is kept in a checkpoint table." } },
  { id: "pubsub", name: "Google Cloud Pub/Sub", group: "Streaming", brand: siGooglepubsub, can: ["source", "sink"],
    settings: [text("project", "Project id", "acme-prod"), text("subscription", "Subscription", "refinery-orders", "Read from a subscription. A sink writes to a topic.", true)],
    auth: [
      { id: "service-account", label: "Service account key", blurb: "A JSON key for a service account with Pub/Sub Subscriber and Publisher roles.", fields: [secret("keyJson", "Service account key")] },
      { id: "workload-identity", label: "Workload identity", blurb: "The runner uses the identity of its Google Cloud workload. No key is stored.", identity: true, fields: [text("serviceAccount", "Service account", "refinery@acme-prod.iam.gserviceaccount.com")] },
    ],
    messaging: { family: "cloud-log", unit: "Subscription", sinkUnit: "Topic", example: "refinery-orders", replay: false, exactlyOnce: true, order: "Only with ordering keys turned on", semantics: "A subscription delivers each message and waits for an acknowledgement. Reading from the start needs a subscription that retains acknowledged messages and a seek. Exactly once delivery must be turned on for the subscription and works inside one region." } },
  { id: "eventhubs", name: "Azure Event Hubs", group: "Streaming", glyph: Cloud, can: ["source", "sink"],
    settings: [text("namespace", "Namespace", "acme-events.servicebus.windows.net"), text("hub", "Event hub", "orders"), text("group", "Consumer group", "refinery", "Give the stream its own group so it does not share progress with another reader.")],
    auth: [
      { id: "sas", label: "Shared access signature", blurb: "A connection string for a policy with Listen and Send rights.", fields: [secret("connectionString", "Connection string")] },
      { id: "entra", label: "Microsoft Entra service principal", blurb: "A registered application with the Azure Event Hubs Data Receiver and Sender roles.", fields: [text("tenantId", "Tenant id"), text("clientId", "Client id"), secret("clientSecret", "Client secret")] },
      { id: "managed-identity", label: "Managed identity", blurb: "The runner uses the identity of its Azure resource. No secret is stored.", identity: true, fields: [text("clientId", "Client id", undefined, "Only for a user assigned identity.", true)] },
    ],
    messaging: { family: "cloud-log", unit: "Event hub", example: "orders", replay: true, exactlyOnce: false, order: "Kept per partition", semantics: "Event Hubs keeps events for the retention period, so a stream can start from the beginning, from now or from a time inside it. Delivery is at least once. Progress is stored in a blob checkpoint store." } },
  { id: "mqtt", name: "MQTT broker", group: "Streaming", brand: siMqtt, can: ["source", "sink"],
    settings: [text("url", "Broker address", "ssl://broker.example.com:8883", "Works with Mosquitto, EMQX, HiveMQ, VerneMQ and cloud IoT brokers."), select("version", "Protocol version", ["5.0", "3.1.1"], "5.0"), select("qos", "Quality of service", ["1 (at least once)", "2 (exactly once per hop)", "0 (at most once)"], "1 (at least once)"), text("clientId", "Client id prefix", "refinery", "Each runner adds its own suffix.", true), select("session", "Session", ["persistent", "clean"], "persistent", "A persistent session lets the broker hold messages while the runner is away.")],
    auth: [
      { id: "password", label: "Username and password", blurb: "A broker user allowed to subscribe and publish on the topics.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "mtls", label: "Client certificate (mutual TLS)", blurb: "The client presents a certificate.", fields: [secret("clientCert", "Client certificate"), secret("clientKey", "Private key"), secret("caCert", "CA certificate", undefined, true)] },
      { id: "none", label: "No authentication", blurb: "Only for a broker inside a trusted network.", fields: [] },
    ],
    messaging: { family: "queue", unit: "Topic", example: "sensors/+/temperature", replay: false, exactlyOnce: false, order: "Kept per topic and publisher", semantics: "MQTT brokers do not keep a history for new readers. A persistent session keeps messages while the runner is away. Quality of service 2 gives one delivery per hop, not end to end, so duplicates are still possible after a restart." } },
  { id: "activemq", name: "Apache ActiveMQ", group: "Streaming", glyph: Mail, can: ["source", "sink"],
    settings: [text("url", "Broker address", "amqps://activemq.example.com:5671"), select("protocol", "Protocol", ["AMQP 1.0", "OpenWire", "Core (Artemis)"], "AMQP 1.0"), select("kind", "Reads from", ["Queue", "Topic"], "Queue")],
    auth: [
      { id: "password", label: "Username and password", blurb: "A broker user with consume and send permission.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "mtls", label: "Client certificate (mutual TLS)", blurb: "The client presents a certificate.", fields: [secret("clientCert", "Client certificate"), secret("clientKey", "Private key"), secret("caCert", "CA certificate", undefined, true)] },
    ],
    messaging: { family: "queue", unit: "Queue", example: "tickets.in", replay: false, exactlyOnce: false, order: "Kept per queue, not across several consumers", semantics: "A queue hands each message to the stream and forgets it once acknowledged, so a stream cannot start from the beginning. A restart can repeat messages that were not acknowledged." } },
  { id: "rocketmq", name: "Apache RocketMQ", group: "Streaming", brand: siApacherocketmq, can: ["source", "sink"],
    settings: [text("nameServer", "Name server", "rocketmq-ns.example.com:9876"), text("group", "Consumer group", "refinery")],
    auth: [
      { id: "acl", label: "Access key and secret (ACL)", blurb: "An ACL identity with subscribe and publish rights on the topics.", fields: [text("accessKey", "Access key"), secret("secretKey", "Secret key")] },
      { id: "none", label: "No authentication", blurb: "Only for a broker inside a trusted network.", fields: [] },
    ],
    messaging: { family: "log", unit: "Topic", example: "OrderCreated", replay: true, exactlyOnce: false, order: "Kept per queue of a topic", semantics: "RocketMQ keeps messages, so a consumer group can start from the first message, from now or from a time. Delivery is at least once." } },
  { id: "sqs", name: "Amazon SQS", group: "Streaming", brand: siAmazonsqs, can: ["source", "sink"],
    settings: [text("region", "Region", "eu-west-1"), text("queueUrl", "Queue address", "https://sqs.eu-west-1.amazonaws.com/123456789012/tickets", "A FIFO queue keeps order and removes repeats inside five minutes."), select("kind", "Queue type", ["Standard", "FIFO"], "Standard")],
    auth: [
      { id: "iam-role", label: "IAM role of the runner", blurb: "The runner uses its own AWS identity. Only on a pool inside your AWS account.", identity: true, fields: [text("roleArn", "Role to assume", undefined, undefined, true)] },
      { id: "access-key", label: "Access key and secret", blurb: "An IAM user key pair. Prefer a role.", fields: [text("accessKeyId", "Access key id"), secret("secretAccessKey", "Secret access key")] },
    ],
    messaging: { family: "queue", unit: "Queue", example: "tickets", replay: false, exactlyOnce: false, order: "Only in a FIFO queue", semantics: "A queue hands each message to the stream and deletes it once the stream acknowledges. Standard queues can deliver a message twice and out of order. A message not acknowledged inside the visibility timeout is delivered again." } },
  { id: "cdc-postgres", name: "Change capture: PostgreSQL", group: "Streaming", brand: siPostgresql, can: ["source"],
    settings: [text("host", "Host", "db.internal.example.com"), text("port", "Port", "5432"), text("database", "Database", "orders"), text("slot", "Replication slot", "refinery_orders"), text("publication", "Publication", "refinery_pub"), text("tables", "Tables", "public.orders,public.customers"), TLS],
    auth: [
      { id: "password", label: "Replication user and password", blurb: "A user with the REPLICATION attribute and select on the tables. The database needs logical replication on (wal_level = logical).", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "mtls", label: "Client certificate (mutual TLS)", blurb: "Certificate based sign in for the replication user.", fields: [text("username", "Username"), secret("clientCert", "Client certificate"), secret("clientKey", "Private key"), secret("caCert", "CA certificate", undefined, true)] },
    ], note: "Change capture is read by Debezium. The first read is a snapshot, then the log is followed." },
  { id: "cdc-mysql", name: "Change capture: MySQL", group: "Streaming", brand: siMysql, can: ["source"],
    settings: [text("host", "Host"), text("port", "Port", "3306"), text("database", "Database"), text("serverId", "Replication server id", "5400"), text("tables", "Tables", "shop.orders"), TLS],
    auth: [{ id: "password", label: "Replication user and password", blurb: "A user with REPLICATION SLAVE, REPLICATION CLIENT and select. Binary logging must be on in row format.", fields: [text("username", "Username"), secret("password", "Password")] }] },
  // ---- Industrial and OT. Plant data arrives through protocols and historians, not tables. All of these need a runner on the plant network, because OT networks accept no inbound connections.
  { id: "opcua", name: "OPC UA server", group: "Industrial and OT", glyph: Factory, can: ["source"],
    note: "Reads values from PLCs, gateways and historians that expose OPC UA. Needs a runner that can reach the server.",
    settings: [text("endpoint", "Endpoint", "opc.tcp://plc-1.plant.example.com:4840", "The address the server lists in its endpoint description."), select("securityPolicy", "Security policy", ["Basic256Sha256", "Aes128_Sha256_RsaOaep", "Aes256_Sha256_RsaPss", "None"], "Basic256Sha256", "None sends data unprotected. Use it only on an isolated test network."), select("securityMode", "Security mode", ["SignAndEncrypt", "Sign", "None"], "SignAndEncrypt"),
      text("nodes", "Nodes to read", "ns=2;s=Line3.Compressor1.Temperature, ns=2;s=Line3.Compressor1.Pressure", "Node ids, separated by commas. Browse the server's address space to find them.", true), text("publishingInterval", "Publishing interval (ms)", "1000", "How often the server sends changed values.", true, "1000")],
    auth: [
      { id: "anonymous", label: "Anonymous", blurb: "Only where the server allows it, on a trusted network.", fields: [] },
      { id: "password", label: "Username and password", blurb: "A server user with read access to the nodes.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "x509", label: "Application certificate (X.509)", blurb: "The runner proves who it is with a certificate. Add that certificate to the server's trust list before the first connection.", fields: [secret("clientCert", "Application certificate"), secret("clientKey", "Private key"), secret("caCert", "Server CA certificate", undefined, true)] },
    ],
    messaging: { family: "subject", unit: "Node set", example: "ns=2;s=Line3.Compressor1.*", replay: false, exactlyOnce: false, order: "Kept per node by source timestamp", semantics: "OPC UA sends a value when it changes, as a subscription. It keeps no history for the runner, so values sent while the runner is offline are lost unless the server queues them. Use a historian connection when you need to read the past." } },
  { id: "sparkplug", name: "MQTT Sparkplug B", group: "Industrial and OT", brand: siMqtt, can: ["source", "sink"],
    note: "MQTT with the Sparkplug B topic and payload rules used by edge gateways and SCADA systems.",
    settings: [text("url", "Broker address", "ssl://broker.plant.example.com:8883"), text("groupId", "Group id", "line3", "The Sparkplug group to read. Leave empty to read every group.", true), text("edgeNode", "Edge node", "gateway-01", "Limit to one edge node.", true), select("version", "Protocol version", ["5.0", "3.1.1"], "3.1.1")],
    auth: [
      { id: "password", label: "Username and password", blurb: "A broker user allowed to subscribe to spBv1.0/# and, for a sink, publish.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "mtls", label: "Client certificate (mutual TLS)", blurb: "The client presents a certificate.", fields: [secret("clientCert", "Client certificate"), secret("clientKey", "Private key"), secret("caCert", "CA certificate", undefined, true)] },
    ],
    messaging: { family: "queue", unit: "Sparkplug group", example: "spBv1.0/line3/DDATA/gateway-01/compressor-1", replay: false, exactlyOnce: false, order: "Kept per device by sequence number", semantics: "Sparkplug devices announce their metrics once in a birth message and then send only changes. A runner that starts later can ask the node to send its birth again, so it can name the metrics. The broker keeps no history for the runner. Whether data sent while the runner was offline is held back depends on the edge node: Sparkplug nodes configured with a primary host buffer until it is online." } },
  { id: "databus", name: "Siemens Industrial Edge Databus", group: "Industrial and OT", brand: siSiemens, can: ["source"],
    note: "Reads the MQTT topics of the Databus on an Industrial Edge device. Create a user for the runner in the Databus configuration first.",
    settings: [text("url", "Databus address", "ssl://edge-1.plant.example.com:8883", "The broker address and port your Edge setup exposes for external clients."), text("topics", "Topics", "ie/d/j/simatic/v1/s7c1/dp/r/#", "Topic filters, separated by commas.", true)],
    auth: [{ id: "password", label: "Username and password", blurb: "A Databus user allowed to subscribe to the topics.", fields: [text("username", "Username"), secret("password", "Password")] }],
    messaging: { family: "queue", unit: "Topic", example: "ie/d/j/simatic/v1/s7c1/dp/r/#", replay: false, exactlyOnce: false, order: "Kept per topic and publisher", semantics: "The Databus is an MQTT broker on the Edge device. Cyclic values are not replayed to a late subscriber, apart from retained metadata messages, so values sent while the runner is offline are lost. Run the runner on or beside the Edge device." } },
  { id: "modbus", name: "Modbus TCP", group: "Industrial and OT", glyph: Factory, can: ["source"],
    note: "Modbus has no sign in and no encryption. Use it only on a closed plant network or through a gateway.",
    settings: [text("host", "Host", "meter-1.plant.example.com"), text("port", "Port", "502", undefined, undefined, "502"), text("unitId", "Unit id", "1", "The device address behind a gateway.", true, "1"), text("pollSeconds", "Poll every (seconds)", "5", undefined, true, "5"),
      { key: "registers", label: "Registers", kind: "textarea", placeholder: "voltage_l1, holding, 0, float32\nenergy_kwh, input, 10, uint32", hint: "One per line: name, table (holding or input), address, type.", optional: true }],
    auth: [{ id: "none", label: "No authentication", blurb: "The protocol has none. Restrict access in the network.", fields: [] }] },
  { id: "pi", name: "AVEVA PI System", group: "Industrial and OT", glyph: Factory, can: ["source"],
    note: "Reads recorded values of PI points through PI Web API. For history, not for live streaming.",
    settings: [text("baseUrl", "PI Web API address", "https://pi.plant.example.com/piwebapi"), text("dataServer", "PI Data Archive", "PIARCHIVE01"), text("points", "PI points", "Line3.Compressor1.Temperature, Line3.Compressor1.Pressure", "Point names, separated by commas. Leave empty to choose later.", true), TLS],
    auth: [
      { id: "basic", label: "Username and password", blurb: "A PI Web API user with read access to the points.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "kerberos", label: "Windows integrated (Kerberos)", blurb: "The runner signs in as its Windows service account. Only on a runner joined to the domain.", identity: true, fields: [] },
      { id: "bearer", label: "Bearer token", blurb: "A token from your identity provider.", fields: [secret("token", "Token")] },
    ] },
  { id: "influxdb", name: "InfluxDB", group: "Industrial and OT", brand: siInfluxdb, can: ["source", "sink"],
    note: "Time series database used on plant floors and in monitoring.",
    settings: [text("url", "Address", "https://influx.plant.example.com:8086"), text("org", "Organisation", "plant"), text("bucket", "Bucket", "line3")],
    auth: [{ id: "token", label: "API token", blurb: "A token with read access to the bucket, and write access for a sink.", fields: [secret("token", "API token")] }] },
  { id: "sftp", name: "SFTP", group: "Files and APIs", glyph: HardDrive, can: ["source", "sink"],
    settings: [text("host", "Host", "sftp.partner.example.com"), text("port", "Port", "22"), text("path", "Base path", "/exports"), text("hostKey", "Host key fingerprint", "SHA256:...", "Pin the server's key so a different server cannot answer.", true)],
    auth: [
      { id: "password", label: "Username and password", blurb: "A password for the account.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "ssh-key", label: "SSH private key", blurb: "A key pair. Register the public key on the server.", fields: [text("username", "Username"), secret("privateKey", "Private key"), secret("passphrase", "Passphrase", undefined, true)] },
    ] },
  { id: "http", name: "HTTP and REST API", group: "Files and APIs", glyph: Globe, can: ["source"],
    settings: [text("baseUrl", "Base address", "https://api.example.com/v2", "https only. Internal addresses are refused unless the pool runs inside that network."), text("path", "Path", "/tickets"), select("pagination", "Pagination", ["none", "page number", "cursor", "link header"], "cursor")],
    auth: [
      { id: "api-key", label: "API key", blurb: "A key sent in a header or the query string.", fields: [select("placement", "Send in", ["header", "query"]), text("name", "Name", "X-API-Key"), secret("value", "Key")] },
      { id: "bearer", label: "Bearer token", blurb: "A token sent in the Authorization header.", fields: [secret("token", "Token")] },
      { id: "basic", label: "Basic", blurb: "Username and password in the Authorization header.", fields: [text("username", "Username"), secret("password", "Password")] },
      { id: "oauth-client", label: "OAuth 2.0 client credentials", blurb: "The runner requests a token with a client id and secret and refreshes it.", fields: [text("tokenUrl", "Token URL"), text("clientId", "Client id"), secret("clientSecret", "Client secret"), text("scope", "Scope", undefined, undefined, true)] },
      { id: "none", label: "No authentication", blurb: "A public address.", fields: [] },
    ] },
];

export const CONNECTOR_BY_ID = new Map(CONNECTORS.map((c) => [c.id, c]));
export const GROUPS: Group[] = ["Object storage", "Databases", "Warehouses and lakehouses", "Streaming", "Industrial and OT", "Files and APIs"];
export const LOCAL_UPLOAD = { name: "Upload from this computer", glyph: Upload };
export const GLYPH_FALLBACK: LucideIcon = Server;
export const STREAM_GLYPH: LucideIcon = Radio;

/** Names of the secret fields of a method, in order. */
/** Streaming systems a stream can read from or write to, with how each one behaves. Change capture is listed separately by the stream wizard. */
export const MESSAGING = CONNECTORS.filter((c) => c.messaging);

export const secretKeys = (m: AuthMethod) => m.fields.filter((f) => f.kind === "secret").map((f) => f.key);

/** The reference a secret field is stored under. The value is written to the secret manager by the API; the console keeps only this. */
export const secretRefFor = (tenant: string, connectionName: string, key: string) => `secretref://vault/${tenant}/refinery/connections/${connectionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}/${key}`;
