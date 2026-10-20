/// <reference types="node" />
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GameBuild } from '../projects/gameTypes.ts'
import { relationToSelectedBuild, writtenBuildText } from './developerMacroTypes.ts'

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

describe('relationToSelectedBuild', () => {
  const older = makeBuild('1', { createdAt: '2026-08-01T00:00:00.000Z' })
  const middle = makeBuild('2', { createdAt: '2026-09-01T00:00:00.000Z' })
  const newer = makeBuild('3', { createdAt: '2026-10-01T00:00:00.000Z' })
  const editor = makeBuild('4', { isEditor: true, createdAt: '2026-10-10T00:00:00.000Z' })
  const builds = [older, middle, newer, editor]

  it('같은 build 면 same 이다', () => {
    assert.equal(relationToSelectedBuild('2', middle, builds), 'same')
    assert.equal(relationToSelectedBuild('4', editor, builds), 'same')
  })

  it('고른 build 보다 먼저 올라온 build 면 older, 나중이면 newer 다', () => {
    assert.equal(relationToSelectedBuild('1', middle, builds), 'older')
    assert.equal(relationToSelectedBuild('3', middle, builds), 'newer')
  })

  it('순서는 목록 위치가 아니라 createdAt 으로 정한다', () => {
    assert.equal(relationToSelectedBuild('1', middle, [newer, middle, older]), 'older')
  })

  it('editor build 가 어느 쪽에 끼어도 different 다', () => {
    assert.equal(relationToSelectedBuild('4', middle, builds), 'different')
    assert.equal(relationToSelectedBuild('1', editor, builds), 'different')
  })

  it('목록에서 찾지 못한 build 나 읽지 못한 id 는 different 다', () => {
    assert.equal(relationToSelectedBuild('999', middle, builds), 'different')
    assert.equal(relationToSelectedBuild('', middle, builds), 'different')
  })

  it('createdAt 이 같거나 비면 순서를 말하지 않는다', () => {
    const twin = makeBuild('5', { createdAt: middle.createdAt })
    const undated = makeBuild('6', { createdAt: '' })
    assert.equal(relationToSelectedBuild('5', middle, [...builds, twin]), 'different')
    assert.equal(relationToSelectedBuild('6', middle, [...builds, undated]), 'different')
  })
})

describe('writtenBuildText', () => {
  const labelled = makeBuild('1', { version: '0.1.0', label: '첫 빌드' })
  const editor = makeBuild('2', { version: '0.2.0', isEditor: true })
  const builds = [labelled, editor]
  const fromResponse = { buildVersion: '9.9.9', buildLabel: null }

  it('작업공간 목록에서 찾으면 build picker 와 같은 글을 쓴다', () => {
    assert.equal(writtenBuildText({ ...fromResponse, gameBuildId: '1' }, builds, 'Editor'), '0.1.0 · 첫 빌드')
    assert.equal(writtenBuildText({ ...fromResponse, gameBuildId: '2' }, builds, 'Editor'), 'Editor · 0.2.0')
  })

  it('못 찾으면 응답의 version 과 label 로 같은 모양을 만든다', () => {
    assert.equal(writtenBuildText({ ...fromResponse, gameBuildId: '7' }, builds, 'Editor'), '9.9.9')
    assert.equal(
      writtenBuildText({ gameBuildId: '7', buildVersion: '9.9.9', buildLabel: '핫픽스' }, builds, 'Editor'),
      '9.9.9 · 핫픽스',
    )
    assert.equal(writtenBuildText({ gameBuildId: '7', buildVersion: '', buildLabel: null }, builds, 'Editor'), '—')
  })
})
