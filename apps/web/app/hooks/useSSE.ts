'use client'

import { useEffect, useRef } from 'react'
import type { SSEEvent } from '@url-checker/shared'

export function useSSE(
  batchId: string,
  onEvent: (event: SSEEvent) => void
) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL 
      ?? 'http://localhost:4000'

    let eventSource: EventSource
    let reconnectTimeout: NodeJS.Timeout

    function connect() {
      // EventSource: browser's built-in SSE client
      // Automatically reconnects on dropped connection
      // This satisfies: "client must recover from dropped connection"
      eventSource = new EventSource(
        `${apiUrl}/batches/${batchId}/stream`
      )

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as SSEEvent
          onEventRef.current(event)
        } catch {
          // Malformed event — ignore
        }
      }

      eventSource.onerror = () => {
        // Connection dropped
        // Close current EventSource
        eventSource.close()
        reconnectTimeout = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout)
      eventSource.close()
    }
  }, [batchId])
}
