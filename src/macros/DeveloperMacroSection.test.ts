/// <reference types="node" />
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { LocaleContext } from '../i18n/LocaleContext.ts'
import { messages } from '../i18n/messages.ts'
import type { GameBuild } from '../projects/gameTypes.ts'
import { DeveloperMacroDetail } from './DeveloperMacroDetail.tsx'
import { DeveloperMacroEmpty, DeveloperMacroList } from './DeveloperMacroList.tsx'
import { DeveloperMacroSection } from './DeveloperMacroSection.tsx'
import type { DeveloperMacroSummary } from './developerMacroTypes.ts'

/*
 * 개발자 macro 묶음이 무엇을 그리는지를 서버 렌더 결과의 글로 확인한다.
 *
 * effect 가 돌지 않으므로 `DeveloperMacroSection` 은 늘 첫 로드 상태로 그려진다. 그래서
 * 그 컴포넌트에서는 머리글과 출처 칩만 보고, 목록과 빈 상태는 그것을 그리는 컴포넌트를
 * 직접 그려 본다.
 */

function renderKorean(element: ReactElement): string {
  const value = { locale: 'ko' as const, setLocale: () => {}, t: messages.ko }
  return renderToStaticMarkup(
    createElement(LocaleContext.Provider, { value }, createElement(MemoryRouter, null, element)),
  )
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

function makeMacro(name: string, extra: Partial<DeveloperMacroSummary> = {}): DeveloperMacroSummary {
  return {
    name,
    parameters: ['item', 'count'],
    docstring: '상점을 열고 item 을 count 개 산다.',
    gameBuildId: '1',
    buildVersion: '0.1.0',
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
const builds = [older, selected, newer, editor]

function renderList(macros: DeveloperMacroSummary[]): string {
  return renderKorean(
    createElement(DeveloperMacroList, {
      builds,
      macros,
      onSelect: () => {},
      selectedBuild: selected,
      selectedName: null,
    }),
  )
}

describe('DeveloperMacroSection', () => {
  it('머리글에 개발자 macro 와 MCP 출처 칩을 그린다', () => {
    const html = renderKorean(
      createElement(DeveloperMacroSection, { builds, projectId: '1', selectedBuild: selected }),
    )
    assert.match(html, /<h3[^>]*class="macro-developer-title"[^>]*>개발자 macro<span class="macro-origin-chip">MCP<\/span>/)
    assert.match(html, /개발자 macro 를 불러오는 중…/)
  })
})

describe('DeveloperMacroList', () => {
  it('한 줄에 이름·parameter·docstring·등록자를 싣는다', () => {
    const html = renderList([makeMacro('open_shop', { gameBuildId: '2' })])
    assert.match(html, /<span class="macro-row-name">open_shop<\/span>\(item, count\)/)
    assert.match(html, /상점을 열고 item 을 count 개 산다\./)
    assert.match(html, /nubuli 등록 · /)
  })

  it('고른 build 와 같으면 칩을 하나도 그리지 않는다', () => {
    const html = renderList([makeMacro('open_shop', { gameBuildId: '2' })])
    assert.doesNotMatch(html, /macro-build-chip/)
    assert.doesNotMatch(html, /기준/)
  })

  it('다르면 칩 하나만 선다. older 만 이전 버전이고 나머지는 다른 버전이다', () => {
    const html = renderList([
      makeMacro('a_older', { gameBuildId: '1' }),
      makeMacro('b_newer', { gameBuildId: '3' }),
      makeMacro('c_editor', { gameBuildId: '4' }),
      makeMacro('d_missing', { gameBuildId: '999', buildVersion: '9.9.9' }),
    ])
    const chips = [...html.matchAll(/class="macro-build-chip[^"]*"[^>]*>([^<]+)</g)].map(
      (match) => match[1],
    )
    assert.deepEqual(chips, ['이전 버전', '다른 버전', '다른 버전', '다른 버전'])
    // 기준 build 는 칩 글이 아니라 `title` 에만 남는다.
    assert.match(html, /title="Editor · 0\.3\.0 기준"/)
    assert.match(html, /title="9\.9\.9 기준"/)
  })

  it('등록한 사람을 지웠으면 시각만 남는다', () => {
    const html = renderList([makeMacro('open_shop', { updatedBy: null })])
    assert.match(html, /등록 /)
    assert.doesNotMatch(html, /nubuli/)
  })
})

describe('DeveloperMacroDetail', () => {
  function renderDetail(gameBuildId: string): string {
    return renderKorean(
      createElement(DeveloperMacroDetail, {
        builds,
        macro: { ...makeMacro('open_shop', { gameBuildId }), source: 'def open_shop(item, count):\n    pass\n' },
        onRetry: () => {},
        selectedBuild: selected,
        status: 'ready',
      }),
    )
  }

  it('기준 build 는 메타 줄의 글로 적는다', () => {
    const html = renderDetail('1')
    assert.match(html, /v1 · 0\.1\.0 기준 · nubuli 등록 · /)
    assert.match(html, /def open_shop\(item, count\):/)
  })

  it('칩은 목록과 같이 다를 때만 하나 선다', () => {
    assert.match(renderDetail('1'), /macro-build-chip--differs"[^>]*>이전 버전</)
    assert.doesNotMatch(renderDetail('2'), /macro-build-chip/)
  })
})

describe('DeveloperMacroEmpty', () => {
  it('없다는 사실과 MCP 연결로 등록한다는 것만 적는다', () => {
    const html = renderKorean(createElement(DeveloperMacroEmpty))
    assert.match(html, /등록된 개발자 macro 가 없습니다/)
    assert.match(html, /개발자 macro 는 MCP 연결로 등록됩니다\./)
  })
})
