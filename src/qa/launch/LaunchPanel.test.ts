/// <reference types="node" />
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { LocaleContext } from '../../i18n/LocaleContext.ts'
import { messages } from '../../i18n/messages.ts'
import type { GameInstance } from '../../projects/gameTypes.ts'
import type { TestRun } from '../../testRuns/testRunApi.ts'
import type { QaArchSelection } from '../qaArch.ts'
import type { QaModel } from '../qaTypes.ts'
import { ArchSettings } from './ArchSettings.tsx'
import { LaunchPanel } from './LaunchPanel.tsx'

/*
 * QA 실행 설정의 엔진 선택(ARTEL-1119)이 무엇을 그리는지 서버 렌더 결과의 글로 확인한다.
 * 엔진은 에이전트와 추론 강도 사이의 버튼이고 늘 하나가 켜져 있다. `planner_executer` 면 고급 설정의 tool loop
 * 축이 잠긴다. 두 엔진 모두 FREE 시나리오를 돌리므로(ARTEL-1149) "실행 전 점검" 은 엔진 때문에 실행을 막지 않는다.
 */

function renderKorean(element: ReactElement): string {
  const value = { locale: 'ko' as const, setLocale: () => {}, t: messages.ko }
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(LocaleContext.Provider, { value }, element)),
  ).replaceAll('&amp;', '&') // 문구의 `Plan & Execute` 를 그대로 비교한다.
}

const advanced = messages.ko.qa.panel.advanced
const panel = messages.ko.qa.launch.panel

describe('ArchSettings', () => {
  const render = (selection: QaArchSelection) =>
    renderKorean(createElement(ArchSettings, { onChange: () => {}, readsImages: true, selection }))

  it('엔진 선택은 고급 설정에 없고, agent 면 축을 잠그지 않는다', () => {
    const html = render({ label: '' })
    assert.equal(html.includes('<code translate="no">engine</code>'), false)
    assert.ok(html.includes('<code translate="no">phase_cycle</code>'))
    assert.doesNotMatch(html, /<fieldset[^>]*disabled/)
    assert.equal(html.includes(advanced.engineLocked), false)
  })

  it('planner_executer 면 tool loop 축을 잠그고 고른 값은 그대로 보여 준다', () => {
    const html = render({ label: 'arm', engine: 'planner_executer', phase_cycle: 'off' })
    assert.match(html, /<fieldset class="qa-advanced-fieldset" disabled="">/)
    assert.ok(html.includes(advanced.engineLocked))
    assert.match(html, /<option value="off" selected="">off<\/option>/)
  })

})

describe('LaunchPanel', () => {
  const instance: GameInstance = {
    id: '3',
    projectId: '1',
    name: '테스트 게임',
    platform: 'unity',
    connected: true,
    lastConnectedAt: '2026-10-16T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-16T00:00:00Z',
    lastGameBuild: null,
  }
  const model: QaModel = {
    id: 'm',
    label: '모델',
    provider: 'anthropic',
    supportsVision: true,
    inputModalities: ['text', 'image'],
    multimodal: true,
    reasoning: null,
    keySource: 'platform',
    keyProvider: null,
    keyRegistered: true,
    keyHint: null,
    pricing: null,
  }
  const run: TestRun = {
    id: '70',
    projectId: '1',
    name: '런',
    description: null,
    createdAt: '2026-10-01T00:00:00Z',
    gameBuild: null,
    folderId: null,
    scenarioCount: 3,
    lastQaRun: null,
  }

  const render = (arch: QaArchSelection) =>
    renderKorean(
      createElement(LaunchPanel, {
        projectId: '1',
        run,
        builds: [],
        instances: [instance],
        instanceId: '3',
        onInstanceChange: () => {},
        models: [model],
        modelKey: 'platform:m',
        onModelChange: () => {},
        reasoningEnabled: false,
        onReasoningEnabled: () => {},
        reasoningValue: 0,
        onReasoningValue: () => {},
        arch,
        onArchChange: () => {},
        etaMs: null,
        onManageConsoles: () => {},
        runShortcut: 0,
      }),
    )
  const runBlocked = (html: string) => /<button aria-disabled="true" class="ql-run is-blocked"/.test(html)

  const onEngines = (html: string) =>
    [...html.matchAll(/<button aria-checked="true" class="ql-seg-item is-on"[^>]*>([^<]*)</g)].map((match) => match[1])

  it('엔진은 에이전트 다음에 있고, 기본은 워크플로우다', () => {
    const html = render({ label: '' })
    const engineAt = html.indexOf(`aria-label="${panel.engineTitle}"`)
    assert.ok(engineAt > html.indexOf(panel.agentLabel))
    assert.ok(engineAt < html.indexOf(panel.checksTitle))
    assert.deepEqual(onEngines(html), [panel.engines.agent])
  })

  it('planner_executer 를 고르면 Plan & Execute 만 켜져 있다', () => {
    assert.deepEqual(onEngines(render({ label: '', engine: 'planner_executer' })), [panel.engines.planner_executer])
  })

  it('제목 옆 변경 수는 엔진을 세지 않고, planner_executer 면 남겨 둔 knob 도 세지 않는다', () => {
    assert.equal(render({ label: '', engine: 'planner_executer' }).includes('qa-advanced-count'), false)
    assert.equal(render({ label: 'a', engine: 'planner_executer', macros: 'off', skills: 'off' }).includes('qa-advanced-count'), false)
    assert.ok(render({ label: 'a', macros: 'off', skills: 'off' }).includes(advanced.changed(2)))
    assert.equal(render({ label: '' }).includes('qa-advanced-count'), false)
  })


  it('planner_executer 는 실행을 막지 않고, label 도 요구하지 않는다', () => {
    const html = render({ label: '', engine: 'planner_executer', macros: 'off' })
    assert.equal(html.includes(panel.archLabelMissing), false)
    assert.equal(runBlocked(html), false)
  })

  it('agent 엔진도 실행을 막지 않는다', () => {
    assert.equal(runBlocked(render({ label: '' })), false)
  })
})
