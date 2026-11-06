import assert from 'node:assert/strict'
import { test } from 'node:test'
import { targetOf, verbOf } from './stepLabel'

test('the verb comes from the words the step uses', () => {
  assert.equal(verbOf('`Canvas/continue`을(를) 클릭해 맵 화면으로 이동한다', false), 'click')
  assert.equal(verbOf('RightArrow 키를 누른다 — position 이 1 이 될 때까지 되풀이한다', false), 'key')
  assert.equal(verbOf('Canvas/Stage UI 요소가 화면에 표시되는지 확인한다', false), 'check')
  assert.equal(verbOf('StoryScene으로 전환되는지 본다', false), 'move')
  assert.equal(verbOf('DraggableCard를 마우스로 드래그해 옮긴다', false), 'drag')
  assert.equal(verbOf('게임을 부팅하여 TitleScene에 도달한다', false), 'start')
  assert.equal(verbOf('아무 말', false), 'step')
})

test('a gap is a gap whatever it says', () => {
  assert.equal(verbOf('이 구간의 경로를 확인할 수 없습니다', true), 'gap')
})

test('the target prefers a quoted name, then a path, then a key', () => {
  assert.equal(targetOf('`이어하기` 을(를) 클릭해 `StoryScene` 화면으로 넘어간다'), '이어하기')
  assert.equal(targetOf('Canvas/Button (Legacy) UI 요소가 화면에 표시되는지 확인한다'), 'Canvas/Button (Legacy)')
  assert.equal(targetOf('Return 키를 눌러 전투 화면으로 이동한다'), 'Return')
  assert.equal(targetOf('wordHead 캐릭터가 battle1 위치에 있는지 확인한다'), 'wordHead')
  assert.equal(targetOf('타이틀 화면에서 게임을 시작한다'), '타이틀 화면에서 게임을')
})
