import type { UseCase } from "./types";

const BUILDER = { src: "/screens/refinery-builder.webp", url: "app.tokener.io/refinery/recipes", caption: "A recipe on the canvas: read, clean, mask, deduplicate and write, with each step coloured by what it does. The same recipe opens in the guided wizard." };
const RUN = { src: "/screens/refinery-run.webp", url: "app.tokener.io/refinery/runs", caption: "The run window follows a structured log as the run happens, with row counts per step and the rows that were rejected." };
const DATASET = { src: "/screens/refinery-dataset.webp", url: "app.tokener.io/refinery/datasets", caption: "A dataset with its profile. Nulls, blanks, placeholder text and stray spaces are coloured in the sample before anything runs." };
const STREAMS = { src: "/screens/refinery-streams.webp", url: "app.tokener.io/refinery/streams", caption: "Streams clean records from a messaging system or a Debezium change feed continuously and write to files, a table or another topic or queue." };

/** Use cases built around Refinery, the data preparation product. Figures are kept qualitative. */
export const REFINERY: UseCase[] = [
  {
    slug: "refinery-support-tickets-fine-tuning",
    industry: "enterprise",
    title: "From a ticket export to a fine-tuning set, with the customer data removed",
    summary: "Clean years of support tickets, mask personal data, drop duplicates and boilerplate, write a JSON Lines training set and hand a dataset version to the training pipeline.",
    tags: ["Refinery", "Fine-tuning", "Data preparation"],
    challenge: [
      "A support team has years of resolved tickets and wants a model that drafts good first replies. The export is the problem. Subjects carry order numbers, bodies carry names, phone numbers and card fragments, agents paste the same canned macro into thousands of replies, and a large share of rows are auto-replies, spam or tickets closed with no answer.",
      "Training on that export teaches the model the macros, leaks customer details into its weights and rewards whatever the busiest agents typed. The clean-up is usually a notebook that one person wrote, nobody can rerun, and the training team cannot trace back to the version of the data they trained on.",
    ],
    solution: [
      "The team connects the ticketing export, previews a bounded sample in the console and builds a recipe. Rows with no human reply are filtered out, text is normalised, personal data is masked with typed placeholders, exact and near duplicates are removed by a key and a similarity step, and macro text is trimmed. A model assist step proposes the same changes from a sentence such as \"drop auto-replies and mask phone numbers\", and the team reviews the steps before they apply.",
      "The recipe runs on a runner pool inside the company network, so ticket text never passes through the control plane. The output is a JSON Lines file with one prompt and reply pair per line, plus a Parquet copy for analysis. Each run records the recipe version and the input snapshot, and the training pipeline reads a named dataset version instead of a folder path.",
    ],
    steps: [
      { title: "Connect and profile the export", body: "Read the ticket files, look at the profile and the coloured sample, and see how many rows are empty, duplicated or placeholder text." },
      { title: "Build the recipe", body: "Filter, normalise, mask personal data, deduplicate and trim macros, on the canvas or in the wizard." },
      { title: "Review what the assistant proposes", body: "Describe a change in plain language and accept or edit the steps it suggests." },
      { title: "Run on the runner pool", body: "Follow the log, check the rejected rows and their reasons, and compare counts per step." },
      { title: "Publish a dataset version", body: "Write JSON Lines for fine-tuning and Parquet for analysis, and give the training pipeline the version." },
    ],
    scene: {
      alt: "Ticket exports enter a recipe that masks personal data and removes duplicates. A runner pool writes a JSON Lines training set, and the training pipeline reads a dataset version. Rejected rows are kept aside.",
      caption: "Rows that fail a check are kept aside with the reason. The training pipeline reads a named version.",
      cols: [
        [["zd", "Ticket export", "files or upload", "b:Zendesk"]],
        [["rcp", "Recipe", "mask, dedupe, trim", "l:Workflow", true]],
        [["pool", "Runner pool", "your network", "l:Cpu"]],
        [["jsonl", "Training set", "JSON Lines", "b:MinIO"], ["rej", "Rejects", "with reasons", "l:Archive"]],
        [["train", "Training pipeline", "dataset version", "l:Rocket"]],
      ],
      flow: [
        "zd>rcp|info|ticket rows", "rcp>pool|ok|masked", "pool>jsonl|ok|prompt and reply", "jsonl>train|info|version 4",
        "---",
        "rcp>pool|ok", "pool>rej|warn|auto-reply dropped",
      ],
    },
    systems: ["Zendesk", "MinIO", "Amazon S3", "Hugging Face"],
    controls: ["Runners connect outbound only", "Secrets are references, never stored in a recipe", "Masking happens before any text is written", "Each run records the recipe version and input snapshot"],
    measures: ["Share of rows rejected, by reason", "Personal data patterns remaining in a sample", "Duplicate rate before and after", "Reply quality on a held-out set"],
    example: "A team exports resolved tickets, removes auto-replies and macros, masks names and phone numbers, and writes one JSON Lines file. The fine-tuning job reads dataset version 4. When the masking rules change, version 5 is produced from the same export and the two can be compared.",
    console: { ...BUILDER },
  },
  {
    slug: "refinery-contracts-training-corpus",
    industry: "legal",
    title: "Turning a library of contracts and scans into a corpus a model can learn from",
    summary: "Extract text from PDFs, Word files and scanned pages, keep the page and the confidence, clean it, and write one table for retrieval and training.",
    tags: ["Refinery", "Documents", "Corpus"],
    challenge: [
      "A legal team holds a large library of contracts in many formats: born-digital PDFs, Word files, emails with attachments and boxes of scanned pages. They want a corpus for retrieval and for training a clause classifier. Every format needs a different reader, scanned pages need character recognition, and the output of that recognition is noisy.",
      "Done by hand, the extraction is repeated for each project, nobody keeps the page numbers, and quality problems surface only when the model quotes a clause that was a footer.",
    ],
    solution: [
      "Refinery treats documents as a source. A binary file is read by the document-processing module on a runner, and the result is one table with a row per page: document id, file name, type, page, language, recognition confidence and text. Text-like files are read directly. The recipe then removes headers, footers and page numbers, drops pages below a confidence floor into a review set, normalises whitespace and hyphenation, and masks what must be masked.",
      "Because the work is large, the run uses a pool of runners in parallel and converts the intermediate result to Parquet once, so every later step reads a columnar format. The output keeps the page so a retrieval answer can cite it, and the same table feeds both the knowledge base and the training set.",
    ],
    steps: [
      { title: "Point at the library", body: "Read the bucket or upload files. PDFs, Word, PowerPoint, HTML, email, images and audio are all accepted." },
      { title: "Extract to one table", body: "One row per page with the text, the language and the recognition confidence." },
      { title: "Clean the text", body: "Remove repeated headers and footers, fix hyphenation, normalise whitespace and mask sensitive values." },
      { title: "Set a confidence floor", body: "Pages below the floor go to a review set instead of the corpus." },
      { title: "Write for both uses", body: "Write Parquet for training and send the same rows to a knowledge base for retrieval with page citations." },
    ],
    scene: {
      alt: "Contracts in several formats are extracted to a page table, cleaned on a runner pool, and written as Parquet. Low confidence pages go to a review set, and good pages feed a knowledge base and a training job.",
      caption: "Low-confidence pages are set aside for review rather than blended into the corpus.",
      cols: [
        [["lib", "Contract library", "PDF, Word, scans", "b:Amazon S3"]],
        [["ext", "Extraction", "page table", "l:ScanText"]],
        [["rcp", "Recipe", "clean and mask", "l:Workflow", true]],
        [["pool", "Runner pool", "parallel", "l:Cpu"]],
        [["pq", "Corpus", "Parquet", "l:Layers"], ["rev", "Review set", "low confidence", "l:Eye"]],
        [["kb", "Knowledge base", "cited pages", "l:BookOpen"], ["train", "Training job", "clause classifier", "l:Rocket"]],
      ],
      flow: [
        "lib>ext|info|mixed formats", "ext>rcp|ok|page rows", "rcp>pool|ok", "pool>pq|ok|Parquet", "pq>kb|info|with pages", "pq>train|info|dataset version",
        "---",
        "pool>rev|warn|below floor",
      ],
    },
    systems: ["Amazon S3", "MinIO", "Apache Spark"],
    controls: ["Masking before text is written", "Matter and client fields kept as columns for filtering", "Review set for low-confidence pages", "Runner pools in your network"],
    measures: ["Pages below the confidence floor", "Share of pages with a repeated header removed", "Retrieval recall on a test set", "Classifier accuracy on held-out contracts"],
    example: "A library of mixed files is read once into a page table. Pages with low recognition confidence are queued for a person to check, and the rest become a Parquet corpus that the knowledge base and the classifier both read.",
    console: { ...DATASET },
  },
  {
    slug: "refinery-cdc-orders-to-lake",
    industry: "retail",
    title: "Cleaning an orders database as it changes, and keeping the lake and a table in sync",
    summary: "Read a Debezium change feed from the orders database, clean each change, and write it to files, MinIO, S3 or a relational table, so training data stays current.",
    tags: ["Refinery", "CDC", "Streaming"],
    challenge: [
      "An online retailer retrains its recommendation and forecasting models from order data. A nightly full export is slow and goes stale within hours, and the raw feed from the database has the problems the export has: inconsistent country codes, test orders, free-text notes with personal data and updates that arrive after deletes.",
      "Teams end up with a lake that is a day behind and a second table that someone patches by hand, and the training set depends on which copy they pick.",
    ],
    solution: [
      "A Refinery stream reads the Debezium change topics from Kafka. The recipe for a stream may use only steps that work row by row or with a bounded window, so the console blocks a step that would need a full scan. Each change is normalised, test orders are filtered, notes are masked, and the result is written with a mode that fits the destination.",
      "Append writes every change as a new row, which suits files and an audit trail. Upsert keeps the latest row per primary key and suits a table. Mirror also applies deletes. Upsert and mirror into plain files need a table format such as Iceberg, which Refinery plans to support, so for now a table or an append-only file destination is the choice. Delivery is at least once by default and can be set to exactly once where the destination supports it, and a schema change either adds columns or stops the stream for review.",
    ],
    steps: [
      { title: "Choose the change source", body: "Pick the Kafka topics that carry the Debezium change events, and the primary key of each table." },
      { title: "Use a streamable recipe", body: "Normalise, filter, mask and enrich row by row. Steps that need the whole dataset are not offered." },
      { title: "Pick a destination and a mode", body: "Files, a table or another topic, with append, upsert or mirror." },
      { title: "Set delivery and schema rules", body: "At least once or exactly once, and add columns or stop when a source column changes." },
      { title: "Watch the stream", body: "See lag, throughput, rejects and the last change applied, and pause or resume from the console." },
    ],
    scene: {
      alt: "Debezium change events from a database flow through Kafka into a streaming recipe on a runner pool. Cleaned changes are appended to files in MinIO or upserted into a table.",
      caption: "The same cleaned change can be appended to files for training or upserted into a table for serving.",
      cols: [
        [["db", "Orders database", "source of truth", "b:PostgreSQL"]],
        [["dbz", "Debezium", "change events", "l:Waypoints"]],
        [["kf", "Kafka", "change topics", "b:Apache Kafka"]],
        [["rcp", "Streaming recipe", "row by row", "l:Workflow", true]],
        [["pool", "Stream pool", "continuous", "l:Cpu"]],
        [["files", "Lake files", "append", "b:MinIO"], ["tbl", "Clean table", "upsert by key", "b:PostgreSQL"]],
      ],
      flow: [
        "db>dbz|info|row changed", "dbz>kf|info", "kf>rcp|info|change event", "rcp>pool|ok|normalised", "pool>files|ok|append",
        "---",
        "db>dbz|info|row updated", "dbz>kf|info", "kf>rcp|info", "rcp>pool|ok", "pool>tbl|ok|upsert by key",
      ],
    },
    systems: ["PostgreSQL", "Apache Kafka", "MinIO", "Amazon S3"],
    controls: ["Only streamable steps are allowed in a stream recipe", "Primary key required for upsert and mirror", "Schema change rule set per stream", "Delivery guarantee stated and shown on the stream"],
    measures: ["Consumer lag", "Rows rejected by reason", "Time from change to destination", "Difference between the table and the source on a sample"],
    example: "A price correction and a cancelled order arrive as two change events. The first is upserted by order id. The second removes the order from the mirrored table and is appended as a delete record in the lake files, so the next training run can see both.",
    console: { ...STREAMS },
  },
  {
    slug: "refinery-churn-feature-engineering",
    industry: "telecom",
    title: "Building churn features once, and using them for training and scoring",
    summary: "Join usage, billing and support data, compute ratios, rolling windows and encodings in a recipe, and write a versioned feature table the training and scoring jobs both read.",
    tags: ["Refinery", "Feature engineering", "Churn"],
    challenge: [
      "A telecom team predicts which customers will leave. The signal is spread across usage records, billing and support contacts, and the useful features are things like the change in monthly usage, the number of support contacts in the last thirty days and whether a bill rose. Every analyst computes them slightly differently, and the scoring service computes them a third way, so a model that tested well performs worse in production.",
    ],
    solution: [
      "The feature logic is written once as a recipe. Join steps combine the three sources by customer, feature steps compute ratios and differences, rolling windows over a date column, bucketing, one-hot and target-free encodings and scaling, and a final step writes a feature table with the customer id and a snapshot date. The same recipe runs for the training snapshot and on a schedule for scoring, so the definitions cannot drift apart.",
      "Because every run records the recipe version and the input snapshot, a model can name the feature version it was trained on, and a later change to a window length produces a new version instead of silently altering the old one.",
    ],
    steps: [
      { title: "Join the sources", body: "Usage, billing and support data joined by customer and snapshot date." },
      { title: "Add feature steps", body: "Ratios, differences, rolling windows, bucketing, encodings and scaling, each with its parameters in the step panel." },
      { title: "Check the profile", body: "Review distributions and nulls for each new column before running at scale." },
      { title: "Write a versioned table", body: "Write Parquet with the customer id and snapshot date, partitioned by date." },
      { title: "Reuse it for scoring", body: "Run the same recipe on a schedule for the scoring job, and record the version used." },
    ],
    scene: {
      alt: "Usage, billing and support data are joined and turned into features in one recipe. A runner pool writes a versioned feature table that the training job and the scoring job both read.",
      caption: "One recipe defines the features. Training and scoring read the same versioned table.",
      cols: [
        [["use", "Usage records", "warehouse", "b:Snowflake"], ["bill", "Billing", "database", "b:PostgreSQL"], ["sup", "Support contacts", "tickets", "b:Zendesk"]],
        [["rcp", "Feature recipe", "join, windows, encode", "l:Workflow", true]],
        [["pool", "Runner pool", "parallel", "l:Cpu"]],
        [["ft", "Feature table", "Parquet, versioned", "l:Layers"]],
        [["train", "Training job", "snapshot", "l:Rocket"], ["score", "Scoring job", "scheduled", "l:Brain"]],
      ],
      flow: [
        "use>rcp|info", "bill>rcp|info", "sup>rcp|info", "rcp>pool|ok|features", "pool>ft|ok|version 7", "ft>train|info|training snapshot",
        "---",
        "ft>score|info|same definitions",
      ],
    },
    systems: ["Snowflake", "PostgreSQL", "Zendesk", "Apache Spark"],
    controls: ["Feature parameters versioned with the recipe", "Run record names the input snapshot", "Profile check before scaling a run", "Runners in your network"],
    measures: ["Difference between training and scoring feature values on a sample", "Null rate per feature", "Model performance by feature version", "Run time as the input grows"],
    example: "The team changes the support window from thirty to sixty days. The recipe version changes, a new feature table version is written, and the churn model names the version it trained on, so the earlier results remain reproducible.",
    console: { ...BUILDER },
  },
];
