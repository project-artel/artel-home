import type { Guide } from './index'

export const cliInstall: Guide = {
  id: 'cli-install',
  title: 'artel CLI 설치와 로그인',
  summary: 'artel CLI 를 설치하고 로그인하는 방법, CI 에서 쓰는 CLI 토큰을 발급하는 방법.',
  body: `artel CLI 는 터미널이나 CI 에서 게임 실행과 QA 를 시작하는 도구입니다. 설치와 로그인은 사용자의 컴퓨터에서 하는 일이라 agent 가 대신할 수 없습니다. 화면 안내는 [/setup](/setup) 에 있습니다.

## 설치

Node.js 22.12.0 이상이 필요합니다. npm 패키지 이름은 \`@project-artel/cli\` 이고 설치되는 명령은 \`artel\` 입니다. \`@alpha\` tag 를 반드시 붙여야 합니다. \`latest\` 는 오래된 빌드(\`0.0.1-alpha.0\`)를 가리킵니다.

\`\`\`
npm install -g @project-artel/cli@alpha
artel --version
\`\`\`

전역 설치 없이 실행하려면 \`npx @project-artel/cli@alpha <command>\` 를 씁니다.

AI 코딩 에이전트(Claude Code, Codex, Cursor 등)에게 설치를 맡기려면 이 프롬프트를 붙여 넣습니다. https://artel.kr/cli.md 에 에이전트용 단계별 안내가 있습니다.

\`\`\`
Install the ARTEL CLI on this machine by following https://artel.kr/cli.md
\`\`\`

## 로그인

\`\`\`
artel auth login
\`\`\`

브라우저에서 콘솔이 열리고, 로그인이 끝나면 발급된 토큰이 \`~/.artel/credentials.json\` (Windows 는 \`%USERPROFILE%\\.artel\\credentials.json\`)에 저장됩니다. 위치를 바꾸려면 \`ARTEL_CONFIG_DIR\` 을 지정합니다.

- \`artel auth status\`: 어떤 인증 정보를 쓰는지 보여 줍니다. 토큰 자체는 출력하지 않습니다.
- \`artel auth logout\`: 로컬 파일만 지웁니다. 서버의 토큰은 취소되지 않으므로 [/account](/account) 에서 취소합니다.

## CI 에서 쓰는 CLI 토큰

CI 처럼 브라우저가 없는 곳에서는 환경 변수 \`ARTEL_TOKEN\` 에 CLI 토큰을 지정합니다. 환경 변수가 로그인 파일보다 우선합니다.

토큰은 [/account](/account) 의 CLI 토큰 패널에서 발급합니다. 이름을 적고 만료(30일, 90일, 180일, 365일, 무기한)를 고른 뒤 토큰 만들기를 누릅니다. 토큰 원문은 만든 직후 한 번만 보이므로 바로 복사해야 합니다. 같은 패널에서 마지막 사용 시각을 보고 토큰을 취소할 수 있습니다.

## id 찾기

- \`artel project list\`: 접근할 수 있는 프로젝트와 id 를 출력합니다.
- \`artel game list --project <project id>\`: 프로젝트의 게임 인스턴스와 연결 여부를 출력합니다. 목록이 비어 있으면 \`artel game start\` 를 아직 하지 않은 경우가 많습니다.

QA 실행은 안내 문서 \`cli-run-qa\` 를 참고합니다.`,
}
