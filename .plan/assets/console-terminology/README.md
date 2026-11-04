# 콘솔 용어 변경 화면 검증

2026-11-03, ARTEL-1353.

## 검증 범위

- 한국어·영어 × light·dark × 1280px·360px.
- `scenario`: 실제 `NewScenarioDialog`의 유형 선택 화면.
- `scenario-selected`: Test Case 기반 선택 후 제목을 입력한 화면.
- `editor`: 실제 `TestCaseSheet`와 내부 편집기·검토 영역. `TC-001`, `원본 누락 / Source missing`, 필드 이름 확인.
- `cases`: 실제 `TestCaseLibrary`의 첫 방문 튜토리얼.
- `cases-list`: 튜토리얼을 닫은 Test Cases 목록.
- `qa`: 실제 `SinceLastRun`, `RecentRuns`, `FreeScenarioBadge`, 빈 `QaLogTimeline`. 최근 QA·최근 활동·전체 기록 링크·빈 로그 문구 확인.
- `markdown`: 실제 `MarkdownEditor`의 Test Case 도구 버튼. 기존 30px 고정 너비를 문구에 맞게 확장.
- `copy`: 실제 locale 값으로 메뉴·검증 상태·필드 이름을 모은 보조 확인 화면. 제품 페이지가 아닌 검증용 모음.

파일명은 `<화면>-<locale>-<theme>-<width>.png`이다.

## 데이터와 한계

실행 중인 로컬 백엔드가 없어 별도 fixture 페이지에 실제 컴포넌트를 마운트했다. API 응답은 빈 배열로 대체했다. QA 기록과 변경 항목은 검증용 데이터이며, Test Case의 내부 id `900`과 프로젝트 번호 `1`을 다르게 두어 화면 식별자가 `TC-001`로 표시되는지 확인했다.

이 이미지는 화면 렌더링·문구·줄바꿈의 증거다. 로그인, 서버 연동, 저장·실제 QA 실행, 배포 상태를 검증하지 않는다. 모든 제품 페이지의 전체 흐름을 확인한 것은 아니며, 공유 locale 값과 대표 컴포넌트를 확인했다.

## 검사 결과

- TypeScript typecheck 및 production build 통과.
- 기존 테스트 1,615개 통과.
- 변경한 TypeScript·TSX 파일의 ESLint 오류·경고 0건.
- 전체 ESLint는 변경하지 않은 5개 파일에서 기존 오류 5건. 이번 변경 파일에서는 오류 없음.
- locale 모듈 14개의 AST 비교에서 기존 key와 보간 표현식 보존 확인. 빈 로그용 문구 3개만 양쪽 locale에 추가.
- `formatTestCaseId`, `useTestCaseLabel` 구현 변경 없음.
- 독립 검토의 필수 수정 사항 반영 후 `VERDICT: PASS`.

## 추가 용어 감사

runtime agent guide, tool description·승인 요약, QA 조회 오류 및 로컬 순번 문구도 같은 기준으로 보완했다. `TC-001`은 프로젝트가 발급한 식별자이며, 시나리오 안의 순번은 `Test Case 1`로 구분한다. API·도구·enum 이름과 실제 식별자 formatter는 유지했다. Source AST에서 주석·테스트를 제외한 문자열과 JSX 문구를 재검색해 일반 `TC`, 이전 메뉴 이름·시나리오 유형명·`QA Try`가 남지 않았는지 확인했다.
