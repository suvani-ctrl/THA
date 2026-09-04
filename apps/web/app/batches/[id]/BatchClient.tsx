'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSSE } from '../../hooks/useSSE'
import type { 
  Batch, 
  UrlResult, 
  SSEEvent,
} from '@url-checker/shared'

interface Props {
  initialBatch: Batch
  initialResults: UrlResult[]
}

export function BatchClient({ initialBatch, initialResults }: Props) {
  const router = useRouter()
  const [batch, setBatch] = useState<Batch>(initialBatch)
  const [results, setResults] = useState<UrlResult[]>(initialResults)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL 
    ?? 'http://localhost:4000'

  // Subscribe to SSE for live updates
  useSSE(batch.id, (event: SSEEvent) => {
    if (event.type === 'batch_update') {
      setBatch(event.batch)
    }
    if (event.type === 'url_update') {
      setResults(prev => {
        const idx = prev.findIndex(r => r.id === event.url_result.id)
        if (idx === -1) return [...prev, event.url_result]
        const next = [...prev]
        next[idx] = event.url_result
        return next
      })
    }
  })

  async function handleCancel() {
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${apiUrl}/batches/${batch.id}/cancel`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const data = await res.json()
        setError(data.error)
      }
    } catch {
      setError('Network error')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRetry() {
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${apiUrl}/batches/${batch.id}/retry`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const data = await res.json()
        setError(data.error)
      }
    } catch {
      setError('Network error')
    } finally {
      setActionLoading(false)
    }
  }

  // Progress percentage
  const progress = batch.total > 0
    ? Math.round(((batch.completed + batch.failed) / batch.total) * 100)
    : 0

  return (
    <div>
      {/* Batch Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0' }}>
          Batch {batch.id.slice(0, 8)}...
        </h2>

        {/* Status */}
        <div style={{ 
          display: 'flex', 
          gap: '16px',
          alignItems: 'center',
          marginBottom: '12px',
        }}>
          <span style={{ 
            color: statusColor(batch.status),
            fontWeight: 'bold',
          }}>
            {batch.status.toUpperCase()}
          </span>
          <span style={{ color: '#888' }}>
            {batch.completed}/{batch.total} done
          </span>
          {batch.failed > 0 && (
            <span style={{ color: '#ef4444' }}>
              {batch.failed} failed
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div style={{
          width: '100%',
          height: '8px',
          backgroundColor: '#333',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '16px',
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            backgroundColor: batch.failed > 0 ? '#f59e0b' : '#22c55e',
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {(batch.status === 'running' || batch.status === 'pending') && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              style={buttonStyle('#ef4444')}
            >
              Cancel
            </button>
          )}
          {(batch.status === 'completed' || batch.status === 'cancelled') 
            && batch.failed > 0 && (
            <button
              onClick={handleRetry}
              disabled={actionLoading}
              style={buttonStyle('#f59e0b')}
            >
              Retry Failed ({batch.failed})
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            style={buttonStyle('#444')}
          >
            Back
          </button>
        </div>

        {error && (
          <p style={{ color: '#ef4444', marginTop: '8px' }}>{error}</p>
        )}
      </div>

      {/* URL Results Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '8px' }}>URL</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>HTTP</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Time</th>
            <th style={{ textAlign: 'left', padding: '8px' }}>Title</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr 
              key={result.id}
              style={{ borderBottom: '1px solid #222' }}
            >
              <td style={{ 
                padding: '8px',
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                <a 
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#60a5fa' }}
                >
                  {result.url}
                </a>
              </td>
              <td style={{ padding: '8px' }}>
                <span style={{ color: urlStatusColor(result.status) }}>
                  {result.status}
                </span>
              </td>
              <td style={{ padding: '8px' }}>
                {result.http_code ?? '—'}
              </td>
              <td style={{ padding: '8px' }}>
                {result.response_ms ? `${result.response_ms}ms` : '—'}
              </td>
              <td style={{ 
                padding: '8px',
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#888',
              }}>
                {result.page_title ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    pending:   '#888',
    running:   '#f59e0b',
    completed: '#22c55e',
    cancelled: '#ef4444',
  }
  return colors[status] ?? '#888'
}

function urlStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending:   '#888',
    running:   '#f59e0b',
    completed: '#22c55e',
    failed:    '#ef4444',
    cancelled: '#6b7280',
  }
  return colors[status] ?? '#888'
}

function buttonStyle(bg: string) {
  return {
    padding: '8px 16px',
    backgroundColor: bg,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  }
}
