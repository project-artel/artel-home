/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseDeveloperMacroDetail,
  parseDeveloperMacroList,
  parseDeveloperMacroSummary,
} from './developerMacroApi.ts'

/*
 * 아래 `documented` 는 `artel-orchestration-server` 의 `DeveloperMacroDtos.kt` (ARTEL-1088)
 * 에서 옮긴 모양이다. 그쪽이 아직 머지되지 않았으므로 "서버가 실제로 이렇게 준다" 가 아니라,
 * 그 DTO 대로 왔을 때 화면이 서고 nullable 인 자리가 비어도 깨지지 않는다는 것을 증명한다.
 */

const documented = {
  name: 'open_shop',
  parameters: ['item', 'count'],
  docstring: '상점을 열고 item 을 count 개 산다.',
  gameBuildId: '12',
  buildVersion: '0.1.0',
  buildLabel: '첫 빌드',
  version: 3,
  updatedAt: '2026-10-15T09:00:00Z',
  updatedBy: { id: '5', nickname: 'nubuli' },
}

test('명세대로의 목록 항목을 필드별로 읽는다', () => {
  assert.deepEqual(parseDeveloperMacroSummary(documented), {
    name: 'open_shop',
    parameters: ['item', 'count'],
    docstring: '상점을 열고 item 을 count 개 산다.',
    gameBuildId: '12',
    buildVersion: '0.1.0',
    buildLabel: '첫 빌드',
    version: 3,
    updatedAt: '2026-10-15T09:00:00Z',
    updatedBy: { id: '5', nickname: 'nubuli' },
  })
})

test('목록은 items 로 한 겹 싸여 오고, 최상위 배열도 같게 읽는다', () => {
  const fromEnvelope = parseDeveloperMacroList({ items: [documented] })
  assert.equal(fromEnvelope.length, 1)
  assert.equal(fromEnvelope[0].name, 'open_shop')
  assert.deepEqual(parseDeveloperMacroList([documented]), fromEnvelope)
})

test('봉투를 못 읽으면 빈 목록이 된다', () => {
  assert.deepEqual(parseDeveloperMacroList(null), [])
  assert.deepEqual(parseDeveloperMacroList({ items: 'nope' }), [])
})

test('이름이 없는 행만 버리고, 같은 이름은 먼저 온 것만 남긴다', () => {
  const parsed = parseDeveloperMacroList({
    items: [
      { ...documented, name: '' },
      { ...documented, name: undefined },
      documented,
      { ...documented, docstring: '나중에 온 같은 이름' },
      { ...documented, name: 'close_shop' },
    ],
  })
  assert.deepEqual(
    parsed.map((macro) => [macro.name, macro.docstring]),
    [
      ['open_shop', '상점을 열고 item 을 count 개 산다.'],
      ['close_shop', '상점을 열고 item 을 count 개 산다.'],
    ],
  )
})

test('지워진 사용자의 updatedBy 는 null 이고, 별명이 비어 와도 null 이다', () => {
  assert.equal(parseDeveloperMacroSummary({ ...documented, updatedBy: null })?.updatedBy, null)
  assert.equal(
    parseDeveloperMacroSummary({ ...documented, updatedBy: { id: '5', nickname: ' ' } })?.updatedBy,
    null,
  )
})

test('build id 는 숫자로 와도 문자열이 되고, label 이 비면 null 이다', () => {
  const parsed = parseDeveloperMacroSummary({ ...documented, gameBuildId: 12, buildLabel: '  ' })
  assert.equal(parsed?.gameBuildId, '12')
  assert.equal(parsed?.buildLabel, null)
})

test('빠진 칸은 화면이 감출 줄 아는 값으로 낮춘다', () => {
  assert.deepEqual(parseDeveloperMacroSummary({ name: 'bare' }), {
    name: 'bare',
    parameters: [],
    docstring: '',
    gameBuildId: '',
    buildVersion: '',
    buildLabel: null,
    version: null,
    updatedAt: '',
    updatedBy: null,
  })
})

test('parameter 는 선언 순서 그대로이고, 문자열이 아닌 값과 빈 이름은 뺀다', () => {
  const parsed = parseDeveloperMacroSummary({
    ...documented,
    parameters: ['b', 3, '', { name: 'x' }, 'a'],
  })
  assert.deepEqual(parsed?.parameters, ['b', 'a'])
})

test('version 은 1 이상의 정수만 읽는다', () => {
  assert.equal(parseDeveloperMacroSummary({ ...documented, version: 0 })?.version, null)
  assert.equal(parseDeveloperMacroSummary({ ...documented, version: '3' })?.version, null)
  assert.equal(parseDeveloperMacroSummary({ ...documented, version: 1.5 })?.version, null)
})

test('상세는 목록의 칸에 source 를 더하고, source 는 들여쓰기 그대로 통과한다', () => {
  const source = 'def open_shop(item, count):\n    """상점."""\n    tap(item)\n'
  const detail = parseDeveloperMacroDetail({ ...documented, source })
  assert.equal(detail?.source, source)
  assert.equal(detail?.name, 'open_shop')
  assert.equal(detail?.gameBuildId, '12')
  assert.equal(parseDeveloperMacroDetail({ ...documented })?.source, '')
  assert.equal(parseDeveloperMacroDetail({ source }), null)
})
