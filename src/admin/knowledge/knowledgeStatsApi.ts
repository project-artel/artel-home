import {
  apiFetch,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  readJson,
} from '../shared/adminApi'
import type {
  KnowledgeStats,
  KnowledgeStatsCell,
  KnowledgeStatsTotals,
} from './knowledgeStatsTypes'

export interface KnowledgeStatsQuery {
  /** null이면 볼 수 있는 전 프로젝트를 합산한다(ARTEL-750). */
  projectId: string | null
  from: Date
  to: Date
}

/**
 * 4축 조합 셀과 전체 합계를 한 번에 받는다.
 *
 * QA 집계와 같은 이유로 축을 서버에 되묻지 않는다 — 버전이 4-튜플로 분할되어 있어 어떤 분해든
 * 같은 셀 목록의 부분합이다.
 *
 * 기간의 기준은 **버전이 만들어진 시각**이지 런의 시작 시각이 아니다. 같은 런이 기간 경계를
 * 걸쳐 지식을 만들면 각 버전이 자기 시각의 구간에 들어간다.
 */
export async function fetchKnowledgeStats(
  { projectId, from, to }: KnowledgeStatsQuery,
  signal?: AbortSignal,
): Promise<KnowledgeStats> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  // 생략하면 전 프로젝트 합산이다. 빈 문자열은 프로젝트 id 로 읽혀 400 이 된다.
  if (projectId !== null) params.set('projectId', projectId)
  const response = await apiFetch(`/api/knowledge-stats?${params}`, { signal })
  const body = asRecord(await readJson(response))

  return {
    projectId: typeof body.projectId === 'string' ? body.projectId : null,
    from: asString(body.from, 'from'),
    to: asString(body.to, 'to'),
    total: parseTotals(asRecord(body.total)),
    cells: (Array.isArray(body.cells) ? body.cells : []).map((cell) =>
      parseCell(asRecord(cell)),
    ),
    truncated: body.truncated === true,
    cellLimit: asNumber(body.cellLimit, 0),
  }
}

/**
 * 전부 카운트라 0으로 떨어뜨려도 뜻이 뒤집히지 않는다. QA 집계의 `costUsd`처럼 "모른다"를 져야
 * 하는 값은 여기 없다 — 대신 그 역할을 `citationKnownTotal`이 진다. 0이면 "인용 여부를 알 수
 * 없었다"는 뜻이고, 그 판정은 비율을 내는 쪽(`pivot.ts`)이 한다.
 */
function parseTotals(raw: Record<string, unknown>): KnowledgeStatsTotals {
  return {
    entryVersions: asNumber(raw.entryVersions, 0),
    currentVersions: asNumber(raw.currentVersions, 0),
    deletedVersions: asNumber(raw.deletedVersions, 0),
    repudiatedVersions: asNumber(raw.repudiatedVersions, 0),
    retrievalTotal: asNumber(raw.retrievalTotal, 0),
    citationTotal: asNumber(raw.citationTotal, 0),
    citationKnownTotal: asNumber(raw.citationKnownTotal, 0),
  }
}

function parseCell(raw: Record<string, unknown>): KnowledgeStatsCell {
  return {
    model: asNullableString(raw.model),
    reasoningEffort: asNullableString(raw.reasoningEffort),
    promptVersion: asNullableString(raw.promptVersion),
    agentArch: asNullableString(raw.agentArch),
    ...parseTotals(raw),
  }
}
