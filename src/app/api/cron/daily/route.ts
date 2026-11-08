import { NextRequest, NextResponse } from "next/server"
import { runDailyPipeline } from "@/server/orchestration/daily-pipeline"

// Cron-triggered entrypoint. A Kubernetes CronJob (deploy/k8s/app/cronjob.yaml,
// `0 3 * * *` — keep in sync with ORCHESTRATION_CONFIG.cron) curls this
// route over the in-cluster Service with `Authorization: Bearer
// $CRON_SECRET`; rejecting anything else keeps the route safe even though
// it is also reachable through the public ingress.
//
// In development we skip the auth check so a local curl can hit it
// without setting up the header.
//
// The pipeline runs synchronously inside the request and the response
// carries its result, so the CronJob's exit status reflects success or
// failure. The call goes through the cluster-internal Service (no ingress),
// so no proxy timeout applies; curl's own `--max-time` bounds it.
// Overlapping runs are prevented by the CronJob's `concurrencyPolicy:
// Forbid`. The orchestration itself stays engine-agnostic — this route is
// the only scheduler-specific glue.
export const maxDuration = 3600

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const auth = request.headers.get("authorization")
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 })
    }
  }

  try {
    const result = await runDailyPipeline({ trigger: "cron" })
    return NextResponse.json(result, {
      status: result.status === "success" ? 200 : 500,
    })
  } catch (error) {
    console.error("[cron/daily] Pipeline run failed:", error)
    const message =
      error instanceof Error ? error.message : "Pipeline run failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
