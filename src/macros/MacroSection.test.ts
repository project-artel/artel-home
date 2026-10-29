/// <reference types="node" />
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { LocaleContext } from '../i18n/LocaleContext.ts'
import { messages } from '../i18n/messages.ts'
import type { GameBuild } from '../projects/gameTypes.ts'
import { WorkspaceContext, type WorkspaceValue } from '../projects/workspace/workspaceContext.ts'
import type { DeveloperMacroSummary } from './developerMacroTypes.ts'
import { agentLibraryItems, developerLibraryItems } from './macroLibrary.ts'
import { MacroLibraryList } from './MacroLibraryList.tsx'
import { MacroSection } from './MacroSection.tsx'
import { MacroSheet } from './MacroSheet.tsx'
import { MacroVersionList } from './MacroVersionList.tsx'

/*
 * Macro 라이브러리가 무엇을 그리는지 서버 렌더 결과의 글로 확인한다. effect 가 돌지 않으므로
 * 목록과 source 읽기는 늘 첫 로딩 상태로 그려진다. 그래서 `MacroSection` 에서는 어느 화면이
 * 섰는지(제목 칩, `버전` 목록의 current 줄)만 보고, 줄은 `MacroLibraryList` 를 직접 그려 본다.
 *
 * 파일 이름이 `macroLibrary.test.ts` 와 대소문자만 다르면 macOS 의 기본 파일 시스템에서 같은
 * 파일이 된다. 그래서 이 파일은 `MacroSection.test.ts` 다.
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
  const render = (selectedView: string, developerCount: number | null) =>
    renderKorean(
      createElement(MacroVersionList, {
        builds,
        developerCount,
        latestBuildId: '3',
        onSelect: () => {},
        selectedCount: 5,
        selectedView,
      }),
    )
  const countsOf = (html: string) => [...html.matchAll(/tcl-folder-count">(\d+)</g)].map((match) => match[1])
  const html = render('2', 12)
  const names = [...html.matchAll(/class="tcl-folder-name"[^>]*>([^<]+)</g)].map((match) => match[1])

  it('build 는 최신부터, editor build 다음 맨 아래에 개발자 macro (MCP) 줄이 선다', () => {
    assert.match(html, /<h2 class="tcl-folders-title">버전<\/h2>/)
    assert.deepEqual(names, ['0.3.0 · Standalone', '0.2.0 · 베타 · Standalone', '0.1.0 · Standalone', 'Editor · 0.3.0', '개발자 macro (MCP)'])
    assert.match(html, /class="tcl-folder tcl-version tcl-version--none"[^>]*><span class="tcl-folder-name">개발자 macro \(MCP\)/)
  })

  it('최신 build 에 현재를 달고, 수는 고른 build 와 개발자 macro 줄에 붙인다', () => {
    assert.match(html, /0\.3\.0 · Standalone<\/span><span class="tcl-version-latest">현재<\/span>/)
    assert.match(html, /aria-current="true" class="tcl-folder tcl-version is-current"/)
    assert.deepEqual(countsOf(html), ['5', '12'])
  })

  it('개발자 macro 줄을 고르면 그 줄이 current 이고 build 의 수는 없다', () => {
    const developerHtml = render('developer', 12)
    assert.match(developerHtml, /aria-current="true" class="tcl-folder tcl-version tcl-version--none is-current"/)
    assert.deepEqual(countsOf(developerHtml), ['12'])
  })

  it('개발자 macro 를 아직 못 읽었으면 그 줄에 수가 없다', () => {
    assert.deepEqual(countsOf(render('2', null)), ['5'])
  })
})

describe('MacroLibraryList', () => {
  it('build 화면: agent macro 줄에는 출처 칩도 build 칩도 없다', () => {
    const html = renderKorean(
      createElement(MacroLibraryList, {
        builds,
        items: agentLibraryItems([
          { id: '7', name: 'attack', parameters: [{ name: 'card_a', type: 'string' }], screens: [], updatedAt: '' },
        ]),
        onOpen: () => {},
        referenceBuild: newer,
        selectedKey: 'agent:7',
      }),
    )
    assert.match(html, /<span class="macro-row-name">attack<\/span>\(card_a\)/)
    assert.match(html, /<tr aria-current="true" class="tct-row picked">/)
    assert.doesNotMatch(html, /tct-origin|macro-build-chip/)
  })

  it('developer macro 화면: 칩은 현재 build 와 비교하고, 같으면 서지 않는다', () => {
    const html = renderKorean(
      createElement(MacroLibraryList, {
        builds,
        items: developerLibraryItems([
          developerMacro('a_current', { gameBuildId: '3', buildVersion: '0.3.0' }),
          developerMacro('b_older', { gameBuildId: '1', buildVersion: '0.1.0' }),
          developerMacro('c_also_older', { gameBuildId: '2' }),
          developerMacro('d_editor', { gameBuildId: '4' }),
        ]),
        onOpen: () => {},
        referenceBuild: newer,
        selectedKey: null,
      }),
    )
    const chips = [...html.matchAll(/macro-build-chip--differs"[^>]*>([^<]+)</g)].map((match) => match[1])
    assert.deepEqual(chips, ['이전 버전', '이전 버전', '다른 버전'])
    assert.match(html, /title="0\.1\.0 · Standalone 기준"/)
    assert.match(html, /<span class="macro-row-name">a_current<\/span>\(item, count\)/)
    assert.match(html, />상점을 열고 item 을 count 개 산다\.</)
    assert.doesNotMatch(html, /둘째 줄|tct-origin/)
  })

  it('현재 build 가 없으면(editor build 뿐) 칩을 그리지 않는다', () => {
    const html = renderKorean(
      createElement(MacroLibraryList, {
        builds,
        items: developerLibraryItems([developerMacro('b_older', { gameBuildId: '1' })]),
        onOpen: () => {},
        referenceBuild: undefined,
        selectedKey: null,
      }),
    )
    assert.doesNotMatch(html, /macro-build-chip/)
  })
})

describe('MacroSection', () => {
  function renderSection(search: string): string {
    // 이 화면이 읽는 것은 `builds` 와 `projectId` 둘뿐이다.
    const workspace = { builds, projectId: '1' } as unknown as WorkspaceValue
    return renderKorean(
      createElement(
        WorkspaceContext.Provider,
        { value: workspace },
        createElement(MemoryRouter, { initialEntries: [`/macros${search}`] }, createElement(MacroSection)),
      ),
    )
  }

  it('build 화면의 제목 칩은 현재 버전 <build> 다', () => {
    const html = renderSection('?build=2')
    assert.match(html, /현재 버전 <strong>0\.3\.0 · Standalone<\/strong>/)
    assert.match(html, /aria-current="true" class="tcl-folder tcl-version is-current"[^>]*><span class="tcl-folder-name" title="0\.2\.0 · 베타 · Standalone">/)
  })

  it('build=developer 면 개발자 macro 화면이고 제목 칩이 개발자 macro 다', () => {
    const html = renderSection('?build=developer')
    assert.match(html, /<span class="tcl-current-version"[^>]*><strong>개발자 macro<\/strong><\/span>/)
    assert.doesNotMatch(html, /현재 버전 <strong>/)
    assert.match(html, /tcl-version--none is-current/)
  })
})

describe('MacroSheet', () => {
  it('developer macro 의 메타 줄에 버전 · 기준 build · 등록자를 적고, 칩은 현재 build 와 비교한다', () => {
    const [item] = developerLibraryItems([developerMacro('b_older', { gameBuildId: '1', version: 3 })])
    const html = renderKorean(
      createElement(MacroSheet, {
        agentBuildId: null,
        builds,
        item,
        onClose: () => {},
        projectId: '1',
        referenceBuild: newer,
      }),
    )
    assert.match(html, /<p class="tcl-sheet-meta">v3 · 0\.1\.0 · Standalone 기준 · nubuli 등록 · /)
    assert.match(html, /macro-build-chip--differs"[^>]*>이전 버전</)
    assert.match(html, /상점을 열고 item 을 count 개 산다\.\n둘째 줄/)
    assert.match(html, /source 를 불러오는 중…/)
  })

  it('agent macro 는 수정 시각과 screen 을 적고 칩이 없다', () => {
    const [item] = agentLibraryItems([{ id: '7', name: 'attack', parameters: [], screens: [], updatedAt: '' }])
    const html = renderKorean(
      createElement(MacroSheet, {
        agentBuildId: selected.id,
        builds,
        item,
        onClose: () => {},
        projectId: '1',
        referenceBuild: newer,
      }),
    )
    assert.match(html, /<p class="tcl-sheet-meta">수정 —<\/p>/)
    assert.match(html, /아직 screen 미정/)
    assert.doesNotMatch(html, /macro-build-chip|tct-origin/)
  })
})
