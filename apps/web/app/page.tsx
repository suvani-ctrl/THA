import Link from 'next/link'
import type { BatchListResponse } from '@url-checker/shared'

async function getBatches(): Promise<BatchListResponse> {
  const apiUrl = process.env.API_URL ?? 'http://url_checker_api:4000'
  const res = await fetch(`${apiUrl}/batches`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to fetch batches')
  return res.json()
}

export default async function HomePage() {
  let batches: BatchListResponse['batches'] = []
  try {
    const data = await getBatches()
    batches = data.batches
  } catch {
    // API not reachable
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0 }}>URL Health Checker</h1>
        <Link href="/batches/new" style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
          New Batch
        </Link>
      </div>
      {batches.length === 0 ? (
        <p style={{ color: '#888' }}>No batches yet. Submit some URLs to get started.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>ID</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Total</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Done</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Failed</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '8px' }}>
                  <Link href={`/batches/${batch.id}`} style={{ color: '#60a5fa' }}>
                    {batch.id.slice(0, 8)}...
                  </Link>
                </td>
                <td style={{ padding: '8px', color: batch.status === 'completed' ? '#22c55e' : batch.status === 'running' ? '#f59e0b' : '#888' }}>
                  {batch.status}
                </td>
                <td style={{ padding: '8px' }}>{batch.total}</td>
                <td style={{ padding: '8px' }}>{batch.completed}</td>
                <td style={{ padding: '8px' }}>{batch.failed}</td>
                <td style={{ padding: '8px' }}>{new Date(batch.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
