import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseBuild, parseInstance } from './gameApi'
import { buildOptionText, selectBuild, versionBuilds } from './gameBuilds'
import type { GameBuild } from './gameTypes'

function makeBuild(id: string, extra: Partial<GameBuild> = {}): GameBuild {
  return {
    id,
    projectId: '1',
    version: '1.4.0',
    label: null,
    notes: null,
    isEditor: false,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...extra,
  }
}

describe('parseBuild isEditor', () => {
  const base = { id: '7', version: '1.4.0' }

  it('필드가 없는 옛 서버 응답은 null(모름)로 읽는다', () => {
    assert.equal(parseBuild({ id: '7', version: '1.4.0' })?.isEditor, null)
  })

  it('true 와 false 를 그대로 읽는다', () => {
    assert.equal(parseBuild({ id: '7', version: '1.4.0', isEditor: true })?.isEditor, true)
    assert.equal(parseBuild({ id: '7', version: '1.4.0', isEditor: false })?.isEditor, false)
  })

  it('boolean 이 아닌 값은 null 로 읽는다', () => {
    assert.equal(parseBuild({ ...base, isEditor: 'true' })?.isEditor, null)
    assert.equal(parseBuild({ ...base, isEditor: null })?.isEditor, null)
  })
})

describe('parseInstance lastGameBuild isEditor', () => {
  const instance = (build: Record<string, unknown>) => ({ id: '1', name: 'pc', lastGameBuild: { gameBuildId: '7', version: '1.2.0', ...build } })

  it('없는 값은 null, false 와 true 는 그대로 읽는다', () => {
    assert.equal(parseInstance(instance({}))?.lastGameBuild?.isEditor, null)
    assert.equal(parseInstance(instance({ isEditor: false }))?.lastGameBuild?.isEditor, false)
    assert.equal(parseInstance(instance({ isEditor: true }))?.lastGameBuild?.isEditor, true)
  })
})

describe('selectBuild', () => {
  const older = makeBuild('1', { createdAt: '2026-08-01T00:00:00.000Z' })
  const newer = makeBuild('2', { createdAt: '2026-09-01T00:00:00.000Z' })
  const editor = makeBuild('3', { isEditor: true, createdAt: '2026-10-01T00:00:00.000Z' })

  it('요청한 id 가 있으면 editor build 라도 그것을 고른다', () => {
    assert.equal(selectBuild([older, newer, editor], '3')?.id, '3')
  })

  it('id 가 없거나 모르는 값이면 editor 가 아닌 build 중 가장 최신을 고른다', () => {
    assert.equal(selectBuild([older, newer, editor], null)?.id, '2')
    assert.equal(selectBuild([older, newer, editor], '999')?.id, '2')
  })

  it('editor 가 목록 앞에 있어도 editor 를 기본으로 고르지 않는다', () => {
    assert.equal(selectBuild([editor, older], null)?.id, '1')
  })

  it('editor build 만 있으면 그것을 고른다', () => {
    assert.equal(selectBuild([editor], null)?.id, '3')
  })

  it('createdAt 이 같으면 목록에서 앞선 build 를 고른다', () => {
    const first = makeBuild('4', { createdAt: '2026-09-01T00:00:00.000Z' })
    const second = makeBuild('5', { createdAt: '2026-09-01T00:00:00.000Z' })
    assert.equal(selectBuild([first, second], null)?.id, '4')
  })

  it('목록이 비면 undefined 를 낸다', () => {
    assert.equal(selectBuild([], null), undefined)
  })
})

describe('versionBuilds', () => {
  it('editor build 를 뺀다', () => {
    const builds = [makeBuild('1'), makeBuild('2', { isEditor: true })]
    assert.deepEqual(versionBuilds(builds).map((build) => build.id), ['1'])
  })

  it('editor build 만 있으면 빈 목록을 낸다', () => {
    assert.deepEqual(versionBuilds([makeBuild('2', { isEditor: true })]), [])
  })
})

describe('buildOptionText', () => {
  it('Editor build도 버전 바로 다음에 실행 환경을 표시한다', () => {
    const editor = makeBuild('3', { isEditor: true, version: '1.6.0', label: 'ignored' })
    assert.equal(buildOptionText(editor, 'Editor'), '1.6.0 · Editor')
  })

  it('Standalone 버전은 label 여부와 관계없이 환경을 표시한다', () => {
    assert.equal(buildOptionText(makeBuild('1', { label: 'QA' }), 'Editor'), '1.4.0 · Standalone · QA')
    assert.equal(buildOptionText(makeBuild('1', { label: '' }), 'Editor'), '1.4.0 · Standalone')
    assert.equal(buildOptionText(makeBuild('1', { label: null }), 'Editor'), '1.4.0 · Standalone')
    assert.equal(buildOptionText(makeBuild('1', { label: '   ' }), 'Editor'), '1.4.0 · Standalone')
  })
})
