/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sessionBadge } from './sessionView.ts'
import type { JobState } from './toolTypes.ts'

function job(key: string, state: JobState['state']): JobState {
  return { key, kind: 'qa_run', id: key, label: key, state }
}

test('sessionBadge counts approval, choice and unseen finished jobs', () => {
  const badge = sessionBadge({
    approval: { actionId: 'qa.startRun', summary: 's', approve: () => {}, reject: () => {} },
    choice: { conversationId: 1, question: 'q', options: [], multiple: false },
    jobs: { 1: [job('qa_run:1', 'finished'), job('qa_run:2', 'running'), job('qa_run:3', 'failed')] },
    seenJobKeys: ['qa_run:3'],
  })
  assert.deepEqual(badge, { count: 3, approval: true, choice: true, finishedJobs: 1 })
})

test('sessionBadge is zero when nothing waits', () => {
  assert.equal(sessionBadge({ approval: null, choice: null, jobs: {}, seenJobKeys: [] }).count, 0)
})
