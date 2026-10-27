import { apiFetch } from '../../auth/authApi'
import { asRecord, jsonRequest, readJson } from '../../projects/projectApi'

export type Verdict = 'PASSED' | 'FAILED' | 'INCONCLUSIVE' | 'INTERRUPTED'
export type CaseSnapshot = { scene: string | null; precondition: string | null; step: string | null; expected: string | null }
export type Attempt = { id: string; qaTryId: string; qaRunId?: string | null; testCaseId: string; startedAt: string | null; finishedAt: string | null;
  verdict: Verdict | null; logId: string | null; review: Verdict | null; note: string | null; createdAt: string;
  caseSnapshot?: CaseSnapshot | null; originalReason?: string | null }
export type Revision = { id: string; decision: string; note: string | null; decidedBy: string | null; decidedAt: string }
export type Segment = { id: string; startedAt: string; endedAt: string; state: string; url: string | null }
export type Gap = { startedAt: string; endedAt: string; reason: string }
export type Playback = { recording: { id: string; startedAt: string; endedAt: string | null; expiresAt: string | null; error: string | null } | null;
  segments: Segment[]; gaps: Gap[] }
export type Question = { id: string; qaTryId: string; qaRunId: string | null; question: string; state: string; answer: string | null; createdAt: string }
export type Counts = { total: number; reviewed: number; inconclusiveReviews: number; truePositives: number; trueNegatives: number;
  falsePositives: number; falseNegatives: number; interruptedFalseNegatives: number; falsePositiveRate: number | null;
  falseNegativeRate: number | null; reviewCoverage: number | null }
export type Reliability = { overall: Counts; daily: { key: string; counts: Counts }[]; cases: { key: string; counts: Counts }[] }
export type CaseIssueHistory = { testCaseId: string | null; previousIssueId: string | null; mergedInto: string | null; autoClosed: boolean;
  occurrences: { attemptId: string; qaTryId: string; qaRunId: string | null; logId: string | null; verdict: Verdict | null; review: Verdict | null; falsePositive: boolean; validFailure: boolean; finishedAt: string | null }[] }

function record(value: unknown) { const result = asRecord(value); if (!result) throw new Error('Invalid evaluation response'); return result }
function string(value: unknown): string { if (typeof value !== 'string') throw new Error('Invalid evaluation field'); return value }
function nullable(value: unknown) { return value == null ? null : string(value) }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid count'); return value }
function list<T>(value: unknown, parse: (item: unknown) => T): T[] { if (!Array.isArray(value)) throw new Error('Invalid evaluation list'); return value.map(parse) }
function verdict(value: unknown): Verdict | null {
  if (value == null) return null
  if (value === 'PASSED' || value === 'FAILED' || value === 'INCONCLUSIVE' || value === 'INTERRUPTED') return value
  throw new Error('Invalid verdict')
}
function attempt(value: unknown): Attempt {
  const row = record(value)
  const snapshot = asRecord(row.caseSnapshot)
  const text = (value: unknown) => typeof value === 'string' ? value : null
  const steps = snapshot && Array.isArray(snapshot.steps) && snapshot.steps.every(step => typeof step === 'string') ? snapshot.steps.join('\n') : null
  return { id: string(row.id), qaTryId: string(row.qaTryId), qaRunId: nullable(row.qaRunId), testCaseId: string(row.testCaseId), startedAt: nullable(row.startedAt),
    finishedAt: nullable(row.finishedAt), verdict: verdict(row.verdict), logId: nullable(row.logId), review: verdict(row.review), note: nullable(row.note), createdAt: string(row.createdAt),
    originalReason: nullable(row.originalReason), caseSnapshot: snapshot ? { scene: text(snapshot.scene), precondition: text(snapshot.precondition),
      step: text(snapshot.step) ?? text(snapshot.test_step) ?? steps, expected: text(snapshot.expected) ?? text(snapshot.expected_value) ?? text(snapshot.expected_result) } : null }
}
function counts(value: unknown): Counts {
  const row = record(value)
  const ratio = (value: unknown) => value == null ? null : number(value)
  return { total: number(row.total), reviewed: number(row.reviewed), inconclusiveReviews: number(row.inconclusiveReviews),
    truePositives: number(row.truePositives), trueNegatives: number(row.trueNegatives), falsePositives: number(row.falsePositives),
    falseNegatives: number(row.falseNegatives), interruptedFalseNegatives: number(row.interruptedFalseNegatives),
    falsePositiveRate: ratio(row.falsePositiveRate), falseNegativeRate: ratio(row.falseNegativeRate), reviewCoverage: ratio(row.reviewCoverage) }
}
const base = (project: string) => `/api/projects/${encodeURIComponent(project)}/qa-evaluation`
async function request(project: string, path: string, signal?: AbortSignal, method = 'GET', body?: unknown) {
  const response = await apiFetch(base(project) + path, { method, signal, ...(body === undefined ? {} : jsonRequest(body)) })
  return readJson(response)
}
export async function attempts(project: string, filters: { qaTryId?: string; testCaseId?: string; before?: string; beforeId?: string }, signal?: AbortSignal) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, value)
  return list(await request(project, '/attempts?' + params, signal), attempt)
}
export async function review(project: string, log: string, decision: string, note: string) {
  await request(project, `/verdicts/${encodeURIComponent(log)}/review`, undefined, 'PUT', { decision, note })
}
export async function getAttempt(project: string, id: string, signal?: AbortSignal): Promise<Attempt> {
  return attempt(await request(project, `/attempts/${encodeURIComponent(id)}`, signal))
}
export async function revisions(project: string, log: string, signal?: AbortSignal): Promise<Revision[]> {
  return list(await request(project, `/verdicts/${encodeURIComponent(log)}/reviews`, signal), value => {
    const row = record(value)
    return { id: string(row.id), decision: string(row.decision), note: nullable(row.note), decidedBy: nullable(row.decidedBy), decidedAt: string(row.decidedAt) }
  })
}
export async function playback(project: string, tryId: string, signal?: AbortSignal): Promise<Playback> {
  const row = record(await request(project, `/tries/${encodeURIComponent(tryId)}/recording`, signal))
  const recording = row.recording == null ? null : record(row.recording)
  return { recording: recording === null ? null : { id: string(recording.id), startedAt: string(recording.startedAt), endedAt: nullable(recording.endedAt),
    expiresAt: nullable(recording.expiresAt), error: nullable(recording.error) },
    segments: list(row.segments, value => { const segment = record(value); return { id: string(segment.id), startedAt: string(segment.startedAt), endedAt: string(segment.endedAt), state: string(segment.state), url: nullable(segment.url) } }),
    gaps: list(row.gaps, value => { const gap = record(value); return { startedAt: string(gap.startedAt), endedAt: string(gap.endedAt), reason: string(gap.reason) } }) }
}
export async function reliability(project: string, from: string, to: string, signal?: AbortSignal): Promise<Reliability> {
  const row = record(await request(project, '/reliability?' + new URLSearchParams({ from, to }), signal))
  const group = (value: unknown) => { const item = record(value); return { key: string(item.key), counts: counts(item.counts) } }
  return { overall: counts(row.overall), daily: list(row.daily, group), cases: list(row.cases, group) }
}
export async function questions(project: string, signal?: AbortSignal): Promise<Question[]> {
  return list(await request(project, '/questions', signal), value => { const row = record(value); return { id: string(row.id), qaTryId: string(row.qaTryId),
    qaRunId: nullable(row.qaRunId), question: string(row.question), state: string(row.state), answer: nullable(row.answer), createdAt: string(row.createdAt) } })
}
export async function answer(project: string, id: string, answer: string) { await request(project, `/questions/${encodeURIComponent(id)}/answer`, undefined, 'POST', { answer }) }
export async function subscription(project: string, subscribed?: boolean): Promise<boolean> {
  const row = record(await request(project, '/question-subscription', undefined, subscribed === undefined ? 'GET' : 'PUT', subscribed === undefined ? undefined : { subscribed }))
  if (typeof row.subscribed !== 'boolean') throw new Error('Invalid subscription')
  if (subscribed !== undefined) window.dispatchEvent(new Event('artel:qa-question-subscriptions'))
  return row.subscribed
}

export async function subscribedProjects(signal?: AbortSignal): Promise<string[]> {
  return list(await readJson(await apiFetch('/api/qa-question-subscriptions', { signal })), string)
}

export async function issueHistory(project: string, id: string, signal?: AbortSignal, beforeLogId?: string): Promise<CaseIssueHistory> {
  const row = record(await request(project, `/issues/${encodeURIComponent(id)}${beforeLogId ? '?beforeLogId=' + encodeURIComponent(beforeLogId) : ''}`, signal))
  return { testCaseId: nullable(row.testCaseId), previousIssueId: nullable(row.previousIssueId), mergedInto: nullable(row.mergedInto), autoClosed: row.autoClosed === true,
    occurrences: list(row.occurrences, value => { const item = record(value); return { attemptId: string(item.attemptId), qaTryId: string(item.qaTryId), qaRunId: nullable(item.qaRunId), logId: nullable(item.logId),
      verdict: verdict(item.verdict), review: verdict(item.review), falsePositive: item.falsePositive === true, validFailure: item.validFailure === true, finishedAt: nullable(item.finishedAt) } }) }
}
