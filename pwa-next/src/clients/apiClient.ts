// Client 層：只管網路細節（fetch、timeout、401 處理、認證 header 注入），
// 不知道「書」「進度」這些是什麼，Service 層才負責資料模型跟業務語意。
export class ApiError extends Error {
  status: number | 'network' | 'timeout'

  constructor(status: number | 'network' | 'timeout', message: string) {
    super(message)
    this.status = status
  }
}

interface ApiClientConfig {
  baseUrl: string
  getAuthHeader?: () => Promise<HeadersInit | undefined>
  onUnauthorized?: () => void
  timeoutMs?: number
}

export const createApiClient = (config: ApiClientConfig) => {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 10000)
    try {
      const authHeader = await config.getAuthHeader?.()
      const res = await fetch(config.baseUrl + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeader },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      if (res.status === 401) {
        config.onUnauthorized?.()
        throw new ApiError(401, 'unauthorized')
      }
      if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText))
      if (res.status === 204) return undefined as T
      return (await res.json()) as T
    } catch (e) {
      if (e instanceof ApiError) throw e
      throw new ApiError(controller.signal.aborted ? 'timeout' : 'network', String(e))
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  }
}

// pwa-next 走 same-origin，Clerk session 靠瀏覽器自動帶的 cookie，不需要 getAuthHeader。
export const apiClient = createApiClient({ baseUrl: '' })
