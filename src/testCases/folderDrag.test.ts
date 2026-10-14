/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CASES_TYPE, dragKind, FOLDER_TYPE, readDrag } from './folderDrag.ts'

function transfer(values: Record<string, string>) {
  return { types: Object.keys(values), getData: (type: string) => values[type] ?? '' }
}

test('끄는 것이 폴더인지 케이스인지 형식으로 가른다', () => {
  assert.equal(dragKind([FOLDER_TYPE, 'text/plain']), 'folder')
  assert.equal(dragKind([CASES_TYPE, 'text/plain']), 'cases')
  assert.equal(dragKind(['text/plain']), null)
})

test('놓을 때 케이스 id 를 읽고, 망가진 값은 버린다', () => {
  assert.deepEqual(readDrag(transfer({ [CASES_TYPE]: '["1","2",3]' })), { kind: 'cases', caseIds: ['1', '2'] })
  assert.equal(readDrag(transfer({ [CASES_TYPE]: 'nope' })), null)
  assert.equal(readDrag(transfer({ [CASES_TYPE]: '[]' })), null)
  assert.deepEqual(readDrag(transfer({ [FOLDER_TYPE]: '7' })), { kind: 'folder', folderId: '7' })
  assert.equal(readDrag(transfer({ 'text/plain': 'x' })), null)
})
