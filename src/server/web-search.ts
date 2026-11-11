// Not "use server" — exports a plain type alongside the async fn.
// `server-only` keeps the module out of the client bundle.
import "server-only"

import { researchYandex } from "@/server/ai/search"
import { withAiUsageContext } from "@/server/ai"

// ── Web search as an explicit tool, not a passthrough ────────────────
//
// The chat model never "searches" by itself. A web question goes through ONE
// dedicated sub-call: the Yandex Search API returns snippets, and a Yandex
// model writes findings from those snippets only (src/server/ai/search.ts).
// The caller gets real source URLs back, so answers can cite them, and
// `grounded` says whether search results actually backed the findings.
// Without the Search API service, web search is unavailable (no fallback).

export type WebSearchSource = { url: string; title: string }

export type WebSearchResult = {
  query: string
  findings: string
  sources: WebSearchSource[]
  grounded: boolean
}

/**
 * Run ONE grounded web search and return what it found.
 *
 * Never throws — a failed search returns `grounded: false` with the error in
 * `findings`, so a web hiccup degrades the chat answer instead of killing the
 * whole stream. `grounded` tells the caller whether real search results
 * actually backed the findings; the chat prompt requires the model to say so
 * when they didn't.
 */
export async function searchWeb(query: string, organizationId?: string | null): Promise<WebSearchResult> {
  // Tools run while the chat stream is consumed: pass the org explicitly so
  // the LLM calls are metered against it (src/server/ai/usage.ts).
  return withAiUsageContext({ organizationId: organizationId ?? null }, () => runWebSearch(query))
}

async function runWebSearch(query: string): Promise<WebSearchResult> {
  const q = query.trim()
  if (!q) {
    return { query, findings: "Empty query.", sources: [], grounded: false }
  }

  try {
    const research = await researchYandex(q, "webSearch")
    return { query: q, findings: research.text, sources: research.sources, grounded: research.grounded }
  } catch (error) {
    console.error("[web-search] failed:", error)
    return {
      query: q,
      findings: `Web search failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      sources: [],
      grounded: false,
    }
  }
}
