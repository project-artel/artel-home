import type { PageCatalogEntry } from '../catalog'

export type PagePathResult = { ok: true; path: string } | { ok: false; error: string }

/**
 * catalog 의 `path` 에 params 를 채워 project 기준 상대 경로를 만든다.
 *
 * `qa-runs/:qaRunId` 처럼 경로에 있는 이름은 그 자리에 넣고, `params` 에만 있는 이름(`content-map`
 * 의 `build`)은 query string 으로 붙인다. catalog 에 없는 이름은 버린다. model 이 지어낸 query 가
 * 페이지 동작을 바꾸지 않게 하려는 것이다.
 */
export function resolvePagePath(entry: PageCatalogEntry, params: Record<string, unknown>): PagePathResult {
  const pathNames = new Set<string>()
  const segments: string[] = []
  for (const segment of entry.path.split('/').filter((one) => one.length > 0)) {
    if (!segment.startsWith(':')) {
      segments.push(segment)
      continue
    }
    const name = segment.slice(1)
    pathNames.add(name)
    const value = paramValue(params[name])
    if (value === null) return { ok: false, error: `missing param '${name}' for page '${entry.id}'` }
    segments.push(encodeURIComponent(value))
  }

  const query = new URLSearchParams()
  for (const name of entry.params) {
    if (pathNames.has(name)) continue
    const value = paramValue(params[name])
    if (value !== null) query.set(name, value)
  }
  const search = query.toString()
  return { ok: true, path: segments.join('/') + (search.length > 0 ? `?${search}` : '') }
}

/** 문자열과 숫자만 받는다. model 이 id 를 숫자로 보내는 일이 흔하다. */
function paramValue(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/** project 기준 상대 경로를 router 가 받는 절대 경로로 바꾼다. 빈 경로는 index 화면이다. */
export function projectRoute(projectId: string, relativePath: string): string {
  const base = `/projects/${encodeURIComponent(projectId)}`
  const trimmed = relativePath.replace(/^\/+/, '')
  if (trimmed.length === 0) return base
  return trimmed.startsWith('?') ? base + trimmed : `${base}/${trimmed}`
}
