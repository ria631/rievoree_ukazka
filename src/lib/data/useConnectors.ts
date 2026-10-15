import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth/useAuth"

/** gdrive is retired (old rows only); new connectors are url or webhook. */
export type ConnectorKind = "url" | "webhook" | "gdrive"
export type ConnectorStatus = "pending_auth" | "active" | "paused" | "error"

export interface Connector {
  id: string
  entity_id: string
  owner_id: string
  kind: ConnectorKind
  name: string
  status: ConnectorStatus
  config: Record<string, unknown>
  cursor: string | null
  last_sync_at: string | null
  last_error: string | null
  created_at: string
}

/** Connectors visible to the caller (RLS: managers/admins of the entity). */
export function useConnectors() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["connectors", user?.id ?? "anon"],
    enabled: Boolean(user),
    refetchInterval: 5000,
    queryFn: async (): Promise<Connector[]> => {
      const { data, error } = await supabase
        .from("connectors")
        .select("id,entity_id,owner_id,kind,name,status,config,cursor,last_sync_at,last_error,created_at")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as Connector[]
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ["connectors"] })
    qc.invalidateQueries({ queryKey: ["ingest_batches"] })
  }
}

export interface CreateConnectorResult {
  id: string
  kind: ConnectorKind
  status: ConnectorStatus
  webhook_secret: string | null
}

export function useCreateConnector() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { entityId: string; kind: ConnectorKind; name: string; config?: Record<string, unknown> }) => {
      const { data, error } = await supabase.rpc("create_connector", {
        p_entity_id: v.entityId, p_kind: v.kind, p_name: v.name, p_config: v.config ?? {},
      })
      if (error) throw new Error(error.message)
      return data as CreateConnectorResult
    },
    onSuccess: invalidate,
  })
}

export function useRenameConnector() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { id: string; name: string }) => {
      const { error } = await supabase.rpc("rename_connector", { p_id: v.id, p_name: v.name })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useSetConnectorStatus() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { id: string; status: "active" | "paused" }) => {
      const { error } = await supabase.rpc("set_connector_status", { p_id: v.id, p_status: v.status })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteConnector() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_connector", { p_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useRotateSecret() {
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { data, error } = await supabase.rpc("rotate_webhook_secret", { p_id: id })
      if (error) throw new Error(error.message)
      return (data as { webhook_secret: string }).webhook_secret
    },
  })
}

export interface SheetSyncRow {
  account_code: string | null
  txn_date: string | null
  description: string | null
  debit: string | null
  credit: string | null
  currency: string | null
}

/** What one link sync came back with. preview = the shared demo (fetched and
 *  parsed for real, nothing written); created = a new batch is awaiting review;
 *  unchanged = same content as the last file taken in. */
export interface SheetSyncResult {
  status: "preview" | "created" | "duplicate" | "unchanged" | "error"
  message?: string
  rows?: number
  period?: string | null
  debit?: number
  credit?: number
  missing_dates?: number
  unknown_accounts?: string[]
  sample?: SheetSyncRow[]
  batch_id?: string
}

/** "Sync now" for a spreadsheet link: the database fetches the link (pg_net)
 *  and the answer is picked up by polling — CSV parsed in SQL, then the same
 *  ingest path as an upload. */
export function useSheetSync() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string): Promise<SheetSyncResult> => {
      const { data, error } = await supabase.rpc("sync_url_connector", { p_id: id })
      if (error) throw new Error(error.message)
      const requestId = (data as { request_id: number }).request_id
      const deadline = Date.now() + 75_000
      for (let wait = 700; Date.now() < deadline; wait = Math.min(wait + 300, 2000)) {
        await new Promise((r) => setTimeout(r, wait))
        const res = await supabase.rpc("collect_url_sync", { p_request_id: requestId })
        if (res.error) throw new Error(res.error.message)
        const out = res.data as SheetSyncResult | { status: "pending" | "gone" }
        if (out.status === "pending") continue
        if (out.status === "gone") return { status: "unchanged", message: "picked up by the scheduled sync" }
        return out as SheetSyncResult
      }
      throw new Error("no answer from the link within 75 s")
    },
    onSuccess: invalidate,
  })
}

/** The sample sheet this app serves (public/samples) — on the production host,
 *  because the database fetches it and preview hosts sit behind a login. */
export const SAMPLE_SHEET_URL = "https://rievoree-ukazka.vercel.app/samples/facility-costs-sheet.csv"

/** The public webhook endpoint for a connector (what the third party POSTs to). */
export function webhookUrl(connectorId: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")
  return `${base}/functions/v1/connector-webhook?id=${connectorId}`
}
