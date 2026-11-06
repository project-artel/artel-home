import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LabelStep } from './expectedLabelsApi'
import { changedLabels, countExpectedFailures, countLabelled, firstExpectedFailure } from './labels'

function step(n: number, expectedPassed: boolean | null, action = `스텝 ${n}`): LabelStep {
  return { step: n, action, caseId: null, expectedPassed }
}

describe('라벨 롤업', () => {
  it('실패 기대 스텝만 센다', () => {
    assert.equal(countExpectedFailures([step(1, true), step(2, false), step(3, null)]), 1)
  })

  it('미지정은 채점 대상에서 빠진다', () => {
    // 분모에 들어가면 라벨을 안 단 스텝이 성적을 희석한다.
    assert.equal(countLabelled([step(1, true), step(2, false), step(3, null)]), 2)
  })

  it('첫 실패 기대 스텝의 번호를 준다', () => {
    assert.equal(firstExpectedFailure([step(1, true), step(2, false), step(3, false)]), 2)
    assert.equal(firstExpectedFailure([step(1, true)]), 0)
  })
})

describe('저장 대상 고르기', () => {
  it('바뀐 스텝만 싣는다', () => {
    const before = [step(1, null), step(2, true), step(3, false)]
    const after = [step(1, false), step(2, true), step(3, false)]

    // 전부 보내면 이 화면이 읽은 뒤 저작 쪽에서 달라진 라벨까지 덮어쓴다.
    assert.deepEqual(changedLabels(before, after).map((s) => s.step), [1])
  })

  it('미지정으로 되돌린 것도 변경이다', () => {
    const before = [step(1, true)]
    const after = [step(1, null)]

    // null을 "안 바뀜"으로 보면 라벨을 지울 방법이 화면에서 사라진다.
    assert.equal(changedLabels(before, after).length, 1)
    assert.equal(changedLabels(before, after)[0].expectedPassed, null)
  })
})

