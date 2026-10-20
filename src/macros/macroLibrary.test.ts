/// <reference types="node" />
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GameBuild } from '../projects/gameTypes.ts'
import type { DeveloperMacroSummary } from './developerMacroTypes.ts'
import {
  agentLibraryItems,
  DEVELOPER_VIEW,
  developerLibraryItems,
  firstDocstringLine,
  formatMacroParam,
  latestVersionBuild,
  macroLookups,
  orderLibraryBuilds,
  parseMacroParam,
  resolveMacroView,
  searchMacros,
  selectViewParams,
} from './macroLibrary.ts'
import type { MacroSummary } from './macroTypes.ts'

function agentMacro(id: string, name: string, parameters: string[] = []): MacroSummary {
  return {
    id,
    name,
    parameters: parameters.map((parameter) => ({ name: parameter, type: null })),
    screens: [],
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

function developerMacro(name: string, extra: Partial<DeveloperMacroSummary> = {}): DeveloperMacroSummary {
  return {
    name,
    parameters: [],
    docstring: '',
    gameBuildId: '1',
    buildVersion: '0.1.0',
    buildLabel: null,
    version: 1,
    updatedAt: '2026-10-15T09:00:00Z',
    updatedBy: null,
    ...extra,
  }
}

function makeBuild(id: string, extra: Partial<GameBuild> = {}): GameBuild {
  return {
    id,
    projectId: '1',
    version: '0.1.0',
    label: null,
    notes: null,
    isEditor: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...extra,
  }
}

const older = makeBuild('1', { createdAt: '2026-08-01T00:00:00.000Z' })
const newer = makeBuild('2', { createdAt: '2026-09-01T00:00:00.000Z' })
const editor = makeBuild('3', { isEditor: true, createdAt: '2026-10-01T00:00:00.000Z' })
const builds = [editor, older, newer]

describe('화면마다 한 출처만', () => {
  it('build 화면의 줄은 전부 agent macro 이고 key 는 agent:<id> 다', () => {
    const items = agentLibraryItems([agentMacro('7', 'open_shop'), agentMacro('3', 'attack')])
    assert.deepEqual(items.map((item) => [item.origin, item.key]), [
      ['agent', 'agent:7'],
      ['agent', 'agent:3'],
    ])
  })

  it('developer macro 화면의 줄은 전부 developer macro 이고 key 는 developer:<name> 다', () => {
    const items = developerLibraryItems([developerMacro('buy_potion'), developerMacro('open_shop')])
    assert.deepEqual(items.map((item) => [item.origin, item.key]), [
      ['developer', 'developer:buy_potion'],
      ['developer', 'developer:open_shop'],
    ])
  })
})

describe('searchMacros', () => {
  const agentItems = agentLibraryItems([agentMacro('7', 'open_shop', ['item']), agentMacro('3', 'attack', ['card_a'])])
  const developerItems = developerLibraryItems([
    developerMacro('buy_potion', { parameters: ['count'], docstring: '물약을 산다.' }),
    developerMacro('Open_Gate'),
  ])
  const keys = (items: typeof agentItems, query: string) => searchMacros(items, query).map((item) => item.key)

  it('이름을 대소문자 없이 찾고, 지금 화면의 줄 안에서만 찾는다', () => {
    assert.deepEqual(keys(agentItems, 'OPEN'), ['agent:7'])
    assert.deepEqual(keys(developerItems, 'open'), ['developer:Open_Gate'])
  })

  it('parameter 이름을 찾는다', () => {
    assert.deepEqual(keys(agentItems, 'card_a'), ['agent:3'])
    assert.deepEqual(keys(developerItems, 'count'), ['developer:buy_potion'])
  })

  it('docstring 을 찾는다', () => {
    assert.deepEqual(keys(developerItems, '물약'), ['developer:buy_potion'])
  })

  it('빈 검색어는 전부 남긴다', () => {
    assert.equal(searchMacros(developerItems, '  '), developerItems)
  })
})

describe('resolveMacroView', () => {
  it('build 가 developer 면 developer macro 화면이다', () => {
    assert.deepEqual(resolveMacroView(builds, DEVELOPER_VIEW), { kind: 'developer' })
    assert.equal(DEVELOPER_VIEW, 'developer')
  })

  it('build id 면 그 build, 없거나 모르는 값이면 최신 build 다', () => {
    assert.equal(resolveMacroView(builds, '1')?.kind, 'build')
    assert.deepEqual(resolveMacroView(builds, '1'), { kind: 'build', build: older })
    assert.deepEqual(resolveMacroView(builds, null), { kind: 'build', build: newer })
    assert.deepEqual(resolveMacroView(builds, '999'), { kind: 'build', build: newer })
  })

  it('build 가 하나도 없으면 null 이다. developer 는 그래도 developer macro 화면이다', () => {
    assert.equal(resolveMacroView([], null), null)
    assert.deepEqual(resolveMacroView([], DEVELOPER_VIEW), { kind: 'developer' })
  })
})

describe('latestVersionBuild', () => {
  it('현재 는 최신 game version build 이고, editor build 는 될 수 없다', () => {
    assert.equal(latestVersionBuild(builds)?.id, '2')
    assert.equal(latestVersionBuild([editor]), undefined)
  })
})

describe('macro 주소 parameter', () => {
  it('출처를 앞에 달아 쓰고, 그대로 읽어 돌린다', () => {
    assert.equal(formatMacroParam({ origin: 'agent', id: '7' }), 'agent:7')
    assert.equal(formatMacroParam({ origin: 'developer', name: 'open_shop' }), 'developer:open_shop')
    assert.deepEqual(parseMacroParam('agent:7'), { origin: 'agent', id: '7' })
    assert.deepEqual(parseMacroParam('developer:open_shop'), { origin: 'developer', name: 'open_shop' })
  })

  it('접두어가 없거나 모르는 출처이거나 값이 비면 읽지 않는다', () => {
    assert.equal(parseMacroParam(null), null)
    assert.equal(parseMacroParam('7'), null)
    assert.equal(parseMacroParam('editor:7'), null)
    assert.equal(parseMacroParam('agent:'), null)
  })
})

describe('selectViewParams', () => {
  const after = (search: string, buildParam: string) =>
    selectViewParams(new URLSearchParams(search), buildParam).toString()

  it('developer macro 줄로 가면 build=developer 가 되고 agent 선택을 지운다', () => {
    assert.equal(after('build=2&macro=agent%3A7', DEVELOPER_VIEW), 'build=developer')
  })

  it('build 로 가면 developer 선택을 지운다', () => {
    assert.equal(after('build=developer&macro=developer%3Aopen_shop', '2'), 'build=2')
  })

  it('다른 build 로 가면 agent 선택도 지우고, 같은 build 를 다시 고르면 남긴다', () => {
    assert.equal(after('build=2&macro=agent%3A7', '1'), 'build=1')
    assert.equal(after('build=2&macro=agent%3A7', '2'), 'build=2&macro=agent%3A7')
  })

  it('developer macro 줄을 다시 고르면 developer 선택을 남기고, 다른 parameter 는 건드리지 않는다', () => {
    assert.equal(
      after('tab=x&build=developer&macro=developer%3Aopen_shop', DEVELOPER_VIEW),
      'tab=x&build=developer&macro=developer%3Aopen_shop',
    )
  })
})

describe('firstDocstringLine', () => {
  it('비어 있지 않은 첫 줄만 쓴다', () => {
    assert.equal(firstDocstringLine('\n  물약을 산다.\n두 번째 줄'), '물약을 산다.')
    assert.equal(firstDocstringLine(''), '')
  })
})

describe('orderLibraryBuilds', () => {
  it('game version 은 최신부터, editor build 는 맨 아래다', () => {
    assert.deepEqual(orderLibraryBuilds(builds).map((build) => build.id), ['2', '1', '3'])
  })
})

describe('macroLookups', () => {
  it('agent 가 key 로도 이름으로도 macro 를 고를 수 있게 둘 다 정확히 맞는 key 로 낸다', () => {
    const items = developerLibraryItems([developerMacro('buy_potion')])
    const [lookup] = macroLookups(items)
    assert.deepEqual(lookup.keys, ['developer:buy_potion', 'buy_potion'])
    assert.equal(lookup.entry, items[0])
    assert.equal(lookup.title, 'buy_potion')
  })
})
