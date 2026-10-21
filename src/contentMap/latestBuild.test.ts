import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameBuild } from '../projects/gameTypes'
import { newestFirst, selectContentMapBuild } from './latestBuild'

function build(id: string, createdAt: string, isEditor = false): GameBuild {
  return { id, createdAt, isEditor, version: id, label: null } as unknown as GameBuild
}

// project 1 의 실제 모양: 9월의 출시 빌드 1.0 과 10월의 에디터 빌드 1.4.0.
const release = build('1', '2026-09-01T06:45:25Z')
const editor = build('8', '2026-10-20T05:41:55Z', true)

test('selectContentMapBuild: 주소에 빌드가 없으면 에디터를 포함해 가장 최근 빌드를 연다', () => {
  assert.equal(selectContentMapBuild([release, editor], null)?.id, '8')
  assert.equal(selectContentMapBuild([release, editor], '999')?.id, '8')
})

test('selectContentMapBuild: 주소가 아는 빌드면 그것을 연다', () => {
  assert.equal(selectContentMapBuild([release, editor], '1')?.id, '1')
})

test('selectContentMapBuild: 빌드가 없으면 undefined', () => {
  assert.equal(selectContentMapBuild([], null), undefined)
})

test('newestFirst: 빌드 고르기의 첫째(최신)가 기본으로 열리는 빌드와 같다', () => {
  const builds = [release, editor, build('3', '2026-10-01T00:00:00Z')]
  assert.equal(newestFirst(builds)[0]?.id, selectContentMapBuild(builds, null)?.id)
  assert.deepEqual(newestFirst(builds).map((b) => b.id), ['8', '3', '1'])
})
