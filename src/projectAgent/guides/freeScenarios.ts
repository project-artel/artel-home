import type { Guide } from './index'

export const freeScenarios: Guide = {
  id: 'free-scenarios',
  title: 'ORDERED 와 FREE 시나리오',
  summary: '시나리오 실행 방식 ORDERED 와 FREE 의 차이, FREE 의 저장 규칙, ORDERED 를 FREE 로 바꿀 때 사라지는 것, 관련 action.',
  body: `시나리오의 실행 방식은 두 가지입니다.

## ORDERED

- step 이 순서 있는 행동 목록이고, QA agent 가 그 순서대로 수행합니다.
- step 은 행동 문구(action)를 갖고, test case 에 묶일 수도 있습니다. 이동(move)이나 연결(bridge) 같은 step 은 case 없이 행동만 갖습니다.

## FREE

- step 하나가 test case 하나이고 \`case_id\` 만 필수입니다. 행동 문구는 비워 둘 수 있고, 비면 QA 가 case 의 테스트 step 글을 씁니다.
- 같은 case 를 두 번 넣을 수 없습니다. 저장하면 400(\`invalid_free_scenario\`)입니다.
- GAP, OPENING 같은 알림 줄은 넣을 수 없습니다.
- 수행 순서와 검증 방법은 QA agent 가 정합니다. 판정과 채점은 step 번호로 이어지며 step N 은 N 번째 case 입니다.

## ORDERED 를 FREE 로 바꾸기

- case 에 묶인 step 만 남습니다. case 없는 step(이동, 연결 등)은 사라지고, 사라진 step 과 개수는 사용자에게 알립니다.
- 사라진 step 은 다시 써야 하므로, 바꾸기 전에 사용자 동의를 받습니다.

## action

- \`testScenario.convertToFree\`: ORDERED 시나리오를 FREE 로 바꿉니다.
- \`testScenario.addCases\`: FREE 시나리오 끝에 case 를 추가합니다. 이미 든 case 는 넣을 수 없습니다.
- \`testScenario.removeCases\`: FREE 시나리오에서 case 를 뺍니다. case 자체는 지워지지 않습니다.
- 어떤 case 가 있는지는 \`query\` 의 \`test_cases\` 로 찾고, 이 case 를 어느 시나리오가 인용하는지는 \`test_case\` 로 봅니다.

## build 버전 확인

- case 를 넣기 전에 대상 build 를 확인합니다(안내 문서 \`build-versions\`). 테스트 런이 버전을 따르면 그 버전에 든 case 만 판정되고, FREE 시나리오는 버전에 없는 case 의 step 이 실행에서 빠집니다.
- 넣으려는 case 가 그 build 에 없으면 임의로 판단하지 말고 사용자에게 묻습니다. 선택지는 세 가지입니다. MANUAL case 라면 그 버전에 넣기, 그대로 추가하기(그 build 에서는 판정이 빠짐), 추가하지 않기. MAP case 는 손으로 버전에 넣을 수 없습니다.`,
}
