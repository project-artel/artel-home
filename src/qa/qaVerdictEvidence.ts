import { asRecord, asString } from '../projects/projectApi'

/**
 * 판정 하나의 근거(ARTEL-1135). agent 의 스텝 `STATUS` 가 싣는다(ARTEL-1133).
 *
 * - `message`: agent 가 쓴 판정 한 줄. 예전 판정도 이것은 있다.
 * - `reason`: 왜 그렇게 판정했는지(`report_step` 의 `thought`).
 * - `checks`: 기대 항목마다 무엇을 보았고, 그 근거가 판독 기록과 맞는지.
 * - `status`: 근거 전체의 상태. 근거를 기록과 대조할 수 있었던 판정만 `verified` 다.
 */
export type QaCheckMet = 'met' | 'unmet' | 'unknown'

/**
 * agent 가 댄 근거를 판독 기록과 대조한 결과.
 * `missing` 은 그 키나 캡처가 이번 실행의 기록에 없다는 뜻이고, `unchecked` 는 대조할 수 없는 근거(문장 관찰 등)다.
 */
export type QaCitation = 'match' | 'mismatch' | 'missing' | 'unchecked'

export type QaEvidenceSource = {
  kind: 'pulse' | 'capture' | 'scene' | 'other'
  /** 판독 키, 캡처 id, 씬 이름. */
  key: string | null
  /** agent 가 근거로 댄 값. */
  value: string | null
  /** 그 시점 판독 기록의 실제 값. 대조하지 못했으면 `null`. */
  recorded: string | null
  citation: QaCitation
}

export type QaVerdictCheck = {
  expected: string
  observed: string
  met: QaCheckMet
  sources: QaEvidenceSource[]
}

export type QaEvidenceStatus = 'verified' | 'uncertain' | 'none'

export type QaVerdictDetail = {
  message: string
  reason: string | null
  checks: QaVerdictCheck[]
  status: QaEvidenceStatus
}

const MET: Record<string, QaCheckMet> = { yes: 'met', no: 'unmet', unknown: 'unknown' }
const CITATIONS = new Set<QaCitation>(['match', 'mismatch', 'missing', 'unchecked'])
const KINDS = new Set<QaEvidenceSource['kind']>(['pulse', 'capture', 'scene'])

/** 값은 문자열이 아닐 수 있다(판독 값은 숫자 · 객체다). 보이는 대로 한 줄로. */
function shown(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function readSource(entry: unknown): QaEvidenceSource | null {
  const record = asRecord(entry)
  if (record === null) return null
  const kind = asString(record.kind)
  const citation = asString(record.citation) as QaCitation
  return {
    kind: KINDS.has(kind as QaEvidenceSource['kind']) ? (kind as QaEvidenceSource['kind']) : 'other',
    key: shown(record.key),
    value: shown(record.value),
    recorded: shown(record.recorded),
    citation: CITATIONS.has(citation) ? citation : 'unchecked',
  }
}

function readCheck(entry: unknown): QaVerdictCheck | null {
  const record = asRecord(entry)
  if (record === null) return null
  const expected = asString(record.expected)
  if (expected.length === 0) return null
  const sources = Array.isArray(record.sources) ? record.sources.map(readSource) : []
  return {
    expected,
    observed: asString(record.observed),
    met: MET[asString(record.met)] ?? 'unknown',
    sources: sources.filter((source): source is QaEvidenceSource => source !== null),
  }
}

/**
 * 스텝 `STATUS` payload 에서 근거를 읽는다. 근거 칸이 없는 예전 판정은 `message` 만 있는 `none` 이다.
 *
 * `evidence` 가 빠졌으면 대조 결과로 정한다: 하나라도 어긋나거나 기록에 없으면 `uncertain`.
 * 서버가 준 값이 있으면 그것을 믿는다 — 판정한 쪽이 더 많이 안다.
 */
export function readVerdictDetail(payload: Record<string, unknown>): QaVerdictDetail {
  const checks = Array.isArray(payload.checks)
    ? payload.checks.map(readCheck).filter((check): check is QaVerdictCheck => check !== null)
    : []
  const reason = asString(payload.reason)
  const given = asString(payload.evidence)
  const status: QaEvidenceStatus =
    given === 'verified' || given === 'uncertain' || given === 'none'
      ? given
      : checks.length === 0
        ? 'none'
        : checks.some((check) => check.sources.some((source) => source.citation === 'mismatch' || source.citation === 'missing'))
          ? 'uncertain'
          : 'verified'
  return { message: asString(payload.message), reason: reason.length > 0 ? reason : null, checks, status }
}
