import { NextResponse } from "next/server"

// Liveness/readiness probe for Kubernetes. Public and intentionally
// DB-free: a transient database blip must not make the kubelet restart
// an otherwise healthy pod (that would turn a short DB hiccup into a
// full outage). It only proves the Node server is up and routing.
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ ok: true })
}
