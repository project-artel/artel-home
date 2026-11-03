import type { TestCase } from './testCaseTypes'

/**
 * 스텝 글 속 씬 이름을 찾는 식(ARTEL-1313). 시나리오 편집기와 케이스 라이브러리가 같은 식으로 씬을 세운다.
 *
 * 이름은 TC 의 화면과 도착 화면에서 모은다 — MCP · QA · 사람이 정한 씬이 다 여기 있다. 긴 이름부터 맞춰
 * `Map_scene` 이 `Map` 에 먹히지 않게 하고, 앞뒤가 영숫자이면 이름의 일부로 보고 건너뛴다.
 *
 * 짧은 이름은 흔한 낱말과 겹쳐 뺀다. 다만 기준이 글자마다 다르다. 영어는 세 글자보다 짧으면(`UI`, `Map` 의 일부)
 * 빼지만, 한글은 두 글자부터 씬 이름이다(광장 · 상점 · 여관). 앞서 한글도 세 글자로 잘라 한국어 씬 대부분이
 * 강조되지 않았다.
 */
export function scenePattern(names: Iterable<string>): RegExp | null {
  const kept = [...new Set([...names].map((name) => name.trim()).filter(isSceneName))]
  if (kept.length === 0) return null
  kept.sort((left, right) => right.length - left.length)
  const escaped = kept.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(?<![A-Za-z0-9_])(${escaped.join('|')})(?![A-Za-z0-9_])`)
}

/** TC 들의 화면 · 도착 화면 이름. */
export function sceneNamesOf(cases: Iterable<TestCase>): string[] {
  const names: string[] = []
  for (const testCase of cases) {
    if (typeof testCase.scene === 'string') names.push(testCase.scene)
    if (typeof testCase.arrivesAt === 'string') names.push(testCase.arrivesAt)
  }
  return names
}

const HANGUL = /[가-힣]/

function isSceneName(name: string): boolean {
  return name.length >= 3 || (name.length >= 2 && HANGUL.test(name))
}

/** 글을 씬 이름과 나머지로 가른다. 홀수 번째 조각이 씬 이름이다. */
export function splitScenes(text: string, pattern: RegExp | null): string[] {
  return pattern === null ? [text] : text.split(pattern)
}
