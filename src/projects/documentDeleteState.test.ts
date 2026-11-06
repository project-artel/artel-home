import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  beginDocumentDelete,
  cancelDocumentDelete,
  idleDocumentDelete,
  requestDocumentDelete,
  runDocumentDelete,
} from './documentDeleteState'

/*
 * `DocumentPanel` calls these four functions from its `useState` handlers;
 * these tests cover the state each one produces without rendering the panel.
 * Two rules matter most: the request-only-after-confirm rule, and what a
 * failed delete leaves the caller with.
 */

describe('requestDocumentDelete and cancelDocumentDelete', () => {
  /*
   * `requestDocumentDelete` takes no `deleteDocument` dependency — its
   * signature has nowhere to put one — so pressing the trigger button, which
   * calls only this, can never send a request. Only `runDocumentDelete`,
   * wired to the confirmation's own button, does that.
   */
  it('opens confirmation without any way to reach the delete request', () => {
    assert.deepEqual(requestDocumentDelete('doc-1'), {
      documentId: 'doc-1',
      pending: false,
      error: null,
    })
  })

  it('cancelling returns to idle', () => {
    assert.deepEqual(cancelDocumentDelete(), idleDocumentDelete)
  })
})

describe('beginDocumentDelete', () => {
  it('marks the line pending with no error', () => {
    assert.deepEqual(beginDocumentDelete('doc-1'), {
      documentId: 'doc-1',
      pending: true,
      error: null,
    })
  })
})

describe('runDocumentDelete', () => {
  it('resolves to idle and reports deleted on success', async () => {
    const result = await runDocumentDelete({
      deleteDocument: async () => {},
      documentId: 'doc-1',
      toErrorMessage: () => 'unused',
    })

    assert.deepEqual(result, { state: idleDocumentDelete, deleted: true })
  })

  /*
   * A failed request must leave the caller with `deleted: false`, because
   * `DocumentPanel` only removes a row from the list when this is `true` —
   * this is the guarantee behind "a failed delete leaves the list unchanged".
   */
  it('keeps the row selected with its error on failure, and reports not deleted', async () => {
    const result = await runDocumentDelete({
      deleteDocument: async () => {
        throw new Error('server exploded')
      },
      documentId: 'doc-1',
      toErrorMessage: (error) => (error instanceof Error ? error.message : 'unknown'),
    })

    assert.equal(result.deleted, false)
    assert.deepEqual(result.state, {
      documentId: 'doc-1',
      pending: false,
      error: 'server exploded',
    })
  })

  it('calls deleteDocument with the requested document id, once', async () => {
    const seen: string[] = []
    await runDocumentDelete({
      deleteDocument: async (documentId) => {
        seen.push(documentId)
      },
      documentId: 'doc-7',
      toErrorMessage: () => 'unused',
    })

    assert.deepEqual(seen, ['doc-7'])
  })
})
