import { parseQaRunVerdicts } from '../qa/qaVerdictApi'
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDisplayName } from './buildEnvironment'
import { parseRunGameBuild, gameBuildName } from '../testRuns/testRunApi'
import { parseVersionList, versionName } from '../testCases/testCaseVersions'
import { parseVerdictHistory } from '../testCases/testCaseApi'
import { parseGenerationCandidates } from '../testCases/generationCandidates'
import { parseQaRunSummary } from '../qa/launch/qaLaunchApi'

test('같은 게임 버전의 Editor와 Standalone 및 미확인 환경을 구분한다', () => {
  for (const [isEditor, environment] of [[true, 'Editor'], [false, 'Standalone'], [null, 'Unknown']] as const) {
    const wire = { gameBuildId: '7', version: '1.2.0', label: 'QA', isEditor }
    const runBuild = parseRunGameBuild(wire)!
    assert.equal(gameBuildName(runBuild), `1.2.0 · QA · ${environment}`)
    const version = parseVersionList({ items: [wire] })[0]
    assert.equal(versionName(version), `1.2.0 · QA · ${environment}`)
    const history = parseVerdictHistory({ items: [{ ...wire, testCaseId: '1' }] })[0]
    assert.equal(buildDisplayName(history), `1.2.0 · QA · ${environment}`)
    const candidate = parseGenerationCandidates({ items: [wire] })[0]
    assert.equal(buildDisplayName(candidate), `1.2.0 · QA · ${environment}`)
    assert.equal(parseQaRunVerdicts({ gameBuildIsEditor: isEditor }).gameBuildIsEditor, isEditor)
    const qa = parseQaRunSummary({ id: '1', gameBuildVersion: wire.version, gameBuildIsEditor: isEditor })!
    assert.equal(buildDisplayName({ version: qa.gameBuildVersion!, isEditor: qa.gameBuildIsEditor }), `1.2.0 · ${environment}`)
  }
})

test('isEditor가 없거나 잘못된 응답은 Standalone으로 추정하지 않는다', () => {
  for (const isEditor of [undefined, 'true', 0]) {
    assert.equal(parseRunGameBuild({ gameBuildId: '7', version: '1.0', isEditor })?.isEditor, null)
    assert.equal(parseQaRunSummary({ id: '1', gameBuildIsEditor: isEditor })?.gameBuildIsEditor, null)
  }
})
