import axios from 'axios'
import axiosRetry from 'axios-retry'

export function makeClient(baseURL: string, headers: Record<string, string> = {}) {
  const client = axios.create({
    baseURL,
    timeout: 15_000,
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en-AU,en;q=0.9',
      ...headers,
    },
  })

  axiosRetry(client, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (err) =>
      axiosRetry.isNetworkError(err) ||
      (err.response?.status !== undefined && err.response.status >= 500),
  })

  return client
}

export const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]

export function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]!
}

/** Random delay between min and max ms */
export function jitter(minMs = 100, maxMs = 500): Promise<void> {
  return new Promise((r) => setTimeout(r, minMs + Math.random() * (maxMs - minMs)))
}
