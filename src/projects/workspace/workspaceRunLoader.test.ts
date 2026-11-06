import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWorkspaceRunLoader, type WorkspaceRunData } from './workspaceRunLoader'

function pendingRead() {
  const requests: Array<{
    signal: AbortSignal
    resolve: (data: WorkspaceRunData) => void
    reject: (error: Error) => void
  }> = []
  const read = (signal: AbortSignal) => new Promise<WorkspaceRunData>((resolve, reject) => {
    requests.push({ signal, resolve, reject })
  })
  return { requests, read }
}

const snapshot = (runs: WorkspaceRunData['runs'] = []): WorkspaceRunData => ({
  runs,
  coverage: { total: 0, authored: 0, unauthored: 0, verified: 0, draft: 0, broken: 0, uncoveredScenes: [] },
})

test('최초 조회보다 SSE 재조회가 먼저 끝나도 이전 응답이 최신 목록을 덮어쓰지 않는다', async () => {
  const { requests, read } = pendingRead()
  const applied: WorkspaceRunData[] = []
  const loader = createWorkspaceRunLoader(read, (data) => applied.push(data))
  const initial = loader.refresh()
  await Promise.resolve()
  const changed = loader.refresh()
  await Promise.resolve()
  assert.equal(requests[0].signal.aborted, true)
  const latest = snapshot()
  requests[1].resolve(latest)
  await changed
  requests[0].resolve(snapshot())
  await initial
  assert.deepEqual(applied, [latest])
})

test('이전 요청을 기다리던 QA 진입도 최신 요청 완료를 기다린다', async () => {
  const { requests, read } = pendingRead()
  const loader = createWorkspaceRunLoader(read, () => {})
  let ready = false
  const initial = loader.refresh().then(() => { ready = true })
  await Promise.resolve()
  const changed = loader.refresh()
  await Promise.resolve()
  requests[0].reject(new Error('aborted'))
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(ready, false)
  requests[1].resolve(snapshot())
  await Promise.all([initial, changed])
  assert.equal(ready, true)
})

test('최신 조회 실패는 호출자에게 전달하고 재시도할 수 있다', async () => {
  const { requests, read } = pendingRead()
  const applied: WorkspaceRunData[] = []
  const loader = createWorkspaceRunLoader(read, (data) => applied.push(data))
  const failed = loader.refresh()
  await Promise.resolve()
  requests[0].reject(new Error('503'))
  await assert.rejects(failed, /503/)
  const retry = loader.refresh()
  await Promise.resolve()
  requests[1].resolve(snapshot())
  await retry
  assert.equal(applied.length, 1)
})

test('프로젝트를 떠난 뒤 도착한 응답은 반영하지 않는다', async () => {
  const { requests, read } = pendingRead()
  const applied: WorkspaceRunData[] = []
  const loader = createWorkspaceRunLoader(read, (data) => applied.push(data))
  const pending = loader.refresh()
  await Promise.resolve()
  loader.cancel()
  requests[0].resolve(snapshot())
  await pending
  assert.equal(requests[0].signal.aborted, true)
  assert.deepEqual(applied, [])
})
