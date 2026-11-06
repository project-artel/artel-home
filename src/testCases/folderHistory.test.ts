/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FolderHistory, HISTORY_LIMIT, type FolderCommand } from './folderHistory.ts'

/** 서버 대신 이름 → id 표를 고치는 작업. 만들 때마다 새 id 를 준다. */
function fakeServer() {
  let next = 100
  const folders = new Map<string, string>()
  return {
    folders,
    create(name: string): FolderCommand {
      let originalId: string | null = null
      const make = (context: { alias: (a: string, b: string) => void }) => {
        const id = String(next++)
        folders.set(id, name)
        if (originalId === null) originalId = id
        else context.alias(originalId, id)
      }
      return {
        label: 'create',
        run: async (context) => make(context),
        undo: async (context) => {
          folders.delete(context.resolve(originalId as string))
        },
      }
    },
    rename(folderId: string, from: string, to: string): FolderCommand {
      return {
        label: 'rename',
        run: async (context) => void folders.set(context.resolve(folderId), to),
        undo: async (context) => void folders.set(context.resolve(folderId), from),
      }
    },
  }
}

test('만들기를 되돌리고 다시 하면 새 id 로 생기고, 뒤의 작업은 그 id 를 찾아간다', async () => {
  const server = fakeServer()
  const history = new FolderHistory()

  await history.execute(server.create('A'))
  assert.deepEqual([...server.folders], [['100', 'A']])
  await history.execute(server.rename('100', 'A', 'B'))

  await history.undo()
  await history.undo()
  assert.equal(server.folders.size, 0)

  await history.redo()
  assert.deepEqual([...server.folders], [['101', 'A']])
  await history.redo()
  assert.deepEqual([...server.folders], [['101', 'B']])
  assert.equal(history.context.resolve('100'), '101')
})

test('새 작업을 하면 Redo 꼬리를 버린다', async () => {
  const server = fakeServer()
  const history = new FolderHistory()
  await history.execute(server.create('A'))
  await history.undo()
  assert.equal(history.state.canRedo, true)

  await history.execute(server.create('C'))
  assert.equal(history.state.canRedo, false)
  assert.equal(await history.redo(), null)
})

test('실패한 작업은 기록하지 않고, 실패한 Undo 는 제자리에 남는다', async () => {
  const history = new FolderHistory()
  const failing: FolderCommand = {
    label: 'fail',
    run: async () => { throw new Error('boom') },
    undo: async () => {},
  }
  await assert.rejects(history.execute(failing))
  assert.equal(history.state.canUndo, false)

  let undoCalls = 0
  const stuck: FolderCommand = {
    label: 'stuck',
    run: async () => {},
    undo: async () => { undoCalls++; throw new Error('nope') },
  }
  await history.execute(stuck)
  await assert.rejects(history.undo())
  assert.equal(history.state.canUndo, true)
  assert.equal(undoCalls, 1)
})

test('작업이 도는 동안 들어온 작업은 실행하지 않는다', async () => {
  const history = new FolderHistory()
  let release: () => void = () => {}
  const slow: FolderCommand = {
    label: 'slow',
    run: () => new Promise<void>((resolve) => { release = resolve }),
    undo: async () => {},
  }
  const first = history.execute(slow)
  assert.equal(history.state.busy, true)
  assert.equal(await history.execute({ label: 'x', run: async () => {}, undo: async () => {} }), false)
  release()
  assert.equal(await first, true)
  assert.equal(history.state.busy, false)
})

test(`기록은 ${HISTORY_LIMIT} 개까지 남긴다`, async () => {
  const history = new FolderHistory()
  const noop: FolderCommand = { label: 'n', run: async () => {}, undo: async () => {} }
  for (let index = 0; index < HISTORY_LIMIT + 5; index++) await history.execute(noop)
  let undone = 0
  while ((await history.undo()) !== null) undone++
  assert.equal(undone, HISTORY_LIMIT)
})
