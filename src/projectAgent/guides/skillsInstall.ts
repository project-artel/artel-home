import type { Guide } from './index'

export const skillsInstall: Guide = {
  id: 'skills-install',
  title: 'ARTEL agent skills 설치',
  summary: 'AI 코딩 에이전트(Claude Code, Codex, Cursor 등)에게 ARTEL 사용법을 가르치는 artel-skills 를 설치하는 방법.',
  body: `artel-skills 는 AI 코딩 에이전트가 ARTEL 을 다루는 법을 알려 주는 skill 모음입니다. Claude Code, Codex, Cursor 등에서 쓸 수 있습니다. 설치는 사용자의 컴퓨터에서 하는 일이라 agent 가 대신할 수 없습니다. 화면 안내는 [/setup](/setup) 의 Agent skills 항목에 있습니다.

게임 프로젝트 폴더에서 실행합니다.

\`\`\`
npx skills add project-artel/artel-skills
\`\`\`

- \`-g\` 를 붙이면 모든 프로젝트에 설치합니다.
- \`--skill <이름>\` 을 붙이면 skill 하나만 설치합니다.

skill 이 맡는 일은 다음과 같습니다.
- Unity SDK 설치와 게임 등록 (\`artel-unity-sdk\`)
- CLI 설치, 로그인, 실행
- 로컬 MCP server 로 게임 조작 (prototype)
- QA 에이전트용 치트 추가 (\`artel-cheats\`). QA 에이전트가 씬 이동, 적 처치, 엔딩 확인을 한 번에 할 수 있게 합니다.
- 게임 안에서 계속 공격하거나 턴을 넘기는 behavior 추가 (\`artel-behaviors\`)

전체 skill 목록은 https://github.com/project-artel/artel-skills 에 있습니다.

SDK 와 CLI 를 직접 설치하는 방법은 안내 문서 \`sdk-connect\` 와 \`cli-install\` 을 참고합니다.`,
}
