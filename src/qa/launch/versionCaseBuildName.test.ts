import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameBuild, InstanceBuild } from '../../projects/gameTypes'
import { versionCaseBuildName } from './versionCaseBuildName'

const instance: InstanceBuild = { gameBuildId: '14', version: '1.4.0', label: null, isEditor: false }
const next: GameBuild = { id: '15', projectId: '1', version: '1.5.0', label: null, notes: null, isEditor: false, createdAt: '', updatedAt: '' }

test('게임이 바뀌면 서버 응답의 대상 버전을 표시한다', () => {
  assert.equal(versionCaseBuildName('14', [next], instance), '1.4.0')
  assert.equal(versionCaseBuildName('15', [next], instance), '1.5.0')
})

test('새 build의 이름을 아직 모르면 오래된 instance 버전을 표시하지 않는다', () => {
  assert.equal(versionCaseBuildName('15', [], instance), null)
  assert.equal(versionCaseBuildName(null, [next], instance), null)
})
