import type { ActionSpec, FieldSpec } from '../registry/types'

/*
 * 프로젝트 설정 안내 페이지. 이 화면에는 game instance 목록도 지우는 버튼도 없고, 안내만 있다.
 * 그래서 안내가 보여 주는 문자열을 돌려주는 action 둘뿐이다.
 */

export const SETUP_SHOW_SDK_PACKAGE_ACTION: ActionSpec = {
  id: 'setup.showSdkPackageUrl',
  page: 'setup',
  risk: 'auto',
  description:
    'Highlight the Unity SDK install step and return the git URL to paste into Unity Package Manager (Add package from git URL). Returns {packageUrl}. Does not copy to the clipboard.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Show the Unity SDK package URL',
}

export const SETUP_SHOW_CLI_COMMANDS_ACTION: ActionSpec = {
  id: 'setup.showCliCommands',
  page: 'setup',
  risk: 'auto',
  description:
    'Highlight the CLI commands block and return this project\'s artel CLI commands with the real project id filled in. Returns {projectId, gameStart, gameList, qaRun}. Does not copy to the clipboard.',
  args: { type: 'object', properties: {} },
  summarize: () => 'Show the artel CLI commands for this project',
}

export const SETUP_FIELDS: FieldSpec[] = []
export const SETUP_ACTIONS: ActionSpec[] = [SETUP_SHOW_SDK_PACKAGE_ACTION, SETUP_SHOW_CLI_COMMANDS_ACTION]
