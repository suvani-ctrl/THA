import { notFound } from 'next/navigation'
import { BatchClient } from './BatchClient'
import type { BatchDetailResponse } from '@url-checker/shared'

interface Props {
  params: Promise<{ id: string }>
}

async function getBatchDetail(
  id: string
): Promise<BatchDetailResponse | null> {
  const apiUrl = process.env.API_URL ?? 'http://url_checker_api:4000'
  try {
    const res = await fetch(`${apiUrl}/batches/${id}`, {
      cache: 'no-store'
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error('Failed')
    return res.json()
  } catch {
    return null
  }
}

export default async function BatchPage({ params }: Props) {
  const { id } = await params
  const data = await getBatchDetail(id)
  if (!data) notFound()
  return (
    <div>
      <h1 style={{ marginBottom: '24px' }}>Batch Detail</h1>
      <BatchClient
        initialBatch={data!.batch}
        initialResults={data!.results}
      />
    </div>
  )
}
