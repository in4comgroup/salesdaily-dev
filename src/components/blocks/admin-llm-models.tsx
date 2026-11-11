"use client"

// Settings → «Модели» (platform admin only): Yandex price sync + model links,
// per-org daily cap + Topics mode, model prices and markup.
// Usage statistics live in their own tab «Использование»
// (admin-llm-models/usage-stats.tsx).
// Backend: /api/admin/llm/* → src/server/admin-llm.ts.

import { Separator } from "@/components/ui/separator"
import { OrgLimits } from "./admin-llm-models/org-limits"
import { ModelPrices } from "./admin-llm-models/model-prices"
import { PriceSync } from "./admin-llm-models/price-sync"

export function AdminLlmModels() {
  return (
    <div className="flex flex-col gap-8">
      <PriceSync />
      <Separator />
      <ModelPrices />
      <Separator />
      <OrgLimits />
    </div>
  )
}
