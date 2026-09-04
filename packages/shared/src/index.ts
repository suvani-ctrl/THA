// ─── Enums ────────────────────────────────────────────────

export type BatchStatus = 'pending' | 'running' | 'completed' | 'cancelled'

export type UrlStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Batch {
  id: string
  status: BatchStatus
  total: number
  completed: number
  failed: number
  created_at: string
}

export interface UrlResult {
  id: string
  batch_id: string
  url: string
  status: UrlStatus
  http_code: number | null
  response_ms: number | null
  page_title: string | null
  error: string | null
  attempt: number
  created_at: string
  updated_at: string
}

//request
export interface SubmitBatchRequest {
  urls: string[]
}

//response
export interface BatchListResponse {
  batches: Batch[]
}

export interface BatchDetailResponse {
  batch: Batch
  results: UrlResult[]
}

export interface SubmitBatchResponse {
  batch_id: string
}

// ─── SSE Event Types ──────────────────────────────────────

export interface SSEUrlUpdate {
  type: 'url_update'
  batch_id: string
  url_result: UrlResult
}

export interface SSEBatchUpdate {
  type: 'batch_update'
  batch: Batch
}

export type SSEEvent = SSEUrlUpdate | SSEBatchUpdate

// ─── BullMQ Job Types ─────────────────────────────────────

export interface UrlCheckJob {
  url_result_id: string
  batch_id: string
  url: string
}
