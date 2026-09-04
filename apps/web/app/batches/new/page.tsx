'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SubmitBatchRequest } from '@url-checker/shared'

export default function NewBatchPage() {
  const router = useRouter()
  const [urls, setUrls] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'text' | 'csv'>('text')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

  async function handleSubmit() {
    setError(null)
    setLoading(true)

    try {
      let batchId: string

      if (mode === 'csv') {
        // CSV upload path
        if (!file) {
          setError('Please select a CSV file')
          setLoading(false)
          return
        }

        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch(`${apiUrl}/batches/upload`, {
          method: 'POST',
          body: formData,
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error ?? 'Failed to upload CSV')
          return
        }

        batchId = data.batch_id

      } else {
        // Text paste path
        const urlList = urls
          .split('\n')
          .map(u => u.trim())
          .filter(u => u.length > 0)

        if (urlList.length === 0) {
          setError('Please enter at least one URL')
          setLoading(false)
          return
        }

        const body: SubmitBatchRequest = { urls: urlList }

        const res = await fetch(`${apiUrl}/batches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error ?? 'Failed to submit batch')
          return
        }

        batchId = data.batch_id
      }

      router.push(`/batches/${batchId}`)

    } catch (err) {
      setError(`Network error: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1>New Batch</h1>

      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setMode('text')}
          style={{
            padding: '8px 16px',
            backgroundColor: mode === 'text' ? '#2563eb' : '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Paste URLs
        </button>
        <button
          onClick={() => setMode('csv')}
          style={{
            padding: '8px 16px',
            backgroundColor: mode === 'csv' ? '#2563eb' : '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Upload CSV
        </button>
      </div>

      {mode === 'text' ? (
        <>
          <p style={{ color: '#888' }}>
            Enter one URL per line. Maximum 500 URLs.
          </p>
          <textarea
            value={urls}
            onChange={e => setUrls(e.target.value)}
            placeholder={
              'https://google.com\nhttps://github.com\nhttps://example.com'
            }
            style={{
              width: '100%',
              height: '200px',
              backgroundColor: '#222',
              color: '#eee',
              border: '1px solid #444',
              padding: '12px',
              fontFamily: 'monospace',
              fontSize: '14px',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </>
      ) : (
        <>
          <p style={{ color: '#888' }}>
            Upload a CSV file with one URL per line. Maximum 500 URLs, 1MB.
          </p>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={{
              display: 'block',
              marginBottom: '12px',
              color: '#eee',
            }}
          />
          {file && (
            <p style={{ color: '#888', fontSize: '14px' }}>
              Selected: {file.name} ({Math.round(file.size / 1024)}KB)
            </p>
          )}
        </>
      )}

      {error && (
        <p style={{ color: '#ef4444', marginTop: '8px' }}>{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          marginTop: '12px',
          padding: '10px 24px',
          backgroundColor: loading ? '#444' : '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '16px',
        }}
      >
        {loading ? 'Submitting...' : 'Submit'}
      </button>
    </div>
  )
}
