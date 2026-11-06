import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { withDocumentRemoved, withDocumentStatusApplied } from './useProject'
import type { ProjectDetail, ProjectDocument } from './projectTypes'

/*
 * `applyRemovedDocument` is this function plus a `setState` call, so the rule
 * that actually matters — what happens to `documents` and to
 * `project.document` — is pinned down here instead of through the hook.
 */

function document(id: string, version: number): ProjectDocument {
  return {
    id,
    version,
    fileName: `plan-v${version}.pdf`,
    contentType: 'application/pdf',
    sizeBytes: 1024,
    uploadedAt: '2026-08-30T00:00:00Z',
    uploadedBy: null,
    parseStatus: 'PENDING',
    stale: false,
  }
}

function project(current: ProjectDocument | null): ProjectDetail {
  return {
    id: 'project-1',
    name: 'Demo Day',
    genre: 'OTHER',
    description: null,
    myRole: 'OWNER',
    document: current,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-30T00:00:00Z',
  }
}

describe('withDocumentRemoved', () => {
  it('drops the row and leaves the current document alone when it was not the one removed', () => {
    const current = document('v3', 3)
    const documents = [current, document('v2', 2), document('v1', 1)]

    const result = withDocumentRemoved(documents, project(current), 'v2')

    assert.deepEqual(
      result.documents.map((entry) => entry.id),
      ['v3', 'v1'],
    )
    assert.equal(result.project?.document?.id, 'v3')
  })

  it('falls back to the next-newest remaining version when the current one is removed', () => {
    const current = document('v3', 3)
    const documents = [current, document('v2', 2), document('v1', 1)]

    const result = withDocumentRemoved(documents, project(current), 'v3')

    assert.deepEqual(
      result.documents.map((entry) => entry.id),
      ['v2', 'v1'],
    )
    assert.equal(result.project?.document?.id, 'v2')
  })

  it('clears the current document when the last remaining one is removed', () => {
    const only = document('v1', 1)

    const result = withDocumentRemoved([only], project(only), 'v1')

    assert.deepEqual(result.documents, [])
    assert.equal(result.project?.document, null)
  })

  it('leaves a project the panel has not loaded yet as null', () => {
    const result = withDocumentRemoved([document('v1', 1)], null, 'v1')

    assert.deepEqual(result.documents, [])
    assert.equal(result.project, null)
  })
})

describe('withDocumentStatusApplied', () => {
  it('updates the matching document in place and leaves the rest untouched', () => {
    const current = document('v2', 2)
    const documents = [current, document('v1', 1)]

    const result = withDocumentStatusApplied(documents, project(current), {
      documentId: 'v2',
      parseStatus: 'EXTRACTED',
      stale: false,
    })

    assert.equal(result.documents[0].parseStatus, 'EXTRACTED')
    assert.equal(result.documents[0].stale, false)
    assert.equal(result.documents[1].parseStatus, 'PENDING')
  })

  it('keeps project.document in sync when the update names the current version', () => {
    const current = document('v2', 2)

    const result = withDocumentStatusApplied([current], project(current), {
      documentId: 'v2',
      parseStatus: 'FAILED',
      stale: false,
    })

    assert.equal(result.project?.document?.parseStatus, 'FAILED')
  })

  it('leaves project.document alone when the update names an older version', () => {
    const current = document('v2', 2)
    const older = document('v1', 1)

    const result = withDocumentStatusApplied([current, older], project(current), {
      documentId: 'v1',
      parseStatus: 'EXTRACTED',
      stale: false,
    })

    assert.equal(result.project?.document?.parseStatus, 'PENDING')
    assert.equal(result.documents[1].parseStatus, 'EXTRACTED')
  })

  it('carries a stale EXTRACTING flag through to project.document', () => {
    const current = document('v1', 1)

    const result = withDocumentStatusApplied([current], project(current), {
      documentId: 'v1',
      parseStatus: 'EXTRACTING',
      stale: true,
    })

    assert.equal(result.project?.document?.stale, true)
  })
})
