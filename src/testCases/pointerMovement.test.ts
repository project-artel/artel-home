/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasPointerMoved } from './pointerMovement.ts'

test('기준 좌표가 없는 첫 이벤트는 움직임으로 치지 않는다', () => {
  // 키보드만 쓰는 사람의 포인터가 행 위에 멈춰 있어도 첫 가짜 이벤트가 커서를 옮기지 않는다.
  assert.equal(hasPointerMoved(null, 10, 20), false)
})

test('같은 좌표로 다시 온 이벤트는 움직임이 아니다', () => {
  // 선택 bar 가 나타나 행이 한 줄 밀리면, 가만히 있는 포인터 아래로 다른 행이 들어와 같은
  // 좌표의 이벤트가 온다.
  assert.equal(hasPointerMoved({ x: 10, y: 20 }, 10, 20), false)
})

test('x 나 y 중 하나만 달라도 움직임이다', () => {
  assert.equal(hasPointerMoved({ x: 10, y: 20 }, 11, 20), true)
  assert.equal(hasPointerMoved({ x: 10, y: 20 }, 10, 21), true)
})
