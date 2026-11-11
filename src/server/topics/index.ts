// Topics engine (docs/specs/topics). Phase 0 = foundations only: per-org flag,
// system actor, run context. Signals, topics, cards and the deal bridge land
// here in phases 1–5.
//
// Rules for this folder:
//   - every function takes `organizationId` (or a TopicsContext) explicitly;
//   - no session reads here — session wrappers live in API routes only;
//   - automatic writes use `ctx.actorUserId` («Агент Truffalo»);
//   - LLM calls run inside `runInTopicsContext` so they are metered and capped.
export * from "./settings"
export * from "./actor"
export * from "./context"
