/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseViewerMessage } from './streamApi.ts'
import { streamJpegBytes } from './jpegFrame.ts'
import { streamErrorNotice } from './streamErrors.ts'
import { connectViewer, FRAME_TIMEOUT_MS, RENEW_INTERVAL_MS, type ViewerTimers } from './viewerConnection.ts'
import { MAX_STREAM_JPEG_BYTES, MAX_STREAM_MESSAGE_CHARS, type GameStreamFailure, type GameStreamStatus } from './streamTypes.ts'

function jpeg(width = 640, height = 360): string {
  return Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0, 0xff, 0xd9]).toString('base64')
}

class FakeSocket extends EventTarget {
  readyState = 1
  sent: string[] = []
  closed = false
  send(data: string) { this.sent.push(data) }
  close() { this.closed = true; this.readyState = 3 }
  message(data: object | string) { this.dispatchEvent(new MessageEvent('message', { data: typeof data === 'string' ? data : JSON.stringify(data) })) }
  disconnect(code: number) { this.dispatchEvent(Object.assign(new Event('close'), { code })) }
}

function clock(): ViewerTimers & { tasks: Map<number, { callback: () => void; delay: number }>; run(delay: number): void } {
  let next = 0
  const tasks = new Map<number, { callback: () => void; delay: number }>()
  return {
    tasks,
    schedule(callback, delay) { const id = ++next; tasks.set(id, { callback, delay }); return id },
    cancel(id) { tasks.delete(id) },
    run(delay) {
      const task = [...tasks].find(([, item]) => item.delay === delay)
      assert.ok(task, `timer ${delay} must exist`)
      tasks.delete(task[0]); task[1].callback()
    },
  }
}

function bitmap(width = 640) {
  const value = { width, height: 360, closed: false, close() { value.closed = true } }
  return value as typeof value & ImageBitmap
}

function setup(decode: (jpeg: string) => Promise<ImageBitmap> = async () => bitmap()) {
  const socket = new FakeSocket()
  const timers = clock()
  const statuses: { status: GameStreamStatus; failure: GameStreamFailure | null; errorCode?: string }[] = []
  const frames: ImageBitmap[] = []
  let retries = 0
  let lives = 0
  const stop = connectViewer({
    socket: socket as unknown as WebSocket, timers, decode,
    onState: (status, failure, errorCode) => statuses.push({ status, failure, ...(errorCode === undefined ? {} : { errorCode }) }),
    onFrame: (frame) => frames.push(frame), onLive: () => { lives++ },
    onRetry: () => { retries++ }, reconnectDelay: () => 1_000,
  })
  return { socket, timers, statuses, frames, stop, retries: () => retries, lives: () => lives }
}
function ready(socket: FakeSocket, streamId = 'viewer-1') { socket.message({ type: 'STREAM_READY', streamId, transport: 'JPEG_WS' }) }
function frame(socket: FakeSocket, frameId: number, streamId = 'viewer-1') { socket.message({ type: 'STREAM_FRAME', streamId, frameId, jpeg: jpeg() }) }
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

test('JPEG metadata와 encoded byte 상한으로 큰 decode를 거부한다', () => {
  assert.ok(streamJpegBytes(jpeg()))
  assert.ok(streamJpegBytes(jpeg(1920, 1080)))
  assert.equal(streamJpegBytes(jpeg(1921, 1080)), null)
  assert.equal(streamJpegBytes(jpeg(1920, 1081)), null)
  assert.equal(streamJpegBytes(jpeg(1, 360)), null)
  assert.equal(streamJpegBytes('%%%%'), null)
  assert.equal(streamJpegBytes(Buffer.alloc(MAX_STREAM_JPEG_BYTES + 1).toString('base64')), null)
  assert.equal(streamJpegBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 255, 0xff, 0xd9]).toString('base64')), null)
  const metadata = Buffer.from(jpeg(), 'base64')
  assert.equal(streamJpegBytes(Buffer.concat([metadata.subarray(0, 15), metadata.subarray(2)]).toString('base64')), null)
})

test('viewer wire는 JPEG frame과 transport 불일치를 읽고 WebRTC 메시지는 받지 않는다', () => {
  assert.deepEqual(parseViewerMessage('{"type":"STREAM_READY","streamId":"s"}'), { type: 'STREAM_READY', streamId: 's', transport: '' })
  assert.equal(parseViewerMessage(JSON.stringify({ type: 'STREAM_FRAME', streamId: 's', frameId: 0, jpeg: jpeg() })), null)
  assert.equal(parseViewerMessage(JSON.stringify({ type: 'STREAM_FRAME', streamId: 's', frameId: 1.5, jpeg: jpeg() })), null)
  assert.equal(parseViewerMessage(' '.repeat(MAX_STREAM_MESSAGE_CHARS + 1)), null)
  assert.equal(parseViewerMessage('{"type":"WEBRTC_OFFER","streamId":"s","sdp":"legacy"}'), null)
  assert.deepEqual(parseViewerMessage('{"type":"STREAM_ERROR","streamId":"s","code":"SDK_UPDATE_REQUIRED"}'), { type: 'STREAM_ERROR', streamId: 's', code: 'SDK_UPDATE_REQUIRED', message: '' })
})

test('첫 frame decode 뒤 live가 되고 bitmap을 해제하며 5초 정지는 재연결한다', async () => {
  const opened = setup()
  ready(opened.socket)
  assert.equal(opened.statuses.at(-1)?.status, 'connecting')
  frame(opened.socket, 1)
  await flush()
  assert.equal(opened.statuses.at(-1)?.status, 'live')
  assert.equal(opened.frames.length, 1)
  assert.equal((opened.frames[0] as ReturnType<typeof bitmap>).closed, true)
  opened.timers.run(FRAME_TIMEOUT_MS)
  assert.equal(opened.statuses.at(-1)?.status, 'reconnecting')
  assert.equal(opened.socket.closed, true)
  opened.timers.run(1_000)
  assert.equal(opened.retries(), 1)
  opened.stop()
})

test('느린 decode 중에는 최신 pending frame 하나만 남긴다', async () => {
  const resolvers: ((frame: ImageBitmap) => void)[] = []
  const opened = setup(() => new Promise((resolve) => resolvers.push(resolve)))
  ready(opened.socket)
  frame(opened.socket, 1)
  frame(opened.socket, 2)
  frame(opened.socket, 3)
  frame(opened.socket, 2)
  assert.equal(resolvers.length, 1)
  resolvers[0](bitmap(100))
  await flush()
  assert.equal(resolvers.length, 2)
  resolvers[1](bitmap(300))
  await flush()
  assert.deepEqual(opened.frames.map((item) => item.width), [100, 300])
  assert.equal(opened.lives(), 2)
  opened.stop()
})

test('종료된 attempt의 늦은 decode는 그리지 않고 bitmap만 해제한다', async () => {
  let complete: ((value: ImageBitmap) => void) | undefined
  const opened = setup(() => new Promise((resolve) => { complete = resolve }))
  ready(opened.socket)
  frame(opened.socket, 1)
  opened.stop()
  const late = bitmap()
  complete?.(late)
  await flush()
  assert.equal(late.closed, true)
  assert.equal(opened.frames.length, 0)
  assert.equal(opened.timers.tasks.size, 0)
  assert.ok(opened.socket.sent.includes('{"type":"STOP"}'))
})

test('새 STREAM_READY는 이전 decode와 frame ID를 폐기한다', async () => {
  const resolvers: ((frame: ImageBitmap) => void)[] = []
  const opened = setup(() => new Promise((resolve) => resolvers.push(resolve)))
  ready(opened.socket)
  frame(opened.socket, 10)
  ready(opened.socket, 'viewer-2')
  frame(opened.socket, 100, 'viewer-1')
  frame(opened.socket, 1, 'viewer-2')
  const stale = bitmap(100)
  resolvers[0](stale)
  await flush()
  assert.equal(stale.closed, true)
  assert.equal(opened.frames.length, 0)
  resolvers[1](bitmap(200))
  await flush()
  assert.equal(opened.frames[0].width, 200)
  opened.stop()
})

test('이전 transport와 SDK update 오류는 자동 재시도하지 않는다', () => {
  const oldServer = setup()
  oldServer.socket.message({ type: 'STREAM_READY', streamId: 's' })
  assert.deepEqual(oldServer.statuses.at(-1), { status: 'error', failure: 'signalling', errorCode: 'SERVER_TRANSPORT_MISMATCH' })
  assert.equal(oldServer.timers.tasks.size, 0)
  oldServer.stop()
  const oldSdk = setup()
  ready(oldSdk.socket)
  oldSdk.socket.message({ type: 'STREAM_ERROR', streamId: 'viewer-1', code: 'SDK_UPDATE_REQUIRED' })
  assert.deepEqual(oldSdk.statuses.at(-1), { status: 'error', failure: 'signalling', errorCode: 'SDK_UPDATE_REQUIRED' })
  assert.equal(oldSdk.timers.tasks.size, 0)
  oldSdk.stop()
})

test('업데이트 오류는 SDK와 서버의 조치를 구분해서 표시한다', () => {
  assert.deepEqual(streamErrorNotice('SDK_UPDATE_REQUIRED'), { label: 'SDK 업데이트 필요', detail: '게임의 ARTEL SDK를 업데이트한 뒤 다시 실행해 주세요.' })
  assert.deepEqual(streamErrorNotice('SERVER_TRANSPORT_MISMATCH'), { label: '서버 업데이트 필요', detail: '서버가 이 화면의 영상 전송 방식을 지원하지 않습니다. 서버를 업데이트해 주세요.' })
  assert.equal(streamErrorNotice('INVALID_FRAME'), null)
})

test('다른 viewer가 이어받거나 접근 권한이 없으면 자동 재시도하지 않는다', () => {
  for (const [code, status, failure] of [[4009, 'takenOver', null], [4403, 'error', 'notPermitted'], [4003, 'error', 'signalling']] as const) {
    const opened = setup()
    ready(opened.socket)
    opened.socket.disconnect(code)
    assert.deepEqual(opened.statuses.at(-1), { status, failure })
    assert.equal(opened.timers.tasks.size, 0)
    opened.stop()
  }
})

test('offline은 5초 뒤 확인하고 renew와 cleanup은 같은 socket에만 보낸다', () => {
  const opened = setup()
  ready(opened.socket)
  opened.timers.run(RENEW_INTERVAL_MS)
  assert.deepEqual(opened.socket.sent, ['{"type":"RENEW"}'])
  opened.socket.disconnect(4404)
  assert.equal(opened.statuses.at(-1)?.status, 'offline')
  opened.timers.run(5_000)
  assert.equal(opened.retries(), 1)
  opened.stop()
  const stopped = setup()
  ready(stopped.socket)
  stopped.stop()
  stopped.socket.message({ type: 'STREAM_READY', streamId: 'late', transport: 'JPEG_WS' })
  assert.equal(stopped.timers.tasks.size, 0)
})

test('손상 frame의 decode 실패가 timeout을 없애거나 live로 바꾸지 않는다', async () => {
  const opened = setup(async () => { throw new Error('JPEG decode failed') })
  ready(opened.socket)
  frame(opened.socket, 1)
  await flush()
  assert.equal(opened.statuses.at(-1)?.status, 'connecting')
  opened.timers.run(15_000)
  assert.equal(opened.statuses.at(-1)?.status, 'reconnecting')
  opened.stop()
})
