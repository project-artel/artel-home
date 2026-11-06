/**
 * Free 실행에 넣을 TC 고르기(ARTEL-1164). 대시보드의 판정 전 TC 를 이전 빌드 결과 · 화면 · 찾기로 좁힌다.
 * 화면 없이 테스트하려고 dialog 에서 떼어 둔 순수 함수다.
 */
import type { TestCase, VerificationStatus } from '../../../testCases/testCaseTypes'
import type { VersionCaseRow } from '../../../testCases/testCaseVersions'
import type { RemainingSplit } from './dashboardModel'

export type PickGroup = keyof RemainingSplit

export const PICK_GROUPS: readonly PickGroup[] = ['wasFailing', 'wasPassing', 'firstTime']

export type PickItem = { testCase: TestCase; group: PickGroup; before: VerificationStatus | null }

/** `전체` · `고른 것` 또는 이전 빌드 결과 하나. */
export type PickGroupFilter = PickGroup | 'all' | 'picked'

export type PickFilter = { group: PickGroupFilter; scene: string | null; query: string }

/** 판정 전 TC 를 [remaining] 의 묶음 순서(고쳐졌는지 → 회귀 → 처음)로, 묶음 안은 [rows] 순서로 늘어놓는다. */
export function pickItems(rows: readonly VersionCaseRow[], remaining: RemainingSplit): PickItem[] {
  const groupOf = new Map<string, PickGroup>()
  for (const group of PICK_GROUPS) for (const caseId of remaining[group]) groupOf.set(caseId, group)
  const items = rows.flatMap((row): PickItem[] => {
    const group = groupOf.get(row.testCase.id)
    return group ? [{ testCase: row.testCase, group, before: row.presence === 'BOTH' ? row.compareVerificationStatus : null }] : []
  })
  return PICK_GROUPS.flatMap((group) => items.filter((item) => item.group === group))
}

/** 처음 열 때 고른 것: 먼저 볼 것(이전에 판정이 있던 TC). 없으면 아무것도 고르지 않는다 — 전부 넣기는 한 번 더 누르게 한다. */
export function defaultPicked(remaining: RemainingSplit): Set<string> {
  return new Set([...remaining.wasFailing, ...remaining.wasPassing])
}

function matchesGroup(item: PickItem, group: PickGroupFilter, picked: ReadonlySet<string>): boolean {
  if (group === 'all') return true
  if (group === 'picked') return picked.has(item.testCase.id)
  return item.group === group
}

function matchesQuery(item: PickItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const { testCase } = item
  const text = [testCase.step, testCase.expectedValue, testCase.precondition ?? '', testCase.scene, testCase.id].join('\n').toLowerCase()
  return words.every((word) => text.includes(word))
}

export function filterPickItems(items: readonly PickItem[], filter: PickFilter, picked: ReadonlySet<string>): PickItem[] {
  return items.filter(
    (item) =>
      matchesGroup(item, filter.group, picked) &&
      (filter.scene === null || item.testCase.scene.trim() === filter.scene) &&
      matchesQuery(item, filter.query),
  )
}

/** [group] · 찾기로 좁힌 것의 화면별 수. 많은 화면이 위, 같으면 이름 순. 화면 이름이 빈 TC 는 `''` 로 센다. */
export function countScenes(
  items: readonly PickItem[],
  filter: Omit<PickFilter, 'scene'>,
  picked: ReadonlySet<string>,
): { scene: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of filterPickItems(items, { ...filter, scene: null }, picked)) {
    const scene = item.testCase.scene.trim()
    counts.set(scene, (counts.get(scene) ?? 0) + 1)
  }
  return [...counts].map(([scene, count]) => ({ scene, count })).sort((a, b) => b.count - a.count || a.scene.localeCompare(b.scene))
}
