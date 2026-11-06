import assert from 'node:assert/strict'
import test from 'node:test'
import type { Issue } from '../../issues/issueTypes'
import {
  createIssueStatusRunner,
  createTrackerTicketRunner,
  findListedIssue,
  ISSUES_ACTIONS,
  ISSUES_FIELDS,
  issueOptionLabel,
  trackerUrlOf,
} from './issues'

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: '7',
    qaTryId: '1',
    qaRunId: '2',
    severity: 'MAJOR',
    title: 'Button does nothing',
    detail: null,
    status: 'OPEN',
    reportedAt: '2026-10-20T00:00:00Z',
    resolvedAt: null,
    tracker: null,
    // ARTEL-1114 가 `Issue` 에 더한 칸. 서버가 아직 안 실으면 null 인 자리라 픽스처도 비워 둔다.
    origin: null,
    number: null,
    archivedAt: null,
    categories: [],
    ...overrides,
  }
}

test('issue action ids, risks and schemas', () => {
  assert.deepEqual(
    ISSUES_ACTIONS.map((action) => [action.id, action.risk]),
    [
      ['issues.open', 'auto'],
      ['issues.setStatus', 'approve'],
      ['issues.openTracker', 'auto'],
      ['issues.createTrackerTicket', 'approve'],
    ],
  )
  for (const action of ISSUES_ACTIONS) {
    assert.equal(action.page, 'issues')
    assert.deepEqual(action.args.required?.includes('issueId'), true)
  }
  assert.deepEqual(ISSUES_ACTIONS[1].args.properties?.status?.enum, ['OPEN', 'RESOLVED'])
  assert.deepEqual(
    ISSUES_FIELDS.map((field) => field.name),
    ['issues.status', 'issues.severity', 'issues.issue'],
  )
})

test('findListedIssue throws with a hint when the issue is filtered out', () => {
  assert.equal(findListedIssue([issue()], '7').id, '7')
  assert.throws(() => findListedIssue([issue()], '8'), /not in the list now/)
})

test('issueOptionLabel names severity, title and status', () => {
  assert.equal(issueOptionLabel(issue()), '[MAJOR] Button does nothing (OPEN)')
})

test('setStatus calls the row toggle only when the status differs', async () => {
  const toggled: string[] = []
  const run = createIssueStatusRunner({
    items: () => [issue()],
    toggle: async (target) => {
      toggled.push(target.id)
      return true
    },
  })
  assert.deepEqual(await run({ issueId: '7', status: 'OPEN' }), { issueId: '7', status: 'OPEN', changed: false })
  assert.deepEqual(toggled, [])
  assert.deepEqual(await run({ issueId: '7', status: 'RESOLVED' }), { issueId: '7', status: 'RESOLVED', changed: true })
  assert.deepEqual(toggled, ['7'])
  await assert.rejects(run({ issueId: '7', status: 'CLOSED' }), /OPEN or RESOLVED/)
  await assert.rejects(run({ status: 'OPEN' }), /issueId is required/)
})

test('setStatus reports a rejected change', async () => {
  const run = createIssueStatusRunner({ items: () => [issue()], toggle: async () => false })
  await assert.rejects(run({ issueId: '7', status: 'RESOLVED' }), /left as it was/)
})

test('createTrackerTicket needs a tracker and an issue that is not exported', async () => {
  let synced = 0
  const make = (connected: boolean, item: Issue) =>
    createTrackerTicketRunner({
      items: () => [item],
      trackerConnected: () => connected,
      sync: async () => {
        synced += 1
        return true
      },
    })
  await assert.rejects(make(false, issue())({ issueId: '7' }), /no connected tracker/)
  const exported = issue({ tracker: { provider: 'GITHUB', externalKey: '3', url: 'https://x', syncState: 'SYNCED', syncError: null, syncedAt: null } })
  await assert.rejects(make(true, exported)({ issueId: '7' }), /already exported/)
  assert.equal(synced, 0)
  assert.deepEqual(await make(true, issue())({ issueId: '7' }), { issueId: '7', requested: true })
  const failed = issue({ tracker: { ...exported.tracker!, syncState: 'FAILED' } })
  assert.deepEqual(await make(true, failed)({ issueId: '7' }), { issueId: '7', requested: true })
  assert.equal(synced, 2)
})

test('trackerUrlOf needs an exported issue with a link', () => {
  assert.throws(() => trackerUrlOf(issue()), /no tracker link/)
  const withUrl = issue({ tracker: { provider: 'GITHUB', externalKey: '3', url: 'https://x/3', syncState: 'SYNCED', syncError: null, syncedAt: null } })
  assert.equal(trackerUrlOf(withUrl), 'https://x/3')
})
