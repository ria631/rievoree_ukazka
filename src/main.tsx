import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { MotionConfig } from "motion/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { router } from "./app/router"
import { AuthProvider } from "./lib/auth/AuthProvider"

// One retry, not three: a failing query should say so in seconds, not leave a
// page "loading" for half a minute. Data is fresh for a minute, so the guided
// tour (and anyone clicking between pages) doesn't refetch every report.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* reducedMotion="user" → every motion animation respects the OS setting. */}
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
)
