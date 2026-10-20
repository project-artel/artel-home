import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fallbackBuildSummaries,
  orderBuildSummaries,
  parseGameBuildSummaryList,
  type GameBuildSummary,
} from './gameBuildSummary'
import type { GameBuild, GameInstance } from './gameTypes'

const SUMMARY_ROW = {
  gameBuildId: '12',
  version: '1.4.0',
  label: 'Spring event',
  isEditor: false,
  createdAt: '2026-10-10T01:00:00Z',
  lastReportedAt: '2026-10-15T09:30:00Z',
  instanceCount: 3,
  connectedCount: 1,
  cheatCount: 5,
  behaviorCount: 2,
  catalogReceivedAt: '2026-10-15T09:31:00Z',
  qaRunCount: 4,
  latestQaRun: {
    qaRunId: '88',
    status: 'COMPLETED',
    startedAt: '2026-10-15T10:00:00Z',
    completedAt: '2026-10-15T10:20:00Z',
    stepsPassed: 21,
    stepsTotal: 24,
  },
}

function makeBuild(id: string, extra: Partial<GameBuild> = {}): GameBuild {
  return {
    id,
    projectId: '1',
    version: '1.4.0',
    label: null,
    notes: null,
    isEditor: false,
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    ...extra,
  }
}

function makeInstance(id: string, buildId: string | null, extra: Partial<GameInstance> = {}): GameInstance {
  return {
    id,
    projectId: '1',
    name: `PC ${id}`,
    platform: 'UNITY',
    connected: false,
    lastConnectedAt: '',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    lastGameBuild:
      buildId === null ? null : { gameBuildId: buildId, version: '1.4.0', label: null, isEditor: false },
    ...extra,
  }
}

describe('parseGameBuildSummaryList', () => {
  it('서버 응답 한 줄을 그대로 읽는다', () => {
    const [row] = parseGameBuildSummaryList({ items: [SUMMARY_ROW] })
    assert.deepEqual(row, { ...SUMMARY_ROW })
  })

  it('run 이 없는 빌드의 latestQaRun 은 null 이다', () => {
    const [row] = parseGameBuildSummaryList({ items: [{ ...SUMMARY_ROW, qaRunCount: 0, latestQaRun: null }] })
    assert.equal(row.qaRunCount, 0)
    assert.equal(row.latestQaRun, null)
  })

  it('끝난 try 가 없는 run 의 step 수는 null 로 읽는다', () => {
    const [row] = parseGameBuildSummaryList({
      items: [{ ...SUMMARY_ROW, latestQaRun: { ...SUMMARY_ROW.latestQaRun, status: 'RUNNING', stepsPassed: null, stepsTotal: null } }],
    })
    assert.equal(row.latestQaRun?.status, 'RUNNING')
    assert.equal(row.latestQaRun?.stepsPassed, null)
    assert.equal(row.latestQaRun?.stepsTotal, null)
  })

  it('모르는 run 상태는 줄을 버리지 않고 null 로 읽는다', () => {
    const [row] = parseGameBuildSummaryList({
      items: [{ ...SUMMARY_ROW, latestQaRun: { ...SUMMARY_ROW.latestQaRun, status: 'PAUSED' } }],
    })
    assert.equal(row.latestQaRun?.qaRunId, '88')
    assert.equal(row.latestQaRun?.status, null)
  })

  it('빠지거나 음수인 수는 0 이 아니라 null(모름)이다', () => {
    const [row] = parseGameBuildSummaryList({ items: [{ ...SUMMARY_ROW, cheatCount: undefined, qaRunCount: -1 }] })
    assert.equal(row.cheatCount, null)
    assert.equal(row.qaRunCount, null)
  })

  it('id 나 version 이 없는 줄과 봉투가 아닌 응답은 버린다', () => {
    assert.deepEqual(parseGameBuildSummaryList({ items: [{ version: '1.0.0' }, { gameBuildId: '3' }, null] }), [])
    assert.deepEqual(parseGameBuildSummaryList([SUMMARY_ROW]), [])
    assert.deepEqual(parseGameBuildSummaryList(null), [])
  })
})

describe('fallbackBuildSummaries', () => {
  it('instance 의 lastGameBuild 로 수와 마지막 보고를 세고, 서버만 아는 수는 null 로 둔다', () => {
    const builds = [makeBuild('12'), makeBuild('13', { version: '1.2.0' })]
    const instances = [
      makeInstance('1', '12', { connected: true, lastConnectedAt: '2026-10-15T09:30:00Z' }),
      makeInstance('2', '12', { lastConnectedAt: '2026-10-14T00:00:00Z' }),
      makeInstance('3', '12'),
      makeInstance('4', null, { connected: true, lastConnectedAt: '2026-10-16T00:00:00Z' }),
    ]

    const [first, second] = fallbackBuildSummaries(builds, instances)

    assert.equal(first.instanceCount, 3)
    assert.equal(first.connectedCount, 1)
    assert.equal(first.lastReportedAt, '2026-10-15T09:30:00Z')
    assert.equal(first.cheatCount, null)
    assert.equal(first.behaviorCount, null)
    assert.equal(first.qaRunCount, null)
    assert.equal(first.latestQaRun, null)

    assert.equal(second.instanceCount, 0)
    assert.equal(second.connectedCount, 0)
    assert.equal(second.lastReportedAt, null)
  })
})

describe('orderBuildSummaries', () => {
  it('editor 빌드만 뒤로 보내고 나머지 순서는 지킨다', () => {
    const rows = [
      { ...SUMMARY_ROW, gameBuildId: 'editor', isEditor: true },
      { ...SUMMARY_ROW, gameBuildId: 'b' },
      { ...SUMMARY_ROW, gameBuildId: 'a' },
    ] as GameBuildSummary[]
    assert.deepEqual(
      orderBuildSummaries(rows).map((row) => row.gameBuildId),
      ['b', 'a', 'editor'],
    )
  })
})
