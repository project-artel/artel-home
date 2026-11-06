import assert from 'node:assert/strict'
import test from 'node:test'
import { DOCUMENTS_ACTIONS, DOCUMENTS_FIELDS } from './documents'

test('document actions are prefixed by the page and name it', () => {
  for (const action of DOCUMENTS_ACTIONS) {
    assert.equal(action.page, 'documents')
    assert.ok(action.id.startsWith('documents.'), action.id)
  }
  for (const field of DOCUMENTS_FIELDS) assert.ok(field.name.startsWith('documents.'), field.name)
})

test('deleting a document and retrying an upload (which starts extraction) need approval', () => {
  const risk = Object.fromEntries(DOCUMENTS_ACTIONS.map((action) => [action.id, action.risk]))
  assert.deepEqual(risk, {
    'documents.openUpload': 'auto',
    'documents.retryUpload': 'approve',
    'documents.delete': 'approve',
  })
})

test('argument schemas are objects and every required name is declared', () => {
  for (const action of DOCUMENTS_ACTIONS) {
    assert.equal(action.args.type, 'object', action.id)
    assert.ok(action.description.length > 40, action.id)
    for (const required of action.args.required ?? []) assert.ok(action.args.properties?.[required], `${action.id}.${required}`)
  }
})

test('the delete summary names the document', () => {
  const remove = DOCUMENTS_ACTIONS.find((action) => action.id === 'documents.delete')
  assert.ok(remove?.summarize({ documentId: '17' }).includes('17'))
})
