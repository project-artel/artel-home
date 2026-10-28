import assert from 'node:assert/strict'
import test from 'node:test'
import { BoundaryCaptureQueue, captureCanvasFrame, captureVideoFrame, judgmentAnnotation } from './evidence.ts'
import type { EvidenceInput } from './types.ts'

const frame = (capturedAt: string): EvidenceInput => ({ capturedAt, dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 })

test('JPEG_WS canvas와 이전 video 장면을 같은 크기 제한으로 저장한다', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const drawn: unknown[][] = []
  const target = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: (...args: unknown[]) => drawn.push(args) }),
    toDataURL: () => 'data:image/png;base64,AAAA',
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => target } })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original)
    else Reflect.deleteProperty(globalThis, 'document')
  })
  const canvas = { width: 2560, height: 1440 } as HTMLCanvasElement
  const video = { videoWidth: 2560, videoHeight: 1440 } as HTMLVideoElement
  for (const evidence of [captureCanvasFrame(canvas), captureVideoFrame(video)]) {
    assert.equal(evidence.width, 1920)
    assert.equal(evidence.height, 1080)
    assert.equal(evidence.dataUrl, 'data:image/png;base64,AAAA')
    assert.ok(Number.isFinite(Date.parse(evidence.capturedAt)))
  }
  assert.deepEqual(drawn, [[canvas, 0, 0, 1920, 1080], [video, 0, 0, 1920, 1080]])
  assert.throws(() => captureCanvasFrame({ width: 0, height: 0 } as HTMLCanvasElement), /frame unavailable/)
})
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
