# ARTEL 디자인 시스템

ARTEL의 웹 화면은 Blueprint Paper를 사용합니다. 밝은 테마는 크림색 바탕과 잉크색 본문을 쓰고, 어두운 테마는 같은 역할의 토큰을 어두운 값으로 바꿉니다. 화면의 구획은 배경 단계, 여백, 1px 경계선으로 표현합니다.

## 토큰과 적용 범위

토큰의 값은 각 앱의 CSS에서 관리합니다. 앱 사이에서 색이나 글꼴을 바꿀 때는 아래에 있는 동일 역할의 토큰을 함께 확인합니다.

| 역할 | 콘솔과 관리자 | 온보딩 |
| --- | --- | --- |
| 페이지 배경 | `--color-bg-canvas` | `--paper` |
| 보조 표면 | `--color-bg-surface`, `--color-bg-raised` | `--paper-2` |
| 기본 및 보조 텍스트 | `--color-text-primary`, `--color-text-secondary` | `--ink`, `--ink-2` |
| 기본 경계선 | `--color-border-subtle` | `--rule` |
| 주요 동작 및 선택 강조 | `--color-action-primary` | `--flare` |
| 제목 / 본문 / 코드 | `--font-display` / `--font-sans` / `--font-mono` | `--font-display` / `--font-body` / `--font-mono` |

- 콘솔과 `/admin`은 [콘솔 토큰](../src/styles/tokens.css)과 같은 테마 전환을 사용합니다. 온보딩은 [온보딩 토큰](https://github.com/project-artel/onboarding/blob/HEAD/src/styles/tokens.css)을 사용합니다. 독립 실행 관리자 앱은 [자체 토큰](https://github.com/project-artel/admin-page/blob/HEAD/src/styles/tokens.css)을 사용합니다.
- 제목은 Space Grotesk, 본문은 Pretendard, 코드와 식별자는 IBM Plex Mono를 기본으로 합니다. 표의 수치와 시간처럼 자릿수 정렬이 중요한 곳에는 `tabular-nums`를 적용합니다.
- 간격과 모서리는 앱의 `--space-*`와 `--radius-*` 토큰을 사용합니다. 일반 본문과 보조 텍스트는 밝은 테마와 어두운 테마에서 실제 배경을 기준으로 대비를 확인합니다.

## 화면 구조와 컴포넌트

| 요소 | 적용 기준 | 콘솔 구현 |
| --- | --- | --- |
| 앱 상단 바 | 서비스 이름, 전역 탐색, 계정, 테마를 앱 상단 바에 둡니다. | [AppShell](../src/shell/AppShell.tsx) |
| 페이지 제목 | `h1`을 페이지 헤더에 둡니다. 페이지 탐색, 필터, 본문을 아래에 배치합니다. 일반 페이지는 공통 폭을 쓰고 넓은 표가 필요한 페이지는 컨테이너에서 폭을 지정합니다. | [App.css](../src/App.css)의 `.page`, `.page-header) |
| 섹션 탐색 | 같은 영역의 화면을 오갈 때 공통 내비게이션을 사용합니다. 현재 화면은 밑줄과 `aria-current="page"`로 표시합니다. | [section-nav.css](../src/design-system/section-nav.css) |
| 버튼과 필터 | 주요 동작에는 primary, 보조 동작에는 secondary, 삭제 등에는 danger를 사용합니다. 필터와 입력에는 연결된 레이블을 둡니다. | [App.css](../src/App.css)의 `.button`, 관리자 `.control` |
| 표와 집계 | 표 머리글과 데이터 행을 구분합니다. 숫자 열을 오른쪽 정렬하고 넓은 표의 가로 스크롤은 컨테이너 안에 둡니다. 집계는 구분선으로 묶어 비교할 수 있게 합니다. | [dashboard.css](../src/admin/shared/dashboard.css)의 `.table-scroll`, `.table`, `.rail` |
| 상태 | 로딩, 빈 결과, 오류, 비활성 상태의 의미를 텍스트로 전달합니다. 성공, 경고, 실패 색은 의미를 보조합니다. | 관리자 `.notice`, `.status` |
| 대화상자 | 콘솔의 공통 대화상자를 사용합니다. 삭제처럼 되돌리기 어려운 동작은 제목과 실행 버튼에 대상과 동작을 명시합니다. | [Dialog](../src/design-system/primitives/Dialog.tsx), [ConfirmActionDialog](../src/design-system/primitives/ConfirmActionDialog.tsx) |

관리 화면의 작업 영역은 단색 배경을 사용합니다. 필터와 표는 경계선이 있는 표면으로 묶고, 표 머리글은 한 단계 다른 배경으로 구분합니다. 설정 화면은 설정 항목별 공통 패널을 사용합니다.

## 반응형과 접근성

- 화면 폭이 줄어들면 탐색 항목과 필터를 줄바꿈합니다. 표, 코드, 그래프의 넓은 콘텐츠는 해당 영역 안에서 탐색할 수 있게 합니다.
- 모바일에서 변경한 내비게이션과 주요 조작 영역은 최소 높이 44px을 확보합니다. 키보드로 이동할 때 초점이 보이고 DOM 순서대로 조작할 수 있어야 합니다.
- 사용자 설정의 테마와 `prefers-reduced-motion`을 따릅니다. 상태, 선택, 오류는 색과 함께 글자나 접근성 속성으로 표시합니다.
- UI 변경은 실제 경로에서 앱 상단 바와 인접 화면을 함께 확인합니다. 밝은 테마와 어두운 테마, 데스크톱과 모바일, 키보드 이동, 로딩·빈 결과·오류 상태를 변경 범위에 맞춰 확인합니다.

## 공통 스타일 추가 기준

새 화면을 만들기 전에 기존 토큰과 컴포넌트에서 같은 역할을 찾습니다. 둘 이상의 기능이 같은 UI 패턴을 쓸 때는 공통 클래스나 컴포넌트로 옮기고 사용처와 상태를 이 문서에 기록합니다. 그래프 배치와 같은 기능별 규칙은 해당 기능에 둡니다.
