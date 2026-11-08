import { getAiCatalog } from "@/server/ai/catalog"

export const dynamic = "force-dynamic"

// Deployment-wide public model labels/capabilities only. No addresses, model
// URIs, credential names or secrets. Chat itself already permits public use.
export function GET() {
  try {
    return Response.json(getAiCatalog(), { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "AI configuration is unavailable" }, { status: 503 })
  }
}
