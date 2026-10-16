/// <reference types="node" />
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocaleContext } from '../i18n/LocaleContext.ts'
import { messages } from '../i18n/messages.ts'
import type { GameBuild } from '../projects/gameTypes.ts'
import type { DeveloperMacroSummary } from './developerMacroTypes.ts'
import { mergeMacros } from './macroLibrary.ts'
import { MacroLibraryList } from './MacroLibraryList.tsx'
import { MacroSheet } from './MacroSheet.tsx'
import { MacroVersionList } from './MacroVersionList.tsx'

/*
 * Macro 라이브러리가 무엇을 그리는지 서버 렌더 결과의 글로 확인한다. effect 가 돌지 않으므로
 * source 읽기는 늘 로딩 상태로 그려진다.
 */

function renderKorean(element: ReactElement): string {
  const value = { locale: 'ko' as const, setLocale: () => {}, t: messages.ko }
  return renderToStaticMarkup(createElement(LocaleContext.Provider, { value }, element))
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

function developerMacro(name: string, extra: Partial<DeveloperMacroSummary> = {}): DeveloperMacroSummary {
  return {
    name,
    parameters: ['item', 'count'],
    docstring: '상점을 열고 item 을 count 개 산다.\n둘째 줄',
    gameBuildId: '2',
    buildVersion: '0.2.0',
    buildLabel: null,
    version: 1,
    updatedAt: '2026-10-15T09:00:00Z',
    updatedBy: { id: '5', nickname: 'nubuli' },
    ...extra,
  }
}

const older = makeBuild('1', { version: '0.1.0', createdAt: '2026-08-01T00:00:00.000Z' })
const selected = makeBuild('2', { version: '0.2.0', label: '베타', createdAt: '2026-09-01T00:00:00.000Z' })
const newer = makeBuild('3', { version: '0.3.0', createdAt: '2026-10-01T00:00:00.000Z' })
const editor = makeBuild('4', { version: '0.3.0', isEditor: true, createdAt: '2026-10-10T00:00:00.000Z' })
const builds = [editor, older, selected, newer]

describe('MacroVersionList', () => {
  const html = renderKorean(
    createElement(MacroVersionList, {
      builds,
      latestBuildId: '3',
      onSelect: () => {},
      selectedCount: 5,
      selectedId: '2',
    }),
  )
  const names = [...html.matchAll(/class="tcl-folder-name" title="([^"]+)"/g)].map((match) => match[1])

  it('버전 제목 아래 최신부터, editor build 는 맨 아래에 그린다', () => {
    assert.match(html, /<h2 class="tcl-folders-title">버전<\/h2>/)
    assert.deepEqual(names, ['0.3.0', '0.2.0 · 베타', '0.1.0', 'Editor · 0.3.0'])
  })

  it('최신 build 에 현재를 달고, 수는 고른 build 에만 붙인다', () => {
    assert.match(html, /0\.3\.0<\/span><span class="tcl-version-latest">현재<\/span>/)
    assert.match(html, /aria-current="true" class="tcl-folder tcl-version is-current"/)
    assert.deepEqual([...html.matchAll(/tcl-folder-count">(\d+)</g)].map((match) => match[1]), ['5'])
  })
})

describe('MacroLibraryList', () => {
  const items = mergeMacros(
    [{ id: '7', name: 'attack', parameters: [{ name: 'card_a', type: 'string' }], screens: [], updatedAt: '' }],
    [
      developerMacro('a_same', { gameBuildId: '2' }),
      developerMacro('b_older', { gameBuildId: '1', buildVersion: '0.1.0' }),
      developerMacro('c_newer', { gameBuildId: '3' }),
      developerMacro('d_editor', { gameBuildId: '4' }),
    ],
  )
  const html = renderKorean(
    createElement(MacroLibraryList, {
      builds,
      items,
      onOpen: () => {},
      selectedBuild: selected,
      selectedKey: 'developer:a_same',
    }),
  )

  it('한 줄에 출처 칩, 서명, docstring 첫 줄을 싣는다', () => {
    assert.match(html, /tct-origin--developer"[^>]*>개발자\(MCP\)</)
    assert.match(html, /tct-origin--agent"[^>]*>agent</)
    assert.match(html, /<span class="macro-row-name">a_same<\/span>\(item, count\)/)
    assert.match(html, /<span class="macro-row-name">attack<\/span>\(card_a\)/)
    assert.match(html, />상점을 열고 item 을 count 개 산다\.</)
    assert.doesNotMatch(html, /둘째 줄/)
  })

  it('고른 줄에 picked 가 붙는다', () => {
    assert.match(html, /<tr aria-current="true" class="tct-row picked">/)
  })

  it('build 가 다른 developer macro 에만 칩 하나가 선다', () => {
    const chips = [...html.matchAll(/macro-build-chip--differs"[^>]*>([^<]+)</g)].map((match) => match[1])
    assert.deepEqual(chips, ['이전 버전', '다른 버전', '다른 버전'])
    assert.match(html, /title="0\.1\.0 기준"/)
  })
})

describe('MacroSheet', () => {
  it('developer macro 의 메타 줄에 버전 · 기준 build · 등록자를 적는다', () => {
    const [item] = mergeMacros([], [developerMacro('b_older', { gameBuildId: '1', version: 3 })])
    const html = renderKorean(
      createElement(MacroSheet, { builds, item, onClose: () => {}, projectId: '1', selectedBuild: selected }),
    )
    assert.match(html, /<p class="tcl-sheet-meta">v3 · 0\.1\.0 기준 · nubuli 등록 · /)
    assert.match(html, /macro-build-chip--differs"[^>]*>이전 버전</)
    assert.match(html, /상점을 열고 item 을 count 개 산다\.\n둘째 줄/)
    assert.match(html, /source 를 불러오는 중…/)
  })

  it('agent macro 는 수정 시각과 screen 을 적는다', () => {
    const [item] = mergeMacros(
      [{ id: '7', name: 'attack', parameters: [], screens: [], updatedAt: '' }],
      [],
    )
    const html = renderKorean(
      createElement(MacroSheet, { builds, item, onClose: () => {}, projectId: '1', selectedBuild: selected }),
    )
    assert.match(html, /<p class="tcl-sheet-meta">수정 —<\/p>/)
    assert.match(html, /아직 screen 미정/)
    assert.doesNotMatch(html, /macro-build-chip/)
  })
})
