import "server-only"

import { createGateway } from "ai"
import { AiConfigurationError, type AiConnection, type AiEnvironment } from "../config"

export function createVercelGatewayAdapter(
  connection: Extract<AiConnection, { adapter: "vercel-gateway" }>,
  env: AiEnvironment,
  fetchImplementation?: typeof fetch,
) {
  const apiKey = env[connection.credentialsEnv]?.trim()
  if (!apiKey) {
    throw new AiConfigurationError(`Missing AI credential environment variable: ${connection.credentialsEnv}`)
  }
  // Explicit key prevents SDK environment/OIDC fallback. Fixed URL prevents
  // accidentally sending this credential to a different host via config.
  return createGateway({
    baseURL: connection.baseUrl,
    apiKey,
    ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
  })
}
