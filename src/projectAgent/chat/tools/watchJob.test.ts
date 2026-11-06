import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRegistryApi } from '../../registry/types'
import type { ToolContext } from '../toolTypes'
import { watchJob } from './watchJob'

function context(): ToolContext {
  return {
    projectId: '1',
    conversationId: 1,
    registry: {} as AgentRegistryApi,
    navigate: () => undefined,
    upsertJob: () => assert.fail('an invalid id must not start a watch'),
    postEvent: () => undefined,
    askChoice: async () => null,
    signal: new AbortController().signal,
  }
}

test('watch_job rejects a non-numeric id for both job kinds before watching', async () => {
  for (const kind of ['qa_run', 'content_map_scan']) {
    for (const id of ['abc', '7/../8', '', ' ']) {
      const result = await watchJob({ kind, id }, context())
      assert.equal(result.status, 'error', `${kind} ${JSON.stringify(id)}`)
    }
  }
})

test('watch_job rejects an unknown kind', async () => {
  assert.equal((await watchJob({ kind: 'deploy', id: '1' }, context())).status, 'error')
})
