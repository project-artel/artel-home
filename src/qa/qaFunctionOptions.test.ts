import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  changeRunChoiceKind,
  DEFAULT_QA_FUNCTION_OPTIONS,
  functionOptionsRequestFields,
  functionOptionsSummary,
  parseQaTryFunctionOptions,
  runChoiceKind,
  toggleChosenRunName,
} from './qaFunctionOptions'
import { messages } from '../i18n/messages'

const CATALOG = ['give_gold', 'god_mode', 'skip_level']

describe('toggleChosenRunName', () => {
  it('전부 허용에서 하나를 끄면 나머지 목록이 된다', () => {
    assert.deepEqual(toggleChosenRunName(null, CATALOG, 'god_mode'), ['give_gold', 'skip_level'])
  })

  it('끈 것을 다시 켜서 전부가 되어도 null 이 아니라 목록이다', () => {
    assert.deepEqual(toggleChosenRunName(['give_gold', 'skip_level'], CATALOG, 'god_mode'), CATALOG)
  })

  it('목록은 catalog 순서를 따른다', () => {
    assert.deepEqual(toggleChosenRunName(['skip_level'], CATALOG, 'give_gold'), ['give_gold', 'skip_level'])
  })

  it('catalog 에서 사라진 이름은 목록에서 떨어진다', () => {
    assert.deepEqual(toggleChosenRunName(['gone', 'give_gold'], CATALOG, 'god_mode'), ['give_gold', 'god_mode'])
  })

  it('마지막 하나를 끄면 빈 목록이다', () => {
    assert.deepEqual(toggleChosenRunName(['give_gold'], CATALOG, 'give_gold'), [])
  })
})

describe('runChoiceKind 와 changeRunChoiceKind', () => {
  it('기본값은 두 축 모두 전부다', () => {
    assert.equal(runChoiceKind(DEFAULT_QA_FUNCTION_OPTIONS, 'cheats'), 'all')
    assert.equal(runChoiceKind(DEFAULT_QA_FUNCTION_OPTIONS, 'behaviors'), 'all')
  })

  it('없음은 mode 를 끈다', () => {
    const next = changeRunChoiceKind(DEFAULT_QA_FUNCTION_OPTIONS, 'cheats', 'none', CATALOG)
    assert.equal(next.cheatMode, 'off')
    assert.equal(next.behaviorMode, 'on')
    assert.equal(runChoiceKind(next, 'cheats'), 'none')
  })

  it('전부에서 직접 선택으로 바꾸면 catalog 전부가 체크된 목록에서 시작한다', () => {
    const next = changeRunChoiceKind(DEFAULT_QA_FUNCTION_OPTIONS, 'behaviors', 'chosen', CATALOG)
    assert.deepEqual(next.allowedBehaviors, CATALOG)
    assert.equal(runChoiceKind(next, 'behaviors'), 'chosen')
  })

  it('직접 선택은 이미 고른 목록을 이어받는다', () => {
    const off = { ...DEFAULT_QA_FUNCTION_OPTIONS, cheatMode: 'off' as const, allowedCheats: ['give_gold'] }
    const next = changeRunChoiceKind(off, 'cheats', 'chosen', CATALOG)
    assert.equal(next.cheatMode, 'on')
    assert.deepEqual(next.allowedCheats, ['give_gold'])
  })

  it('전부로 돌리면 목록은 null 이고 요청은 기본값과 같다', () => {
    const chosen = changeRunChoiceKind(DEFAULT_QA_FUNCTION_OPTIONS, 'cheats', 'chosen', CATALOG)
    const back = changeRunChoiceKind(chosen, 'cheats', 'all', CATALOG)
    assert.deepEqual(functionOptionsRequestFields(back), functionOptionsRequestFields(DEFAULT_QA_FUNCTION_OPTIONS))
  })
})

describe('functionOptionsSummary', () => {
  const NAMES = { cheats: ['a', 'b', 'c', 'd', 'e'], behaviors: ['flee', 'patrol'] }

  it('기본값은 두 축의 개수와 함께 모두 허용이다', () => {
    assert.equal(
      functionOptionsSummary(DEFAULT_QA_FUNCTION_OPTIONS, NAMES, messages.ko.gameFunctions.run.summary),
      'Cheat 5개 · Behavior 2개 모두 허용',
    )
    assert.equal(
      functionOptionsSummary(DEFAULT_QA_FUNCTION_OPTIONS, NAMES, messages.en.gameFunctions.run.summary),
      'All allowed · 5 cheats · 2 behaviors',
    )
  })

  it('catalog 를 모르면 개수 없이 쓴다', () => {
    assert.equal(
      functionOptionsSummary(DEFAULT_QA_FUNCTION_OPTIONS, null, messages.ko.gameFunctions.run.summary),
      'Cheat · Behavior 모두 허용',
    )
  })

  it('축마다 없음과 직접 선택을 따로 쓴다', () => {
    const options = { cheatMode: 'off' as const, behaviorMode: 'on' as const, allowedCheats: null, allowedBehaviors: ['flee', 'gone'] }
    assert.equal(functionOptionsSummary(options, NAMES, messages.ko.gameFunctions.run.summary), 'Cheat 없음 · Behavior 2개 중 1개')
    assert.equal(functionOptionsSummary(options, NAMES, messages.en.gameFunctions.run.summary), 'Cheats: none · Behaviors: 1 of 2')
  })
})

describe('functionOptionsRequestFields', () => {
  it('기본값은 둘 다 켜고 목록은 null 이다', () => {
    assert.deepEqual(functionOptionsRequestFields(DEFAULT_QA_FUNCTION_OPTIONS), {
      cheatMode: 'on',
      behaviorMode: 'on',
      allowedCheats: null,
      allowedBehaviors: null,
    })
  })

  it('끈 쪽의 목록은 보내지 않는다', () => {
    const fields = functionOptionsRequestFields({
      cheatMode: 'off',
      behaviorMode: 'on',
      allowedCheats: ['give_gold'],
      allowedBehaviors: ['flee'],
    })
    assert.equal(fields.allowedCheats, null)
    assert.deepEqual(fields.allowedBehaviors, ['flee'])
  })
})

describe('parseQaTryFunctionOptions', () => {
  it('옵션 필드가 하나도 없는 옛 run 은 null 이다', () => {
    assert.equal(parseQaTryFunctionOptions({ qaTryId: '4', status: 'COMPLETED' }), null)
  })

  it('여섯 필드를 읽는다', () => {
    const options = parseQaTryFunctionOptions({
      cheatMode: 'on',
      behaviorMode: 'off',
      allowedCheats: ['give_gold', 'god_mode'],
      allowedBehaviors: null,
      effectiveCheats: ['give_gold'],
      effectiveBehaviors: [],
    })
    assert.deepEqual(options, {
      cheatMode: 'on',
      behaviorMode: 'off',
      allowedCheats: ['give_gold', 'god_mode'],
      allowedBehaviors: null,
      effectiveCheats: ['give_gold'],
      effectiveBehaviors: [],
    })
  })

  it('알 수 없는 mode 는 null 로 읽고, 목록의 문자열이 아닌 항목은 버린다', () => {
    const options = parseQaTryFunctionOptions({ cheatMode: 'maybe', allowedCheats: ['a', 3, null] })
    assert.equal(options?.cheatMode, null)
    assert.deepEqual(options?.allowedCheats, ['a'])
  })
})
