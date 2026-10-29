import assert from 'node:assert/strict'
import test from 'node:test'
import {
  currentVersionKey,
  findRun,
  parseScenarioImport,
  parseScenarioLibrary,
  runSelection,
  scenarioOrigins,
  toggleRun,
  toggleScenario,
  versionLabel,
} from './scenarioLibrary'

const wire = {
  versions: [
    {
      gameBuild: { gameBuildId: '2', version: '2.0.0', label: null },
      testRuns: [
        { testRunId: '20', name: '2.0 런', testScenarios: [] },
        { testRunId: '21', name: '2.0 다른 런', testScenarios: [
          { testScenarioId: '201', title: '보스전', stepCount: 4, caseCount: 3, updatedAt: '2026-10-13T00:00:00Z' },
        ] },
      ],
    },
    {
      gameBuild: { gameBuildId: '1', version: '1.0.0', label: '알파' },
      testRuns: [
        { testRunId: '10', name: '1.0 런', testScenarios: [
          { testScenarioId: '101', title: '튜토리얼', stepCount: 3, updatedAt: null },
          { testScenarioId: '201', title: '보스전', stepCount: 4, caseCount: 3, updatedAt: null },
          { testScenarioId: '', title: 'id 없음', stepCount: 1 },
        ] },
      ],
    },
    { gameBuild: null, testRuns: [{ testRunId: null, name: null, testScenarios: [{ testScenarioId: '301', title: '', stepCount: 0 }] }] },
  ],
}

test('트리는 버전 → 런 → 시나리오로 읽고, id 없는 시나리오는 버린다', () => {
  const versions = parseScenarioLibrary(wire)

  assert.equal(versions.length, 3)
  assert.deepEqual(versions[1].testRuns[0].testScenarios.map((s) => s.testScenarioId), ['101', '201'])
  assert.equal(versions[1].testRuns[0].testScenarios[0].caseCount, 0)
  assert.equal(versions[0].testRuns[1].testScenarios[0].caseCount, 3)
  assert.equal(versionLabel(versions[1], '없음'), '1.0.0 · Unknown · 알파')
  assert.equal(versionLabel(versions[2], '없음'), '없음')
})

test('런 키로 그 런과 버전을 찾는다', () => {
  const versions = parseScenarioLibrary(wire)

  assert.equal(findRun(versions, 'v:2/r:21')?.version.gameBuild?.version, '2.0.0')
  assert.equal(findRun(versions, 'v:none/r:loose')?.run.testScenarios[0].testScenarioId, '301')
  assert.equal(findRun(versions, null), null)
})

test('편집 중인 런이 든 버전을 찾는다', () => {
  const versions = parseScenarioLibrary(wire)

  assert.equal(currentVersionKey(versions, '10'), 'v:1')
  assert.equal(currentVersionKey(versions, '99'), null)
})

test('런 전체 고르기는 빠진 것을 런 순서대로 뒤에 붙이고, 다 골랐으면 그 런 것만 뺀다', () => {
  const ids = ['101', '201']
  const some = toggleScenario('201', ['301'])
  assert.deepEqual(some, ['301', '201'])
  assert.equal(runSelection(ids, some), 'some')

  const all = toggleRun(ids, some)
  assert.deepEqual(all, ['301', '201', '101'])
  assert.equal(runSelection(ids, all), 'all')
  assert.deepEqual(toggleRun(ids, all), ['301'])
})

test('고른 것의 출처는 트리에서 처음 나온 곳이다', () => {
  const origins = scenarioOrigins(parseScenarioLibrary(wire), '버전 없음', '어느 런에도 없음')

  assert.deepEqual(origins.get('201'), { title: '보스전', from: '2.0.0 · Unknown · 2.0 다른 런' })
  assert.deepEqual(origins.get('301'), { title: '', from: '버전 없음 · 어느 런에도 없음' })
})

test('가져오기 응답의 복사본과 짝 없는 TC', () => {
  const result = parseScenarioImport({
    testRunId: '20',
    importedScenarios: [{ sourceTestScenarioId: '101', testScenarioId: '501', title: '튜토리얼' }, { title: 'x' }],
    unmatchedCaseIds: ['7', ''],
  })

  assert.deepEqual(result.importedScenarios.map((item) => item.testScenarioId), ['501'])
  assert.deepEqual(result.unmatchedCaseIds, ['7'])
})
