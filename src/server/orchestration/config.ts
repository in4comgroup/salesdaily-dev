// Pipeline tuning constants. **Hardcoded for MVP.**
//
// Kept dependency-free (no `server-only`, no DB imports).
//
// PHASE2.md "Pipeline tuning" tracks moving these to a system_settings
// dictionary or env vars once an admin needs to tune without a deploy.

export const ORCHESTRATION_CONFIG = {
  // Cron schedule expression (UTC). Daily at 03:00 UTC.
  //
  // **Duplicated in deploy/k8s/app/cronjob.yaml** (the scheduler
  // lives in Kubernetes, not in the app). Keep both in sync until
  // PHASE2 #12 moves them to a system_settings dictionary.
  cron: "0 3 * * *",

  // Per-run caps. Items past the cap stay 'pending' / 'needs upload'
  // and get picked up on the next run. Sized for MVP traffic.
  maxParsePerRun: 200,
  maxUploadPerRun: 500,

  // Cap on how many failure entries are kept inside pipeline_run.errors_json.
  // A catastrophically bad run shouldn't bloat the column — once we exceed
  // this, the per-row counters still tick up but individual messages are
  // dropped (a single "+N more truncated" entry is appended).
  maxErrorsPerRun: 200,
} as const

export type OrchestrationConfig = typeof ORCHESTRATION_CONFIG
