import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import { LocaleContext } from '../../../src/i18n/LocaleContext'
import { messages } from '../../../src/i18n/messages'
import { TestCaseSheet } from '../../../src/testCases/TestCaseSheet'
import { TestCaseIdentifiersContext } from '../../../src/testCases/testCaseIdentifiers'
import { editableCase } from '../../../src/testCases/testCaseLibrary'
import type { TestCase } from '../../../src/testCases/testCaseTypes'
import { CaseEvaluationPanel } from '../../../src/qa/evaluation/CaseEvaluationPanel'
import type { Attempt } from '../../../src/qa/evaluation/evaluationApi'
import { QaNoticeBell } from '../../../src/qa/QaNoticeBell'
import '../../../src/styles/index.css'
import '../../../src/App.css'

const timestamp = '2026-10-29T00:00:00Z'
const old: Attempt = { id: 'old', testCaseId: '2', qaTryId: '6', createdAt: timestamp, startedAt: null, finishedAt: timestamp, verdict: 'INCONCLUSIVE', logId: 'old-log', review: 'FAILED', note: '이전 메모' }
const recent: Attempt[] = Array.from({ length: 100 }, (_, index) => ({ ...old, id: `recent-${index}`, testCaseId: '1', logId: `log-${index}`, review: null, note: null }))
const latestCase: TestCase = { id: '4', projectId: '1', scene: 'Lobby', step: '최신 절차', expectedValue: '화면 표시', precondition: null, status: null, verificationStatus: 'DRAFT', lastVerifiedBuildId: null, createdAt: timestamp, folderId: null, evidenceGaps: [], origin: 'MAP' }
const historicalCase = { ...latestCase, step: '이전 절차' }
const edits: Record<string, unknown>[] = []
let failList = false
let holdReview = false
let releaseReview: (() => void) | undefined
let detailReads = 0
let holdCaseDetail = true
let releaseCaseDetail: (() => void) | undefined
let failCaseDetailOnce = true
let holdAttemptDetail = false
let releaseAttemptDetail: (() => void) | undefined
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

// API fixture만 사용하며 실제 QA 데이터에는 접근하지 않는다.
window.fetch = async (input, options) => {
  const url = new URL(String(input), location.origin)
  if (url.pathname.includes('/qa-notices')) return response({ unreadCount: 0, items: [2, 0, null, undefined].map((count, index) => ({ projectId: '1', projectName: '검증 프로젝트', read: true, run: { id: String(index), testRunName: ['실제 실패 2건', '실제 실패 0건', '실패 집계 null', '실패 집계 누락'][index], casesTotal: 10, casesPassed: 4, ...(count === undefined ? {} : { casesFailed: count }), status: 'COMPLETED', startedAt: timestamp, completedAt: timestamp } })) })
  if (url.pathname.endsWith('/test-cases/4') && options?.method === 'PUT') {
    const patch = JSON.parse(String(options.body)); edits.push(patch)
    return response({ ...historicalCase, functions: { cheats: 'none', behaviors: ['Move'] }, lastVerifiedBuildId: '10', ...patch })
  }
  if (url.pathname.endsWith('/test-cases/4')) {
    if (holdCaseDetail) await new Promise<void>(resolve => { releaseCaseDetail = resolve })
    if (failCaseDetailOnce) { failCaseDetailOnce = false; return response({}, 503) }
    return response({ ...(url.searchParams.get('gameBuildId') === '10' ? historicalCase : latestCase), functions: { cheats: 'none', behaviors: ['Move'] }, lastVerifiedBuildId: '10' })
  }
  if (url.pathname.endsWith('/case-content-reviews')) return response([])
  if (url.pathname.includes('/qa-evaluation/attempts/')) {
    detailReads++
    if (holdAttemptDetail && url.pathname.endsWith('/old')) await new Promise<void>(resolve => { releaseAttemptDetail = resolve })
    return response(url.pathname.endsWith('/old') ? old : recent.find(row => url.pathname.endsWith(`/${row.id}`))!)
  }
  if (url.searchParams.get('testCaseId') === '4') return response([])
  if (url.pathname.endsWith('/qa-evaluation/attempts')) return failList ? response({}, 503) : response(url.searchParams.has('before') ? [old] : recent)
  if (url.pathname.endsWith('/review') && options?.method === 'PUT') {
    if (holdReview) await new Promise<void>(resolve => { releaseReview = resolve })
    const patch = JSON.parse(String(options.body))
    const target = url.pathname.includes('/old-log/') ? old : recent.find(row => url.pathname.includes(`/${row.logId}/`))!
    target.review = patch.decision; target.note = patch.note
    return response({})
  }
  if (url.pathname.endsWith('/reviews')) return response([])
  if (url.pathname.endsWith('/recording')) return response({ recording: null, segments: [], gaps: [] })
  throw new Error(`예상하지 않은 fixture 요청: ${url.pathname}`)
}

const root = createRoot(document.getElementById('root')!)
const output = document.getElementById('results')!
const checks: string[] = []
const context = { locale: 'ko' as const, setLocale: () => {}, t: messages.ko }
function show(element: React.ReactNode, entry = '/') {
  flushSync(() => root.render(<LocaleContext.Provider value={context}><MemoryRouter key={entry} initialEntries={[entry]}><TestCaseIdentifiersContext.Provider value={{ projectId: '1', numbers: new Map([['1', '1'], ['2', '2'], ['4', '4']]) }}>{element}</TestCaseIdentifiersContext.Provider></MemoryRouter></LocaleContext.Provider>))
}
function check(condition: unknown, message: string) { if (!condition) throw new Error(message); checks.push(`PASS: ${message}`); output.textContent = checks.join('\n') }
async function until(predicate: () => unknown) {
  const deadline = Date.now() + 5000
  while (!predicate()) { if (Date.now() > deadline) throw new Error('화면 갱신 대기 시간 초과'); await new Promise(resolve => setTimeout(resolve, 20)) }
}
function button(text: string) { const found = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === text); if (!found) throw new Error(`버튼 없음: ${text}`); return found }
function input(selector: string, value: string) {
  const element = document.querySelector<HTMLTextAreaElement>(selector)!
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
const reviewText = () => document.querySelectorAll('.qe-verdict')[1]?.textContent ?? ''
async function saveReview(note: string) {
  document.querySelector<HTMLButtonElement>('[role="radio"][data-value="PASSED"]')!.click()
  input('.qe-form textarea', note)
  await until(() => document.querySelector<HTMLTextAreaElement>('.qe-form textarea')?.value === note)
  button('평가 저장').click()
}

async function run() {
  const snapshot = editableCase('4', [latestCase], [{ testCase: historicalCase, origin: 'MAP', presence: 'BOTH', verificationStatus: null, compareVerificationStatus: null }])!
  const editor = (build: string, testCase: TestCase) => <TestCaseSheet key={`4:${build}`} projectId="1" testCase={testCase} editGameBuildId={build} onCreated={() => {}} onDelete={() => {}} onClose={() => {}} onSaved={() => {}} />
  show(editor('10', snapshot))
  await until(() => releaseCaseDetail)
  check(!document.querySelector('form'), '선택 build의 전체 TC 조회가 끝나기 전 편집·저장 차단')
  holdCaseDetail = false; releaseCaseDetail!()
  await until(() => document.querySelector('[role="alert"]'))
  check(!document.querySelector('form'), '전체 TC 조회 실패 시 불완전한 목록 데이터로 편집하지 않음')
  button('다시 시도').click()
  await until(() => document.querySelector('form'))
  check(document.querySelector('.gf-case')?.textContent?.includes('Move'), '목록 응답에서 빠진 functions 설정은 단건 조회 결과로 표시')
  check(document.querySelector<HTMLTextAreaElement>('textarea[id$="step"]')?.value === '이전 절차' || Array.from(document.querySelectorAll('textarea')).some(item => item.value === '이전 절차'), '이전 build의 실제 내용으로 폼 표시')
  const step = Array.from(document.querySelectorAll('textarea')).find(item => item.value === '이전 절차')!
  step.dataset.test = 'step'
  const choices = document.querySelectorAll('.gf-case [role="radiogroup"]')[0]
  check(choices.querySelectorAll('[role="radio"]')[1].getAttribute('aria-checked') === 'true', '기존 cheat 없음 설정을 전체 허용과 구분')
  choices.querySelector<HTMLButtonElement>('[role="radio"]')!.click()
  await until(() => choices.querySelector('[role="radio"]')?.getAttribute('aria-checked') === 'true')
  input('[data-test="step"]', '최신 절차')
  await until(() => !document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled)
  document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
  await until(() => edits.length === 1 && document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled)
  check(edits[0].gameBuildId === '10' && edits[0].step === '최신 절차', '최신 내용으로 수정해도 이전 build에 변경분 저장')
  check((edits[0].functions as { cheats: string }).cheats === 'all', '없음에서 전체 허용으로 변경한 functions도 patch에 포함')
  check(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, '목록 props가 이전 값이어도 저장 응답으로 dirty 상태 초기화')
  input('[data-test="step"]', '저장하지 않은 내용')
  show(editor('11', latestCase))
  await until(() => document.querySelector('form'))
  check(Array.from(document.querySelectorAll('textarea')).some(item => item.value === '최신 절차'), 'build 전환 시 작성 중인 draft 초기화')

  show(<CaseEvaluationPanel projectId="1" qaTryId="6" />, '/?attempt=old')
  await until(() => reviewText().includes('이전 메모'))
  const reads = detailReads
  await saveReview('직접 링크 저장 메모')
  await until(() => reviewText().includes('직접 링크 저장 메모') && detailReads > reads)
  check(reviewText().includes('통과'), '최신 100개 밖 직접 링크의 평가·메모 즉시 갱신 및 단건 재조회')

  show(<CaseEvaluationPanel projectId="1" qaTryId="6" />, '/?page=2')
  await until(() => document.querySelector('.qe-more'))
  button('이전 시도 더 보기').click()
  await until(() => document.querySelectorAll('[role="tab"]').length === 2)
  document.querySelector<HTMLButtonElement>('[role="tab"][id$="case-2"]')!.click()
  await until(() => reviewText().includes('직접 링크 저장 메모'))
  failList = true
  await saveReview('추가 페이지 저장 메모')
  await until(() => reviewText().includes('추가 페이지 저장 메모'))
  check(reviewText().includes('통과'), '첫 페이지 재조회 실패에도 추가 페이지 시도의 저장 결과 유지')
  failList = false

  show(<CaseEvaluationPanel projectId="1" qaTryId="6" />, '/?delayed=1')
  await until(() => document.querySelector('.qe-more'))
  button('이전 시도 더 보기').click()
  await until(() => document.querySelectorAll('[role="tab"]').length === 2)
  holdAttemptDetail = true
  document.querySelector<HTMLButtonElement>('[role="tab"][id$="case-2"]')!.click()
  await until(() => releaseAttemptDetail)
  await saveReview('단건 조회 지연 중 저장')
  await until(() => reviewText().includes('단건 조회 지연 중 저장'))
  await until(() => document.querySelectorAll('[role="tab"]').length === 2 && document.querySelector('.qe-more'))
  check(document.querySelector('[role="tab"][id$="case-2"]')?.getAttribute('aria-selected') === 'true', '단건 조회 미완료 중 저장해도 첫 페이지 갱신 후 오래된 시도 선택 유지')
  holdAttemptDetail = false; releaseAttemptDetail!()

  holdReview = true
  await saveReview('이전 시도의 지연 응답')
  await until(() => releaseReview)
  document.querySelector<HTMLButtonElement>('[role="tab"][id$="case-1"]')!.click()
  await until(() => document.querySelector('[role="tab"][id$="case-1"]')?.getAttribute('aria-selected') === 'true')
  releaseReview!(); holdReview = false
  await until(() => old.note === '이전 시도의 지연 응답')
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  check(document.querySelector('[role="tab"][id$="case-1"]')?.getAttribute('aria-selected') === 'true' && !reviewText().includes('이전 시도의 지연 응답'), '저장 중 다른 TC로 전환해도 이전 저장 응답이 현재 선택을 덮지 않음')

  button('이전 시도 더 보기').click()
  await until(() => document.querySelectorAll('[role="tab"]').length === 2)
  holdReview = true; releaseReview = undefined
  await saveReview('최근 시도 저장의 지연 응답')
  await until(() => releaseReview)
  document.querySelector<HTMLButtonElement>('[role="tab"][id$="case-2"]')!.click()
  await until(() => reviewText().includes('이전 시도의 지연 응답'))
  releaseReview!(); holdReview = false
  await until(() => recent.some(row => row.note === '최근 시도 저장의 지연 응답'))
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  check(document.querySelector('[role="tab"][id$="case-2"]')?.getAttribute('aria-selected') === 'true' && reviewText().includes('이전 시도의 지연 응답'), '최근 시도 저장 중 직접 링크에만 남은 오래된 TC를 선택해도 선택 유지')

  show(<QaNoticeBell />, '/?bell=1')
  document.querySelector<HTMLButtonElement>('.qa-bell-button')!.click()
  await until(() => document.querySelectorAll('.qa-bell-item').length === 4)
  const pills = Array.from(document.querySelectorAll('.qa-notice-pill--failed')).map(item => item.textContent)
  check(pills.length === 2 && pills[0]?.includes('2') && pills[1]?.includes('0'), '실패 2·0은 실제 집계 표시, null·누락은 실패 pill 생략')
  output.textContent = `${checks.join('\n')}\n\n${checks.length}개 화면 회귀 검증 통과. 합성 API fixture이며 실제 게임 QA 검증은 아님.`
}
void run().catch(error => { output.textContent = `${checks.join('\n')}\nFAIL: ${String(error)}`; console.error(error) })
