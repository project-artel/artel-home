/**
 * 설정 안내 화면이 보여 주는 문자열 가운데, 화면과 project agent 가 함께 읽는 것.
 * 화면에 쓰는 문자열과 agent 에게 돌려주는 문자열이 갈라지지 않도록 한 곳에 둔다.
 */

/**
 * Unity Package Manager 가 SDK 를 설치하는 git URL. 제품에 하나뿐인 상수라 서버에서 받지 않는다.
 *
 * `?path=` 는 장식이 아니다. 저장소 루트에는 sample project 와 도구도 있고 package 는 한 층 아래
 * `Packages/kr.artel.sdk` 에 있다. 쿼리가 없으면 Package Manager 가 루트에서 `package.json` 을 찾지
 * 못해 URL 을 거절한다.
 */
export const SDK_PACKAGE_URL = 'https://github.com/project-artel/artel-sdk.git?path=/Packages/kr.artel.sdk'

export const PROJECT_ID_PLACEHOLDER = '<project id>'
export const PROJECT_LIST_COMMAND = 'artel project list'
export const QA_RUN_COMMAND = 'artel qa run --test-run <test run id> --instance <instance id>'

export function gameStartCommand(projectId: string): string {
  return `artel game start --build ./Build/Game.exe --project ${projectId}`
}

export function gameListCommand(projectId: string): string {
  return `artel game list --project ${projectId}`
}

export type ProjectCliCommands = { gameStart: string; gameList: string; qaRun: string }

export function projectCliCommands(projectId: string): ProjectCliCommands {
  return { gameStart: gameStartCommand(projectId), gameList: gameListCommand(projectId), qaRun: QA_RUN_COMMAND }
}
