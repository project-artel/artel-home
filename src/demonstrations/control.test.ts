import assert from 'node:assert/strict'
import test from 'node:test'
import { InputQueue, parseControlReply, unityButton, unityKey, videoPoint } from './control.ts'
import type { InputCommand } from './types.ts'

test('letterbox 바깥 입력은 거절하고 스트림 축소와 무관한 정규화 좌표로 변환한다', () => {
  const bounds = { left: 100, top: 50, width: 800, height: 600 }
  assert.equal(videoPoint(500, 60, bounds, 1920, 1080), null)
  assert.deepEqual(videoPoint(500, 350, bounds, 1920, 1080), { x: 0.5, y: 0.5 })
  assert.deepEqual(videoPoint(500, 350, bounds, 960, 540), { x: 0.5, y: 0.5 })
  assert.deepEqual(videoPoint(100, 125, bounds, 1920, 1080), { x: 0, y: 0 })
  assert.equal(videoPoint(900, 350, bounds, 1920, 1080), null)
  assert.equal(videoPoint(0, 0, bounds, 0, 0), null)
  assert.deepEqual(videoPoint(150, 150, { left: 0, top: 0, width: 300, height: 300 }, 100, 200), { x: 0.5, y: 0.5 })
})

test('브라우저 button과 code를 SDK 이름으로 변환하고 탐색 키는 제외한다', () => {
  assert.deepEqual([0, 1, 2, 3].map(unityButton), [0, 2, 1, null])
  assert.deepEqual(['KeyW', 'Digit1', 'ArrowLeft', 'Enter', 'ShiftLeft', 'Tab', 'Escape', 'Unknown'].map(unityKey), ['W', 'Alpha1', 'LeftArrow', 'Return', 'LeftShift', null, null, null])
})

test('스크롤된 영상의 CSS 좌표는 페이지 원점이나 영상 픽셀 크기와 무관하다', () => {
  const bounds = { left: 520, top: 464, width: 530, height: 298.125 }
  for (const [width, height] of [[1280, 720], [1920, 1080], [3840, 2160]]) {
    assert.deepEqual(videoPoint(917.5, 613.0625, bounds, width, height), { x: 0.75, y: 0.5 })
    assert.deepEqual(videoPoint(917.5, 213.0625, { ...bounds, top: 64 }, width, height), { x: 0.75, y: 0.5 })
  }
})

test('SDK 처리 뒤 ACK가 올 때까지 하나만 보내고 마지막 pointer와 down/up 순서를 보존한다', () => {
  const commands: InputCommand[] = []
  const queue = new InputQueue((command) => commands.push(command), () => assert.fail('unexpected failure'))
  assert.equal(queue.send({ method: 'key_down', params: ['A'] }), false)
  queue.start()
  queue.send({ method: 'move_mouse', params: [1, 1] })
  queue.send({ method: 'move_mouse', params: [2, 2] })
  queue.send({ method: 'move_mouse', params: [3, 3] })
  queue.send({ method: 'mouse_down', params: [0] })
  queue.send({ method: 'move_mouse', params: [4, 4] })
  queue.send({ method: 'mouse_up', params: [0] })
  assert.equal(commands.length, 1)
  for (let sequence = 1; sequence <= 5; sequence++) queue.acknowledge(sequence)
  assert.deepEqual(commands.map(({ method, params }) => [method, params]), [
    ['move_mouse', [1, 1]], ['move_mouse', [3, 3]], ['mouse_down', [0]], ['move_mouse', [4, 4]], ['mouse_up', [0]],
  ])
  assert.deepEqual(commands.map((command) => command.sequence), [1, 2, 3, 4, 5])
})

test('queue 상한과 맞지 않는 ACK는 제어를 종료하고 재시작하지 않는다', () => {
  let failures = 0
  const commands: InputCommand[] = []
  const queue = new InputQueue((command) => commands.push(command), () => failures++, 1)
  queue.start()
  queue.send({ method: 'key_down', params: ['A'] })
  queue.send({ method: 'key_up', params: ['A'] })
  assert.equal(queue.send({ method: 'key_down', params: ['B'] }), false)
  queue.acknowledge(1); queue.start()
  assert.equal(queue.send({ method: 'key_down', params: ['C'] }), false)
  assert.equal(failures, 1)
  assert.equal(commands.length, 1)
  const second = new InputQueue(() => undefined, () => failures++)
  second.start(); second.send({ method: 'key_down', params: ['A'] }); second.acknowledge(2)
  assert.equal(failures, 2)
})

test('제어 응답에서 잘못된 JSON과 ACK를 거절한다', () => {
  assert.deepEqual(parseControlReply('{"type":"READY"}'), { type: 'READY' })
  assert.deepEqual(parseControlReply('{"type":"ACK","sequence":1,"eventId":42}'), { type: 'ACK', sequence: 1, eventId: 42 })
  for (const input of ['null', 'bad', '{"type":"ACK","sequence":"1","eventId":42}', '{"type":"ACK","sequence":1.5,"eventId":42}']) assert.equal(parseControlReply(input), null)
})
