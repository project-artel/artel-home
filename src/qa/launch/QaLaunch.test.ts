import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleContext } from '../../i18n/LocaleContext'
import { messages } from '../../i18n/messages'
import { WorkspaceContext, type WorkspaceValue } from '../../projects/workspace/workspaceContext'
import { QaLaunch } from './QaLaunch'

test('QA 진입 시 Workspace의 이전 개수로 점검하지 않고 최신 목록을 기다린다', () => {
  for (const scenarioCount of [0, 1]) {
    const workspace = {
      projectId: '10',
      runs: [{ id: '32', scenarioCount }],
    } as WorkspaceValue
    const html = renderToStaticMarkup(createElement(LocaleContext.Provider, {
      value: { locale: 'ko', setLocale: () => {}, t: messages.ko },
    }, createElement(WorkspaceContext.Provider, { value: workspace }, createElement(QaLaunch))))

    assert.ok(html.includes(messages.ko.scenarios.runList.loading))
    assert.match(html, /aria-busy="true"/)
    assert.ok(!html.includes(messages.ko.qa.launch.panel.noScenarios))
    assert.ok(!html.includes('ql-run is-blocked'))
    assert.ok(!html.includes('<button'))
  }
})
