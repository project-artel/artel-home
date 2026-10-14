import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_QA_FUNCTION_OPTIONS,
  functionOptionsRequestFields,
  parseQaTryFunctionOptions,
  toggleAllowedName,
} from './qaFunctionOptions'

const CATALOG = ['give_gold', 'god_mode', 'skip_level']

describe('toggleAllowedName', () => {
  it('전부 허용에서 하나를 끄면 나머지 목록이 된다', () => {
    assert.deepEqual(toggleAllowedName(null, CATALOG, 'god_mode'), ['give_gold', 'skip_level'])
  })

  it('끈 것을 다시 켜서 전부가 되면 목록이 아니라 null 로 돌아간다', () => {
    assert.equal(toggleAllowedName(['give_gold', 'skip_level'], CATALOG, 'god_mode'), null)
  })

  it('목록은 catalog 순서를 따른다', () => {
    assert.deepEqual(toggleAllowedName(['skip_level'], CATALOG, 'give_gold'), ['give_gold', 'skip_level'])
  })

  it('catalog 에서 사라진 이름은 목록에서 떨어진다', () => {
    assert.deepEqual(toggleAllowedName(['gone', 'give_gold'], CATALOG, 'god_mode'), ['give_gold', 'god_mode'])
  })

  it('마지막 하나를 끄면 빈 목록이다', () => {
    assert.deepEqual(toggleAllowedName(['give_gold'], CATALOG, 'give_gold'), [])
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
