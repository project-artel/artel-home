import assert from 'node:assert/strict'
import test from 'node:test'
import { SDK_PACKAGE_URL, projectCliCommands } from './setupCommands'

test('project commands carry the real project id', () => {
  const commands = projectCliCommands('42')
  assert.match(commands.gameStart, /--project 42$/)
  assert.equal(commands.gameList, 'artel game list --project 42')
  assert.match(commands.qaRun, /--instance <instance id>/)
})

test('the SDK package URL keeps the path query Package Manager needs', () => {
  assert.ok(SDK_PACKAGE_URL.endsWith('?path=/Packages/kr.artel.sdk'))
})
