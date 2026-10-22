import type { Guide } from './index'

export const buildVersions: Guide = {
  id: 'build-versions',
  title: '게임 build 버전과 test case',
  summary: 'build 버전이 무엇인지, 어떤 test case 가 어느 버전에 들어가는지, 테스트 런과 QA 가 버전을 어떻게 따르는지.',
  body: `게임 build 버전은 SDK 가 보고한 게임 버전 하나입니다(예: \`1.4.0\`). 사람이 붙인 label 이 있으면 label 로 보입니다. 프로젝트의 가장 최근 버전이 "현재 버전"입니다. 목록은 \`query\` 의 \`build_versions\` 로 읽습니다.

## test case 와 버전

- test case 는 버전이 달라도 같은 id 입니다. 이 정체(identity)와 별개로, 버전마다 그 버전의 내용과 판정을 담은 행이 있습니다.
- 한 버전에 행이 없는 test case 는 그 버전에 없는 것입니다. 어느 버전에도 행이 없으면 Test cases 화면의 "버전 없음"에 보입니다.
- 판정(VERIFIED, FAILED, REGRESSION, DRAFT, BROKEN)은 버전마다 따로 기록됩니다. 한 case 의 버전별 판정은 \`query\` 의 \`test_case\` 결과 \`builds\` 에 있습니다.
- 자동 생성(MAP) case 의 내용은 버전마다 다를 수 있습니다. 사용자 생성(MANUAL) case 는 사람이 고친 최신 내용이 원본이고, 버전 행은 판정을 받던 때의 스냅샷입니다.

## 테스트 런과 QA 가 따르는 버전

- 테스트 런은 build 버전 하나를 따르거나, 버전 없이(unversioned) 만들어집니다. 버전 없는 런은 최신 내용을 씁니다.
- 시나리오 작성도 그 런의 버전에 든 test case 만 보고 씁니다.
- \`GET test-cases?gameBuildId=<id>\` 는 그 버전에 든 case 만 돌려줍니다. 시나리오 본문은 그 밖의 case 를 인용하고 있을 수 있습니다.
- QA 는 켜진 게임의 버전에 행이 없는 case 의 판정을 기록하지 않고 넘깁니다. ORDERED 시나리오는 그 step 을 그대로 실행하되 case 판정만 빠지고, FREE 시나리오는 그 step 을 뺍니다.
- QA 를 시작하기 전에 화면이 "게임 버전에 없는 case" 건수를 알립니다. 건수가 0 보다 크면 사용자에게 어떻게 할지 물어봅니다(해당 case 를 그 버전에 넣을지, 그대로 돌릴지).

## case 가 버전에 들어가는 길

- **콘텐츠 맵에서 TC 생성**: MAP case 의 행이 그 버전에 만들어집니다. 같은 버전에서 이미 생성했으면 409 이고, editor build 에서도 생성할 수 없습니다. 덮어쓰기로 다시 생성하면 MAP case 만 지금 맵으로 바뀌고 남는 case 의 판정은 그대로이며, MANUAL case 는 건드리지 않습니다.
- **이어 넣기(carry-over)**: 맵에서 생성할 때 기본값이 켜져 있어서, 바로 앞 버전에 있던 MANUAL case 가 새 버전에 따라옵니다. 앞 버전에서 사람이 뺀 case 는 따라오지 않습니다. 끄면 이어 넣지 않습니다.
- **버전을 골라 새 MANUAL case 만들기**: 만들 때 버전을 지정하면 그 버전에 바로 들어갑니다. 지정하지 않으면 어느 버전에도 들어가지 않습니다.
- **기존 MANUAL case 를 버전에 넣기**: Test cases 화면에서 case 를 골라 "버전에 넣기" 명령을 쓰거나 \`testScenario.addCasesToBuild\` 로 넣습니다. 이미 든 case 는 건너뜁니다.
- MAP case 는 손으로 넣거나 뺄 수 없습니다. 맵에서 다시 생성해야 바뀝니다.

## 새 행의 상태와 빼기

- 새 행의 상태는 앞 버전에서 VERIFIED, FAILED, REGRESSION 중 하나로 판정이 났으면 REGRESSION, 아니면 DRAFT 입니다.
- MANUAL case 를 버전에서 빼면 그 버전에서 받은 판정도 함께 삭제됩니다.`,
}
