import { parse } from 'node-html-parser'
import { config } from '../config'

export interface CheckResult {
  statusCode: number
  responseMs: number
  pageTitle: string | null
}

export const UrlCheckerService = {

  async check(url: string): Promise<CheckResult> {
    const controller = new AbortController()

    const timeout = setTimeout(
      () => controller.abort(),
      config.worker.requestTimeoutMs
    )

    const start = Date.now()

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'URL-Health-Checker/1.0',
        },
      })

      const responseMs = Date.now() - start
      const statusCode = response.status

      let pageTitle: string | null = null

      if (statusCode >= 200 && statusCode < 300) {
        const contentType =
          response.headers.get('content-type') ?? ''
        if (contentType.includes('text/html')) {
          const html = await response.text()
          pageTitle = UrlCheckerService.extractTitle(html)
        }
      }

      return { statusCode, responseMs, pageTitle }

    } finally {
      clearTimeout(timeout)
    }
  },

  extractTitle(html: string): string | null {
    try {
      const root = parse(html)
      const title = root.querySelector('title')?.text?.trim()
      return title || null
    } catch {
      return null
    }
  },

} as const
