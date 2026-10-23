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
 * 고급 설정의 첫 줄이 `engine` 이고, `planner_executer` 면 아래 tool loop 축이 잠긴다. 두 엔진 모두 FREE
 * 시나리오를 돌리므로(ARTEL-1149) "실행 전 점검" 은 엔진 때문에 실행을 막지 않는다.
 */

function renderKorean(element: ReactElement): string {
  const value = { locale: 'ko' as const, setLocale: () => {}, t: messages.ko }
  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(LocaleContext.Provider, { value }, element)),
  )
}

const advanced = messages.ko.qa.panel.advanced
const panel = messages.ko.qa.launch.panel

describe('ArchSettings', () => {
  const render = (selection: QaArchSelection) =>
    renderKorean(createElement(ArchSettings, { onChange: () => {}, readsImages: true, selection }))

  it('첫 줄이 engine 이고 기본 엔진이 골라져 있다', () => {
    const html = render({ label: '' })
    const engineAt = html.indexOf('<code translate="no">engine</code>')
    assert.ok(engineAt >= 0)
    assert.ok(engineAt < html.indexOf('<code translate="no">phase_cycle</code>'))
    assert.match(html, /<option value="agent" selected="">기본<\/option>/)
    assert.match(html, /<option value="planner_executer">planner–executer<\/option>/)
    assert.doesNotMatch(html, /<fieldset[^>]*disabled/)
    assert.equal(html.includes(advanced.engineLocked), false)
  })

  it('planner_executer 면 tool loop 축을 잠그고 고른 값은 그대로 보여 준다', () => {
    const html = render({ label: 'arm', engine: 'planner_executer', phase_cycle: 'off' })
    assert.match(html, /<fieldset class="qa-advanced-fieldset" disabled="">/)
    assert.ok(html.includes(advanced.engineLocked))
    assert.match(html, /<option value="off" selected="">off<\/option>/)
    // engine 선택은 잠금 틀 밖에 있어야 되돌릴 수 있다.
    assert.ok(html.indexOf('<code translate="no">engine</code>') < html.indexOf('<fieldset'))
  })

  it('제목 옆 변경 수는 엔진만 바꿔도 1 이고, planner_executer 면 남겨 둔 knob 을 세지 않는다', () => {
    assert.ok(render({ label: '', engine: 'planner_executer' }).includes(advanced.changed(1)))
    assert.ok(render({ label: 'a', engine: 'planner_executer', macros: 'off', skills: 'off' }).includes(advanced.changed(1)))
    assert.ok(render({ label: 'a', macros: 'off', skills: 'off' }).includes(advanced.changed(2)))
    assert.equal(render({ label: '' }).includes('qa-advanced-count'), false)
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

  it('planner_executer 는 실행을 막지 않고, label 도 요구하지 않는다', () => {
    const html = render({ label: '', engine: 'planner_executer', macros: 'off' })
    assert.equal(html.includes(panel.archLabelMissing), false)
    assert.equal(runBlocked(html), false)
  })

  it('agent 엔진도 실행을 막지 않는다', () => {
    assert.equal(runBlocked(render({ label: '' })), false)
  })
})
