import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  devIndicators: false,
  // Self-contained server bundle (`.next/standalone/server.js` + only the
  // node_modules it actually traces) — what the Docker runtime image ships.
  output: "standalone",
  // Node-only packages that must NOT be bundled — they pull in native/CJS
  // internals (e.g. imapflow uses BigInt + node streams) that break when
  // Turbopack inlines them into the server build ("s.BigInt is not a
  // function"). Keep them external so they're require()'d at runtime.
  serverExternalPackages: ["imapflow", "mailparser", "node-ical", "exceljs"],
  // node-ical require()s temporal-polyfill, which Node 22 resolves through
  // the "module-sync" export (index.js + chunks/); Next's file tracing only
  // copies the "require" entry (index.cjs), so the standalone image missed
  // it and every route that loads the parsers failed with "Failed to load
  // external module node-ical".
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/.pnpm/temporal-polyfill@*/node_modules/temporal-polyfill/**",
    ],
  },
  experimental: {
    authInterrupts: true,
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
