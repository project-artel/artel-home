import type { Guide } from './index'

export const freeScenarios: Guide = {
  id: 'free-scenarios',
  title: '단계 기반과 Test Case 기반 시나리오',
  summary: '단계 기반과 Test Case 기반 실행 방식의 차이, 저장 규칙, 유형 변경 시 사라지는 단계와 관련 action.',
  body: `화면의 단계 기반은 \`ORDERED\`, Test Case 기반은 \`FREE\` 실행 방식입니다.

## 단계 기반

- 단계가 순서 있는 행동 목록이고, QA agent 가 그 순서대로 수행합니다.
- 단계는 행동 문구(action)를 갖고, Test Case에 묶일 수도 있습니다. 이동(move)이나 연결(bridge) 같은 단계는 Test Case 없이 행동만 갖습니다.

## Test Case 기반

- 단계 하나가 Test Case 하나이고 \`case_id\` 만 필수입니다. 행동 문구는 비워 둘 수 있고, 비면 QA 가 Test Case의 테스트 단계 글을 씁니다.
- 같은 Test Case를 두 번 넣을 수 없습니다. 저장하면 400(\`invalid_free_scenario\`)입니다.
- GAP, OPENING 같은 알림 줄은 넣을 수 없습니다.
- 수행 순서와 검증 방법은 QA agent 가 정합니다. 판정과 채점은 단계 번호로 이어지며 단계 N은 N 번째 Test Case입니다.

## 단계 기반을 Test Case 기반으로 바꾸기

- Test Case에 묶인 단계만 남습니다. Test Case 없는 단계(이동, 연결 등)은 사라지고, 사라진 단계와 개수는 사용자에게 알립니다.
- 사라진 단계는 다시 써야 하므로, 바꾸기 전에 사용자 동의를 받습니다.

## action

- \`testScenario.convertToFree\`: 단계 기반 시나리오를 Test Case 기반으로 바꿉니다.
- \`testScenario.addCases\`: Test Case 기반 시나리오 끝에 Test Case를 추가합니다. 이미 든 Test Case는 넣을 수 없습니다.
- \`testScenario.removeCases\`: Test Case 기반 시나리오에서 Test Case를 뺍니다. Test Case 자체는 지워지지 않습니다.
- 어떤 Test Case가 있는지는 \`query\` 의 \`test_cases\` 로 찾고, 이 Test Case를 어느 시나리오가 인용하는지는 \`test_case\` 로 봅니다.

## build 버전 확인

- Test Case를 넣기 전에 대상 build 를 확인합니다(안내 문서 \`build-versions\`). 테스트 런이 버전을 따르면 그 버전에 든 Test Case 만 판정되고, Test Case 기반 시나리오는 버전에 없는 Test Case의 단계가 실행에서 빠집니다.
- 넣으려는 Test Case가 그 build 에 없으면 임의로 판단하지 말고 사용자에게 묻습니다. 선택지는 세 가지입니다. MANUAL Test Case 라면 그 버전에 넣기, 그대로 추가하기(그 build 에서는 판정이 빠짐), 추가하지 않기. MAP Test Case는 손으로 버전에 넣을 수 없습니다.`,
}
