import assert from 'node:assert/strict'
import { it } from 'node:test'
import { IDS } from './tutorialFixtures'
import { tutorialData, tutorialResponse } from './tutorialMockApi'
import { enterTutorialMode, exitTutorialMode, tutorialSession, type TutorialSession } from './tutorialMode'
import { createLiveRun } from './tutorialPlayback'

const projectSession: TutorialSession = {
  projectId: '52',
  realProject: true,
  locale: 'ko',
  user: { id: '7', displayName: 'Tester', email: null, nickname: 'tester', userTag: '0007' },
}

it('실제 MEMBER 프로젝트의 이름과 장르를 가져오고 목데이터의 OWNER 권한을 유지한다', async () => {
  enterTutorialMode(projectSession)
  try {
    const response = await tutorialResponse('/api/projects/52', undefined, projectSession, async () => Response.json({
      id: '52',
      name: '팀 프로젝트',
      genre: 'ACTION',
      myRole: 'MEMBER',
      description: '실제 프로젝트 설명',
    }))

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      ...tutorialData()?.project,
      name: '팀 프로젝트',
      genre: 'ACTION',
      myRole: 'OWNER',
    })
  } finally {
    exitTutorialMode()
  }
})

it('같은 프로젝트에서 튜토리얼을 다시 시작하면 같은 QA 실행 ID도 다시 알릴 수 있다', () => {
  enterTutorialMode(projectSession)
  try {
    const firstSession = tutorialSession()
    const firstData = tutorialData()
    assert.ok(firstSession && firstData)
    const firstRun = createLiveRun(firstData, IDS.runHarvest)
    assert.ok(firstRun)
    firstSession.seenQaRunIds.add(firstRun.runId)

    exitTutorialMode()
    assert.equal(tutorialSession(), null)
    enterTutorialMode(projectSession)

    const replaySession = tutorialSession()
    const replayData = tutorialData()
    assert.ok(replaySession && replayData)
    const replayRun = createLiveRun(replayData, IDS.runHarvest)
    assert.ok(replayRun)
    assert.equal(replayRun.runId, firstRun.runId)
    assert.equal(replaySession.seenQaRunIds.has(replayRun.runId), false)
  } finally {
    exitTutorialMode()
  }
})
