/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCondition, parseContentMapView, parseStep } from './contentMapApi.ts'
import {
  interactionStyle,
  stepCondition,
  stepStatusStyle,
  type ConditionNode,
  type ContentMapStep,
} from './contentMapTypes.ts'

/*
 * 조작 단계와 그 조건.
 *
 * 서버가 이 절을 아직 보내지 않는다. 그래서 여기 있는 페이로드는 계약대로 손으로
 * 쓴 것이고, 이 시험이 증명하는 것은 "계약대로 오면 이렇게 읽는다"이지 "서버가
 * 이렇게 준다"가 아니다.
 *
 * 세 가지를 지킨다.
 *
 *  1. `steps` 절이 없는 응답 — 지금 서버 — 에서도 깨지지 않는다. 절 없음은
 *     `null` 이고 "단계 0개"가 아니다.
 *  2. 화면에서 다시 관대해지지 않는다. 모르는 `kind` 는 아는 갈래로 접히지 않고
 *     서버가 뭐라고 했는지를 들고 남는다.
 *  3. `givenText` 가 먼저다. 서버가 문장을 채우는 날 화면이 저절로 좋아진다.
 */

/** 계약대로 채운 단계 하나. 시험마다 관심 있는 필드만 덮어쓴다. */
function step(overrides: Partial<ContentMapStep> = {}): ContentMapStep {
  return {
    id: '1',
    summary: 'Scenes.GameClearController.Update()',
    status: 'runnable',
    interaction: 'press',
    inputKey: 'any',
    controlLabel: null,
    controlPath: null,
    givenText: null,
    given: null,
    ...overrides,
  }
}

test('steps 절이 없는 응답에서 씬의 steps 는 null 이고 나머지는 그대로 읽힌다', () => {
  // 지금 서버의 응답이다. 화면은 이 절을 통째로 그리지 않는 것으로 반응한다.
  const view = parseContentMapView({
    scenes: [
      { id: 1, name: 'GameClearScene', walked: true, capabilities: { total: 6, runnable: 6 } },
    ],
  })

  assert.equal(view.scenes[0].steps, null)
  assert.equal(view.scenes[0].capabilities.runnable, 6)
})

test('빈 steps 배열은 null 이 아니다 — 단계가 없다는 사실과 절이 없다는 사실은 다르다', () => {
  const view = parseContentMapView({
    scenes: [{ id: 1, name: 'Title', walked: false, capabilities: { total: 0 }, steps: [] }],
  })

  assert.deepEqual(view.scenes[0].steps, [])
})

test('steps 가 배열이 아니면 절이 없는 것으로 읽는다', () => {
  const view = parseContentMapView({
    scenes: [{ id: 1, name: 'Title', walked: false, capabilities: {}, steps: 'soon' }],
  })

  assert.equal(view.scenes[0].steps, null)
})

test('단계는 계약의 모든 필드를 들고 오고 id 는 문자열로 정규화된다', () => {
  const parsed = parseStep({
    id: 42,
    summary: 'Scenes.GameClearController.ShowGettedCard()',
    status: 'needs-probe',
    interaction: 'click',
    inputKey: 'any',
    controlLabel: 'Next',
    controlPath: 'Canvas/Next',
    givenText: null,
    given: { kind: 'always' },
  })

  assert.deepEqual(parsed, {
    id: '42',
    summary: 'Scenes.GameClearController.ShowGettedCard()',
    status: 'needs-probe',
    interaction: 'click',
    inputKey: 'any',
    controlLabel: 'Next',
    controlPath: 'Canvas/Next',
    givenText: null,
    given: { kind: 'always' },
  })
})

test('id 없는 단계만 버린다 — 요약이 같은 줄들을 가르는 것이 id 와 조건뿐이다', () => {
  const view = parseContentMapView({
    scenes: [
      {
        id: 1,
        capabilities: {},
        steps: [{ id: 1, summary: 'a' }, { summary: 'b' }, { id: 2, summary: 'c' }],
      },
    ],
  })

  assert.deepEqual(
    view.scenes[0].steps?.map((parsed) => parsed.id),
    ['1', '2'],
  )
})

test('요약·입력키·상태가 같은 여섯 줄이 접히지 않고 여섯 줄로 남는다', () => {
  // 실측한 GameClearScene 이다. 접으면 이 화면이 존재하는 이유가 사라진다.
  const identical = {
    summary: 'Scenes.GameClearController.ShowGettedCard()',
    status: 'runnable',
    interaction: 'press',
    inputKey: 'any',
  }
  const view = parseContentMapView({
    scenes: [
      {
        id: 1,
        capabilities: { total: 6, runnable: 6 },
        steps: [1, 2, 3, 4, 5, 6].map((id) => ({ ...identical, id })),
      },
    ],
  })

  assert.equal(view.scenes[0].steps?.length, 6)
})

test('알려진 상태와 상호작용만 라벨을 얻고 나머지는 모른다는 갈래로 간다', () => {
  assert.equal(stepStatusStyle('runnable'), 'runnable')
  assert.equal(stepStatusStyle('needs-probe'), 'needsProbe')
  assert.equal(stepStatusStyle('unreachable-precondition'), 'unreachablePrecondition')
  // 서버 어휘는 kebab-case 다. camelCase 를 받아 주기 시작하면 어느 쪽이 서버가
  // 쓴 철자인지 아무도 모르게 된다.
  assert.equal(stepStatusStyle('needsProbe'), 'unknown')
  assert.equal(stepStatusStyle('teleports'), 'unknown')

  assert.equal(interactionStyle('drag'), 'drag')
  assert.equal(interactionStyle('none'), 'none')
  assert.equal(interactionStyle('swipe'), 'unknown')
})

test('조건 어휘 여섯 가지를 전부 읽는다', () => {
  assert.deepEqual(parseCondition({ kind: 'always' }), { kind: 'always' })

  assert.deepEqual(
    parseCondition({
      kind: 'test',
      left: 'GameClearController.cardShown',
      operator: '==',
      right: 'false',
      context: 'Scenes.GameClearController.Update()',
      subjectLost: null,
      offset: 118,
    }),
    {
      kind: 'test',
      left: 'GameClearController.cardShown',
      operator: '==',
      right: 'false',
      context: 'Scenes.GameClearController.Update()',
      subjectLost: null,
      offset: 118,
    },
  )

  assert.deepEqual(parseCondition({ kind: 'gesture', input: 'any', offset: 7 }), {
    kind: 'gesture',
    input: 'any',
    offset: 7,
  })

  assert.deepEqual(
    parseCondition({ kind: 'unknown', reason: 'UNREAD_BRANCH', unread: 'brfalse.s IL_004a' }),
    { kind: 'unknown', reason: 'UNREAD_BRANCH', unread: 'brfalse.s IL_004a' },
  )

  const group = parseCondition({
    kind: 'either',
    parts: [{ kind: 'always' }, { kind: 'gesture', input: 'any', offset: 0 }],
  })
  assert.equal(group.kind, 'either')
})

test('조건은 중첩된다 — every 안의 every 가 그대로 남는다', () => {
  const parsed = parseCondition({
    kind: 'every',
    parts: [
      { kind: 'gesture', input: 'any', offset: 3 },
      {
        kind: 'every',
        parts: [
          { kind: 'test', left: 'a', operator: '>', right: '0', context: null, subjectLost: null, offset: 11 },
          { kind: 'either', parts: [{ kind: 'always' }, { kind: 'unknown', reason: 'X', unread: null }] },
        ],
      },
    ],
  })

  assert.equal(parsed.kind, 'every')
  assert.equal(parsed.parts.length, 2)
  const inner = parsed.parts[1]
  assert.equal(inner.kind, 'every')
  assert.equal(inner.parts.length, 2)
  const innermost = inner.parts[1]
  assert.equal(innermost.kind, 'either')
  assert.deepEqual(innermost.parts[1], { kind: 'unknown', reason: 'X', unread: null })
})

test('모르는 kind 는 아는 갈래로 접히지 않고 서버가 뭐라고 했는지를 들고 남는다', () => {
  // 여기서 관대해지면 못 읽은 조건이 `always` 로 낮아지고, 화면은 선행 조건이
  // 있는 조작을 "아무 때나 된다"고 말하게 된다.
  assert.deepEqual(parseCondition({ kind: 'whenever' }), {
    kind: 'unrecognisedKind',
    reportedKind: 'whenever',
  })
  assert.deepEqual(parseCondition({ reason: 'no kind at all' }), {
    kind: 'unrecognisedKind',
    reportedKind: '',
  })
  assert.deepEqual(parseCondition('always'), { kind: 'unrecognisedKind', reportedKind: '' })
})

test('중첩 안의 모르는 kind 도 그 자리에 그대로 남는다', () => {
  const parsed = parseCondition({
    kind: 'every',
    parts: [{ kind: 'always' }, { kind: 'sometimes' }],
  })

  assert.equal(parsed.kind, 'every')
  assert.deepEqual(parsed.parts[1], { kind: 'unrecognisedKind', reportedKind: 'sometimes' })
})

test('부분이 없는 묶음은 조건이 아니다', () => {
  // 빈 `every` 를 그리면 화면이 "이것을 전부 만족해야 한다"고 말해 놓고
  // 아무것도 대지 못한다.
  assert.deepEqual(parseCondition({ kind: 'every', parts: [] }), {
    kind: 'unrecognisedKind',
    reportedKind: 'every',
  })
  assert.deepEqual(parseCondition({ kind: 'either' }), {
    kind: 'unrecognisedKind',
    reportedKind: 'either',
  })
})

test('given 이 null 이거나 없으면 조건 절이 없는 것이고 always 가 아니다', () => {
  assert.equal(parseStep({ id: 1, given: null })?.given, null)
  assert.equal(parseStep({ id: 1 })?.given, null)
})

test('givenText 가 먼저다 — 문장이 오는 날 트리는 접힌 자리로 물러난다', () => {
  const tree: ConditionNode = { kind: 'gesture', input: 'any', offset: 0 }

  assert.deepEqual(stepCondition(step({ givenText: '카드를 아직 안 보여 줬을 때', given: tree })), {
    form: 'sentence',
    text: '카드를 아직 안 보여 줬을 때',
    tree,
  })

  // 지금 서버다. `givenText` 는 전부 null 이고 트리가 그 자리를 지킨다.
  assert.deepEqual(stepCondition(step({ givenText: null, given: tree })), { form: 'tree', tree })

  // 빈 문장은 문장이 아니다. 공백만 있는 `givenText` 로 트리를 가리면 화면에
  // 아무 조건도 남지 않는다.
  assert.deepEqual(stepCondition(step({ givenText: '   ', given: tree })), { form: 'tree', tree })
})

test('조건이 아무것도 없는 단계는 always 와 다른 갈래로 간다', () => {
  assert.deepEqual(stepCondition(step({ givenText: null, given: null })), { form: 'none' })
  assert.deepEqual(stepCondition(step({ given: { kind: 'always' } })), {
    form: 'tree',
    tree: { kind: 'always' },
  })
})
