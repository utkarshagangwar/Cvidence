// The contract every job board follows. To add a board (free or paid):
//   1. write lib/jobs/adapters/<name>.ts exporting a SourceAdapter,
//   2. add it to ADAPTERS in lib/jobs/registry.ts,
//   3. if it needs a key, add the env var names to `requiredEnv` and to .env.example,
//   4. insert rows into job_sources with adapter = '<name>' (Supabase table editor).
// No migration and no change to the worker, search or UI.

/** One row of job_sources, as the adapter sees it. */
export interface SourceConfig {
  id: string;
  adapter: string;
  slug: string;
  company: string;
  /** Free-form settings from job_sources.config (for example a search query). */
  config: Record<string, unknown>;
}

/** What a parser returns. normalisePosting() checks and cleans it before saving. */
export interface RawPosting {
  externalId: string;
  title: string;
  company?: string;
  location?: string;
  remote?: boolean | null;
  employmentType?: string;
  salary?: string;
  url: string;
  /** Plain text. Use htmlToText() when the board sends HTML. */
  description?: string;
  /** ISO string, epoch ms or Date. */
  postedAt?: string | number | Date | null;
}

export interface SourceRequest {
  url: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
}

export interface ParseResult {
  postings: RawPosting[];
  /** True when another page should be fetched. */
  more?: boolean;
}

export interface SourceAdapter {
  /** Matches job_sources.adapter. Lowercase letters, digits and underscores. */
  id: string;
  /** Shown in the UI next to each job. */
  label: string;
  /** Server env vars the adapter needs (paid boards). Sources are skipped while any is missing. */
  requiredEnv?: readonly string[];
  /** Upper bound on pages per run, to keep one source from eating the worker's time. Default 1. */
  maxPages?: number;
  /** Builds the request for one page (0-based). Read keys only from `env`. */
  request(source: SourceConfig, page: number, env: Readonly<Record<string, string>>): SourceRequest;
  /** Pure: turns a parsed JSON body into postings. Must never throw on odd shapes; skip bad items. */
  parse(body: unknown, source: SourceConfig): ParseResult;
}

/** A posting ready to upsert. */
export interface Posting {
  externalId: string;
  title: string;
  company: string;
  location: string;
  remote: boolean | null;
  employmentType: string;
  salary: string;
  url: string;
  description: string;
  postedAt: string | null;
}
