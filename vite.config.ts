import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Module workers, so the code highlighter (src/lib/highlight.worker.ts) can
  // lazy-load its grammars off the main thread.
  worker: { format: "es" },
  // The chunks over Vite's 500 kB default are single libraries, each loaded
  // only where it's needed: three.js (landing, after first paint), recharts +
  // d3 (report routes), Shiki's regex engine (the code view). The entry chunk
  // stays under the limit; anything new and bigger than these still warns.
  build: { chunkSizeWarningLimit: 650 },
  // Unit tests for the reporting maths (src/lib/**/*.test.ts) — plain Node, no DOM.
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
