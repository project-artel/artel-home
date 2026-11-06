import type { Guide } from './index'

export const cliRunQa: Guide = {
  id: 'cli-run-qa',
  title: 'CLI 로 QA 실행과 결과 읽기',
  summary: 'artel CLI 로 QA 를 실행하고, 여러 설정을 matrix 로 돌리고, content map 과 발견된 이슈를 읽는 방법.',
  body: `artel CLI 가 설치되어 로그인된 상태여야 합니다(안내 문서 \`cli-install\`). 명령은 사용자의 터미널이나 CI 에서 실행합니다. 결과를 보고하는 명령은 모두 \`--json\` 을 받습니다.

## QA 실행

\`\`\`
artel project list
artel game list --project <project id>
artel qa run --test-run <test run id> --instance <instance id>
\`\`\`

\`qa run\` 은 에이전트가 판정을 낼 때까지 따라갑니다. \`--no-wait\` 를 주면 시작만 하고 돌아옵니다. 종료 코드가 판정입니다. 통과했을 때만 \`0\` 이고, 실패, 취소, 알 수 없음은 모두 \`1\` 이라 CI 에서 통과 여부로 쓸 수 있습니다.

실행 설정 flag 는 생략하면 서버가 고르고, 결과에 고른 값이 표시됩니다.

| flag | 값 |
| --- | --- |
| \`--model\` | model id. \`artel qa models\` 로 목록을 봅니다 |
| \`--prompt-version\` | prompt 버전 |
| \`--reasoning-effort\` | model 의 reasoning effort |
| \`--arch\` | agent 구조. JSON 객체 또는 \`@path\` |
| \`--content-map-mode\` | \`on\`, \`frozen\`, \`off\` |
| \`--knowledge-mode\` | \`learning\`, \`frozen\`, \`off\` |
| \`--label\` | 실험 이름 |

관련 명령: \`artel qa watch <run id>\`(진행 중인 실행 따라가기), \`artel qa show <run id>\`(읽기, 항상 종료 코드 0), \`artel qa cancel <run id>\`, \`artel qa list --project <project id>\`.

두 설정 비교는 \`artel qa diff 'model=...,promptVersion=v15' 'model=...,promptVersion=v16' --project <project id>\` 형태입니다. 생략한 필드는 모든 값과 맞습니다.

## 여러 설정을 한 번에 돌리기

\`\`\`
artel qa matrix --project 1 --test-run 1,2 --model <model id> \\
  --content-map-mode off,frozen --knowledge-mode off --label <실험 이름> \\
  --slot /path/to/BuildA/Game.exe --slot /path/to/BuildB/Game.exe
\`\`\`

- 쉼표로 나열한 값은 조합마다 한 번씩 실행됩니다. 위 예시는 test run 2개 × content map mode 2개 = 4번을 slot 2개에 나눠 돌립니다.
- \`--model\` 은 모델을 비교하지 않아도 항상 지정합니다. 서버가 한 matrix 안에서 서로 다른 모델을 고를 수 있기 때문입니다.
- slot 마다 \`productName\` 이 서로 다른 별도 빌드가 필요합니다. 같으면 한 게임 인스턴스로 등록되어 저장 데이터를 덮어씁니다.
- \`--repeat n\` 은 조합마다 n번 돌립니다. \`--out <path>\` 는 끝난 실행을 한 줄씩 파일에 쓰고, \`--resume\` 은 그 파일에 있는 실행을 건너뜁니다.

## content map 읽기

\`artel map show --project <project id> --build <build id>\` 는 빌드의 content map(scene, scene 간 이동, 화면 전환, 기획서와 어긋난 곳, 확인된 evidence feature, 마지막 scan)을 보여 줍니다. 스캔은 \`artel doc scan\` 으로 시작하고 \`--watch\` 로 따라갑니다.

## 실행에서 발견된 이슈

\`artel issue list --project <project id>\` 는 QA 실행이 찾은 결함을 최신순으로 보여 줍니다(Jira 이슈가 아닙니다). \`--status\`, \`--severity\` 로 거르고, \`artel issue resolve <id>\` 와 \`artel issue reopen <id>\` 로 상태를 바꿉니다.

## 주의

- 게임을 \`-batchmode\` 로 실행하면 안 됩니다. SDK 가 back buffer 에서 화면을 캡처하는데 batchmode 에는 없어서, 오류 없이 빈 화면이 올라옵니다.
- SDK 는 개발 빌드에만 붙습니다.`,
}
