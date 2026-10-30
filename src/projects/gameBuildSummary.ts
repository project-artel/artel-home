import { asNullableString, asRecord, asString, isOneOf } from './projectApi'
import { QA_TRY_STATUSES, type QaTryStatus } from '../qa/qaTypes'
import type { GameBuild, GameInstance } from './gameTypes'
import { parseBuildEnvironment } from './buildEnvironment'

/**
 * 게임 빌드 섹션(ARTEL-1105)이 한 줄에 그리는 빌드 요약. 서버의 `GET .../game-builds/summary`(ARTEL-1104) 응답이다.
 *
 * 수 칸이 `null` 이면 "모른다" 이고 화면은 `—` 를 그린다. 0 과 다르다 — `/summary` 가 없는 옛 서버에서는
 * cheat · behavior · QA run 수를 알 길이 없고, 0 을 그리면 "없다" 로 읽힌다.
 */
export type GameBuildSummary = {
  gameBuildId: string
  version: string
  label: string | null
  /** 서버가 값을 보내지 않으면 null 이고, 화면은 Unknown 을 그린다. */
  isEditor: boolean | null
  createdAt: string
  /** 이 빌드로 마지막 보고한 instance 들의 `lastConnectedAt` 중 가장 늦은 것. instance 가 없으면 null. */
  lastReportedAt: string | null
  instanceCount: number | null
  connectedCount: number | null
  cheatCount: number | null
  behaviorCount: number | null
  catalogReceivedAt: string | null
  qaRunCount: number | null
  latestQaRun: LatestQaRunSummary | null
}

export type LatestQaRunSummary = {
  qaRunId: string
  /** 이 client 가 모르는 상태면 null 이고, 화면은 pill 대신 `—` 를 그린다. */
  status: QaTryStatus | null
  startedAt: string | null
  completedAt: string | null
  /** 끝난 try 가 하나도 없으면 null. */
  stepsPassed: number | null
  stepsTotal: number | null
}

function asCountOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
}

function parseLatestQaRun(data: unknown): LatestQaRunSummary | null {
  const record = asRecord(data)
  const qaRunId = record === null ? null : asNullableString(record.qaRunId)
  if (record === null || qaRunId === null || qaRunId.length === 0) return null

  return {
    qaRunId,
    status: isOneOf(record.status, QA_TRY_STATUSES) ? record.status : null,
    startedAt: asNullableString(record.startedAt),
    completedAt: asNullableString(record.completedAt),
    stepsPassed: asCountOrNull(record.stepsPassed),
    stepsTotal: asCountOrNull(record.stepsTotal),
  }
}

/**
 * 한 줄을 읽는다. `gameBuildId` 와 `version` 만 필수다 — 빌드를 가리키고 사람이 알아보는 값이 그 둘이다.
 * 나머지는 빠지면 `null`(모름)이 되어 `—` 로 그려진다.
 */
export function parseGameBuildSummary(data: unknown): GameBuildSummary | null {
  const record = asRecord(data)
  if (record === null) return null

  const gameBuildId = asNullableString(record.gameBuildId)
  const version = asNullableString(record.version)
  if (gameBuildId === null || gameBuildId.length === 0 || version === null) return null

  return {
    gameBuildId,
    version,
    label: asNullableString(record.label),
    isEditor: parseBuildEnvironment(record.isEditor),
    createdAt: asString(record.createdAt),
    lastReportedAt: asNullableString(record.lastReportedAt),
    instanceCount: asCountOrNull(record.instanceCount),
    connectedCount: asCountOrNull(record.connectedCount),
    cheatCount: asCountOrNull(record.cheatCount),
    behaviorCount: asCountOrNull(record.behaviorCount),
    catalogReceivedAt: asNullableString(record.catalogReceivedAt),
    qaRunCount: asCountOrNull(record.qaRunCount),
    latestQaRun: parseLatestQaRun(record.latestQaRun),
  }
}

/** `{ items: [...] }`. 읽을 수 없는 줄은 버리고 나머지를 그린다. */
export function parseGameBuildSummaryList(data: unknown): GameBuildSummary[] {
  const items = asRecord(data)?.items
  if (!Array.isArray(items)) return []
  return items
    .map(parseGameBuildSummary)
    .filter((summary): summary is GameBuildSummary => summary !== null)
}

/**
 * `/summary` 가 없는 옛 서버용 요약. workspace 가 이미 들고 있는 빌드와 instance 로 만든다.
 *
 * instance 수와 마지막 보고는 서버와 같은 정의로 계산한다 — `lastGameBuild` 가 이 빌드인 instance 를 세고,
 * 그 instance 들의 `lastConnectedAt` 중 가장 늦은 것을 고른다. cheat · behavior · QA run 수는 여기서 알 수
 * 없으므로 `null` 이다.
 */
export function fallbackBuildSummaries(builds: GameBuild[], instances: GameInstance[]): GameBuildSummary[] {
  return builds.map((build) => {
    const reporting = instances.filter((instance) => instance.lastGameBuild?.gameBuildId === build.id)
    let lastReportedAt: string | null = null
    for (const instance of reporting) {
      if (instance.lastConnectedAt.length === 0) continue
      if (lastReportedAt === null || instance.lastConnectedAt > lastReportedAt) {
        lastReportedAt = instance.lastConnectedAt
      }
    }

    return {
      gameBuildId: build.id,
      version: build.version,
      label: build.label,
      isEditor: build.isEditor,
      createdAt: build.createdAt,
      lastReportedAt,
      instanceCount: reporting.length,
      connectedCount: reporting.filter((instance) => instance.connected).length,
      cheatCount: null,
      behaviorCount: null,
      catalogReceivedAt: null,
      qaRunCount: null,
      latestQaRun: null,
    }
  })
}

/**
 * 표의 순서. 서버 순서를 지키되 editor 빌드는 맨 뒤로 보낸다 — editor 빌드는 게임 버전이 아니라서 버전들
 * 사이에 끼면 "가장 최근 버전" 을 찾는 눈이 걸린다. 정렬이 안정적이라 나머지 순서는 그대로다.
 */
export function orderBuildSummaries(summaries: GameBuildSummary[]): GameBuildSummary[] {
  return [...summaries].sort((left, right) => Number(left.isEditor) - Number(right.isEditor))
}
