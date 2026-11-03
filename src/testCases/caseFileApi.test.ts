/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileNameOf, parseCaseImportPreview, parseCaseImportResult } from './caseFileApi.ts'

/*
 * TC 파일 가져오기 · 내보내기(ARTEL-1328). 응답 모양은 서버 `CaseFileIntegrationTest` 가 돌려준 것과 같은 꼴을 손으로 옮겼다.
 */

test('한글 파일 이름은 filename* 에서 읽는다', () => {
  const header = "attachment; filename=\"=?UTF-8?Q?x?=\"; filename*=UTF-8''Word%20Venture_1.4.0_TC_20261103.xlsx"
  assert.equal(fileNameOf(header, 'test-cases.xlsx'), 'Word Venture_1.4.0_TC_20261103.xlsx')
  assert.equal(fileNameOf("attachment; filename*=UTF-8''%ED%8C%8C%EC%9D%BC.csv", 'x.csv'), '파일.csv')
  assert.equal(fileNameOf('attachment; filename="plain.csv"', 'x.csv'), 'plain.csv')
  assert.equal(fileNameOf(null, 'test-cases.csv'), 'test-cases.csv')
})

test('미리 보기는 줄마다 처리 · 바뀌는 칸 · 못 넣는 까닭을 읽는다', () => {
  const preview = parseCaseImportPreview({
    format: 'csv',
    rows: [
      { line: 2, status: 'EDIT', testCaseId: '7000', caseNumber: 'TC-012', kind: 'FUNCTION', scene: '광장', step: '말을 건다', expectedValue: '의뢰', changes: ['조작'] },
      { line: 3, status: 'NEW', kind: 'EXCEPTION', scene: '숲', step: '고양이 없이 간다', expectedValue: '보상 없음', changes: [] },
      { line: 4, status: 'REJECTED', scene: '숲', step: '무엇', expectedValue: '무엇', reason: '이 프로젝트에 TC-999 이(가) 없습니다.' },
      { line: 5, status: 'WHAT', scene: '', step: '', expectedValue: '' },
    ],
    counts: { new: 1, edit: 1, same: 0, rejected: 1 },
  })
  assert.equal(preview.format, 'csv')
  assert.deepEqual(preview.rows.map((row) => row.status), ['EDIT', 'NEW', 'REJECTED'], '모르는 처리는 버린다')
  assert.equal(preview.rows[0].caseNumber, 'TC-012')
  assert.deepEqual(preview.rows[0].changes, ['조작'])
  assert.equal(preview.rows[1].kind, 'EXCEPTION')
  assert.match(preview.rows[2].reason ?? '', /TC-999/)
  assert.deepEqual(preview.counts, { new: 1, edit: 1, same: 0, rejected: 1 })
})

test('가져오기 결과는 만든 · 고친 TC 와 못 넣은 줄을 읽는다', () => {
  const result = parseCaseImportResult({
    created: ['7001', '7002'],
    updated: ['7000'],
    unchanged: 3,
    rejected: [{ line: 6, status: 'REJECTED', scene: '숲', step: '무엇', expectedValue: '무엇', reason: '없음' }],
  })
  assert.deepEqual(result.created, ['7001', '7002'])
  assert.deepEqual(result.updated, ['7000'])
  assert.equal(result.unchanged, 3)
  assert.equal(result.rejected[0].line, 6)
})
