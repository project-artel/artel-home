import { projectPathSegments } from '../../projects/workspace/sections'
import { PAGE_CATALOG, type PageCatalogEntry } from '../catalog'
import type { PageId } from './types'

export type DerivedPage = { page: PageId | null; params: Record<string, string> }

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** catalog 의 path 한 줄(`test-runs/:runId/edit`)이 segment 들과 맞으면 path param 을 돌려준다. */
function matchPattern(pattern: string, segments: string[]): Record<string, string> | null {
  const patternSegments = pattern.split('/').filter(Boolean)
  if (patternSegments.length !== segments.length) return null
  const params: Record<string, string> = {}
  for (let index = 0; index < patternSegments.length; index += 1) {
    const expected = patternSegments[index]
    if (expected.startsWith(':')) params[expected.slice(1)] = safeDecode(segments[index])
    else if (expected !== segments[index]) return null
  }
  return params
}

/**
 * URL 에서 지금 열린 페이지를 읽는다. 페이지가 스스로 알리지 않는 이유는, 알리는 코드가
 * 페이지마다 하나씩 빠질 수 있고 URL 은 늘 맞기 때문이다. 경로는 catalog 의 `path` 를 따르고,
 * path param 과 query param 이 `params` 에 함께 담긴다. 다른 project 의 경로이거나 catalog 에 없는
 * 경로(`members`, `settings` 등)면 `page` 는 null 이다.
 */
export function derivePage(
  projectId: string,
  pathname: string,
  search = '',
  entries: PageCatalogEntry[] = PAGE_CATALOG,
): DerivedPage {
  const segments = projectPathSegments(projectId, pathname)
  if (segments === null) return { page: null, params: {} }
  for (const entry of entries) {
    const pathParams = matchPattern(entry.path, segments)
    if (pathParams === null) continue
    const params: Record<string, string> = {}
    new URLSearchParams(search).forEach((value, key) => {
      params[key] = value
    })
    return { page: entry.id, params: { ...params, ...pathParams } }
  }
  return { page: null, params: {} }
}
