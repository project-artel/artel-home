import assert from 'node:assert/strict'
import test from 'node:test'
import { parseIssue } from './issueApi'

const ISSUE_FIELDS = {
  id: '101',
  qaTryId: '41',
  severity: 'MAJOR',
  status: 'OPEN',
  title: '문이 열리지 않음',
  detail: null,
  reportedAt: '2026-09-01T00:00:00Z',
  resolvedAt: null,
}

/**
 * `qaRunId` (ARTEL-723) degrades to `null` rather than dropping the row: it is
 * missing from every server that has not deployed ARTEL-722 yet, and the
 * issue list has to render the grey no-link row for that case, not lose the
 * defect entirely.
 */
test('parseIssue reads qaRunId when present', () => {
  const parsed = parseIssue({ ...ISSUE_FIELDS, qaRunId: '9' })
  assert.equal(parsed?.qaRunId, '9')
})

test('parseIssue reads a missing qaRunId as null, not a dropped row', () => {
  const parsed = parseIssue({ ...ISSUE_FIELDS })
  assert.notEqual(parsed, null)
  assert.equal(parsed?.qaRunId, null)
})

test('parseIssue reads a malformed qaRunId as null', () => {
  assert.equal(parseIssue({ ...ISSUE_FIELDS, qaRunId: 'not-a-decimal-id' })?.qaRunId, null)
  assert.equal(parseIssue({ ...ISSUE_FIELDS, qaRunId: 9 })?.qaRunId, null)
  assert.equal(parseIssue({ ...ISSUE_FIELDS, qaRunId: null })?.qaRunId, null)
})
