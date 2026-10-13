import assert from 'node:assert/strict'
import test from 'node:test'
import {
  importOrder,
  initialExpanded,
  parseScenarioImport,
  parseScenarioLibrary,
  runKey,
  runSelection,
  toggleRun,
  toggleScenario,
  versionKey,
  versionLabel,
} from './scenarioLibrary'

const wire = {
  versions: [
    {
      gameBuild: { gameBuildId: '2', version: '2.0.0', label: null },
      testRuns: [
        { testRunId: '20', name: '2.0 런', testScenarios: [
          { testScenarioId: '201', title: '보스전', stepCount: 4, updatedAt: '2026-10-13T00:00:00Z' },
        ] },
      ],
    },
    {
      gameBuild: { gameBuildId: '1', version: '1.0.0', label: '알파' },
      testRuns: [
        { testRunId: '10', name: '1.0 런', testScenarios: [
          { testScenarioId: '101', title: '튜토리얼', stepCount: 3, updatedAt: null },
          { testScenarioId: '201', title: '보스전', stepCount: 4, updatedAt: null },
          { testScenarioId: '', title: 'id 없음', stepCount: 1 },
        ] },
      ],
    },
    { gameBuild: null, testRuns: [{ testRunId: null, name: null, testScenarios: [{ testScenarioId: '301', title: '', stepCount: 0 }] }] },
  ],
}

test('트리는 버전 → TR → TS 로 읽고, id 없는 TS 는 버린다', () => {
  const versions = parseScenarioLibrary(wire)

  assert.equal(versions.length, 3)
  assert.equal(versions[1].gameBuild?.label, '알파')
  assert.deepEqual(versions[1].testRuns[0].testScenarios.map((s) => s.testScenarioId), ['101', '201'])
  assert.equal(versions[2].gameBuild, null)
  assert.equal(versions[2].testRuns[0].testRunId, null)
  assert.equal(versionLabel(versions[1], '없음'), '알파')
  assert.equal(versionLabel(versions[0], '없음'), '2.0.0')
  assert.equal(versionLabel(versions[2], '없음'), '없음')
})

test('처음에는 가장 최근 버전과 그 TR 만 펼친다', () => {
  const versions = parseScenarioLibrary(wire)

  assert.deepEqual([...initialExpanded(versions)], [versionKey(versions[0]), runKey(versions[0], versions[0].testRuns[0])])
  assert.deepEqual([...initialExpanded([])], [])
})

test('TR 을 고르면 그 안의 TS 전부, 다시 누르면 전부 푼다', () => {
  const ids = ['101', '201']
  const some = toggleScenario('101', new Set())
  assert.equal(runSelection(ids, some), 'some')

  const all = toggleRun(ids, some)
  assert.equal(runSelection(ids, all), 'all')
  assert.equal(runSelection(ids, toggleRun(ids, all)), 'none')
})

test('보내는 순서는 트리 순서이고 여러 TR 에 든 TS 는 한 번만 보낸다', () => {
  const versions = parseScenarioLibrary(wire)

  assert.deepEqual(importOrder(versions, new Set(['301', '101', '201'])), ['201', '101', '301'])
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
