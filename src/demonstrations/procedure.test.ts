import assert from 'node:assert/strict'
import test from 'node:test'
import { procedureApprovable, procedureDraftValid } from './procedure.ts'
import type { VerificationProcedure } from './types.ts'

const procedure: VerificationProcedure = {
  title: '구매 확인', preconditions: ['골드 보유'],
  steps: [{ instruction: '구매', target: '구매 버튼', completionCondition: '결과 표시', evidenceEventIds: [1] }],
  assertions: [{ expected: '골드 차감과 아이템 추가', failure: '골드만 차감', when: '구매 완료 후', evidenceEventIds: [3] }],
  observedOutcome: 'FAIL', facts: ['사람이 골드만 차감됐다고 설명함'], inferences: [], unresolvedQuestions: [],
}
test('실패 시연도 승인할 수 있지만 미해결 질문과 빠진 판정 조건은 막는다', () => {
  assert.equal(procedureApprovable(procedure, [1, 3]), true)
  assert.equal(procedureApprovable({ ...procedure, unresolvedQuestions: ['완료 시점 확인 필요'] }, [1, 3]), false)
  assert.equal(procedureDraftValid({ ...procedure, steps: [] }, [1, 3]), false)
  assert.equal(procedureApprovable({ ...procedure, assertions: [{ ...procedure.assertions[0], failure: ' ' }] }, [1, 3]), false)
})

test('새 단계에 같은 시연의 근거를 지정해야 초안을 저장할 수 있다', () => {
  const draft = { ...procedure, steps: [...procedure.steps, { instruction: '결과 확인', target: '', completionCondition: '아이템 표시', evidenceEventIds: [] as number[] }] }
  assert.equal(procedureDraftValid(draft, [1, 3]), false)
  draft.steps[1].evidenceEventIds = [3]
  assert.equal(procedureDraftValid(draft, [1, 3]), true)
  draft.steps[1].evidenceEventIds = [99]
  assert.equal(procedureDraftValid(draft, [1, 3]), false)
  const assertionDraft = { ...procedure, assertions: [{ ...procedure.assertions[0], evidenceEventIds: [] as number[] }] }
  assert.equal(procedureDraftValid(assertionDraft, [1, 3]), false)
  assertionDraft.assertions[0].evidenceEventIds = [3]
  assert.equal(procedureDraftValid(assertionDraft, [1, 3]), true)
})
test('미해결 질문이 있는 빈 초안은 저장할 수 있지만 승인할 수 없다', () => {
  const draft = { ...procedure, steps: [], assertions: [], unresolvedQuestions: ['완료 조건 확인 필요'] }
  assert.equal(procedureDraftValid(draft, [1, 3]), true)
  assert.equal(procedureApprovable(draft, [1, 3]), false)
})
