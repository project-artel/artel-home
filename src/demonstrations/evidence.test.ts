import assert from 'node:assert/strict'
import test from 'node:test'
import { BoundaryCaptureQueue, judgmentAnnotation } from './evidence.ts'
import type { EvidenceInput } from './types.ts'

const frame = (capturedAt: string): EvidenceInput => ({ capturedAt, dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 })
test('자동 저장 중에는 마지막 장면 하나만 대기하고 종료 후에는 전송하지 않는다', async () => {
  const saved: string[] = []
  let finish: () => void = () => undefined
  const queue = new BoundaryCaptureQueue(async (evidence) => {
    saved.push(evidence.capturedAt)
    await new Promise<void>((resolve) => { finish = resolve })
  }, () => assert.fail('unexpected failure'))
  queue.enqueue(frame('before'))
  queue.enqueue(frame('middle'))
  queue.enqueue(frame('after'))
  assert.deepEqual(saved, ['before'])
  finish()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(saved, ['before', 'after'])
  queue.enqueue(frame('discarded'))
  queue.dispose(); finish()
  await new Promise<void>((resolve) => setImmediate(resolve))
  queue.enqueue(frame('later'))
  assert.deepEqual(saved, ['before', 'after'])
})

test('판정과 장면만으로 저장하고 기대 결과나 관찰 내용을 대신 작성하지 않는다', () => {
  assert.deepEqual(judgmentAnnotation('PASS', 112, ' ', null), { outcome: 'PASS', evidenceEventId: 112 })
  const region = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }
  assert.deepEqual(judgmentAnnotation('FAIL', 113, ' 아이템이 없다 ', region), { outcome: 'FAIL', evidenceEventId: 113, explanation: '아이템이 없다', region })
})
