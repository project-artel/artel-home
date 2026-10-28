import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { LocaleProvider } from '../../../src/i18n/LocaleProvider'
import { QaRunRoute } from '../../../src/qa/QaRunPage'
import '../../../src/styles/index.css'
import '../../../src/App.css'

// 캡처 전용 fixture. 실제 QA 컴포넌트를 사용하되 API 응답과 SSE만 대체한다.
localStorage.setItem('artel.locale', 'ko')
const startedAt = new Date(Date.now() - 180_000).toISOString()
const attempt = { id: '1', qaRunId: '1', testScenarioId: '7', gameInstanceId: '3', status: 'RUNNING', startedAt }
const titles = ['로그인 후 로비 진입', '아이템 구매 후 잔액 갱신', '설정 변경 후 저장', '스테이지 클리어 보상 수령']
const scenario = { testScenarioId: 7, projectId: 1, payload: {
  title: '기본 기능 검증', description: '', execution_mode: 'FREE',
  steps: titles.map((action, index) => ({ action, case_id: index + 11 })),
}}
function log(id: number, type: string, payload: unknown, message = '') {
  return { id: String(id), qaTryId: '1', type, payload, message, direction: 'AGENT_TO_ORCHE',
    createdAt: new Date(Date.now() - (100 - id) * 1000).toISOString() }
}
const verdicts = [
  log(1, 'STATUS', { step: 1, status: 'COMPLETED', message: '로비 진입 확인' }),
  log(2, 'STATUS', { step: 2, status: 'FAILED', message: '구매 후 잔액이 갱신되지 않음' }),
  log(3, 'STATUS', { step: 3, status: 'COMPLETED', message: '설정 저장 확인' }),
]
const tail = Array.from({ length: 50 }, (_, index) => log(index + 10, 'LOG', {}, `게임 상태 확인 ${index + 1}`))
let visits = 0
window.fetch = async (input) => {
  const url = new URL(String(input), location.href)
  let body: unknown = []
  if (url.pathname === '/api/qa-runs/1') body = { id: '1', testRunId: '1', gameInstanceId: '3', status: 'RUNNING', startedAt, tries: [attempt] }
  else if (url.pathname === '/api/qa-tries/1') body = attempt
  else if (url.pathname.endsWith('/verdicts')) {
    visits += 1
    document.getElementById('visits')!.textContent = `판정 API 조회 ${visits}회 · 최근 로그 50개에는 판정 없음`
    body = verdicts
  } else if (url.pathname.endsWith('/logs')) body = { items: url.searchParams.has('beforeId') ? verdicts : tail, hasMore: !url.searchParams.has('beforeId'), nextBeforeId: '10' }
  else if (url.pathname === '/api/test-scenario/7') body = scenario
  else if (url.pathname.endsWith('/test-scenario')) body = [{ testScenarioId: 7, title: '기본 기능 검증', execution_mode: 'FREE' }]
  else if (url.pathname.endsWith('/test-cases')) body = titles.map((step, index) => ({ id: String(index + 11), projectId: '1', step, scene: 'Lobby' }))
  else if (url.pathname.startsWith('/api/llm-usage/')) body = { qaTryId: '1', inputTokens: 2400, outputTokens: 600, calls: 8, pricedCalls: 8, costUsd: 0.02 }
  return Response.json(body)
}
class FixtureEventSource extends EventTarget {
  static CLOSED = 2
  readyState = 1
  constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))) }
  close() { this.readyState = 2 }
}
window.EventSource = FixtureEventSource as unknown as typeof EventSource

createRoot(document.getElementById('root')!).render(<LocaleProvider><MemoryRouter initialEntries={['/projects/1/qa-runs/1']}>
  <header style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 24, alignItems: 'center' }}>
    <strong>ARTEL · QA 재진입 검증</strong><span>테스트 데이터 / 게임 연결 없음</span><span id="visits"/><Link to="/away">화면 나가기</Link>
  </header>
  <Routes>
    <Route path="/projects/:projectId/qa-runs/:qaRunId" element={<QaRunRoute/>}/>
    <Route path="*" element={<main style={{ padding: 40 }}><h1>QA 화면에서 나왔습니다</h1><Link to="/projects/1/qa-runs/1">QA 화면으로 돌아가기</Link></main>}/>
  </Routes>
</MemoryRouter></LocaleProvider>)
