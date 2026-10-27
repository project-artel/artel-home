# 2026-10-27 — TC 호버 상세 팝오버 추가

- Date: 2026-10-27
- GitHub Issue: None
- Status: Implemented

## Goal
TC 표시에서 TC 내용·사전 조건·기대 결과만 간결하게 보여준다. 긴 내용은 내부 스크롤과 복사를 지원한다.

## Non-goals
TC 편집, 기존 클릭 동작, 서버 계약 변경.

## Context / Constraints
사용자 변경을 보존한다. 목록 응답에는 evidenceGaps가 없어 상세 조회가 필요하다. 화면의 gameBuildId를 유지한다.

## Approach (Checklist)
- [x] **Step 0: Recon** 채팅, 토론, 시나리오, 선택 목록, 라이브러리, QA rail과 로그, 실행 맵 확인.
- [x] **Step 1: Implementation** 공유 상세 본문과 팝오버 추가.
- [x] **Step 2: Tests** 타입 검사, lint, 빌드, 호버 이동, 스크롤, 키보드, 화면 경계와 테마 검증.
- [x] **Step 3: Rollout / Rollback** 프론트엔드 변경만 적용.

## Validation
- **Commands to run:** npm run typecheck, npm run lint, npm test, npm run build, git diff --check
- **Expected output:** 관련 오류 없음. 호버와 포커스에서 전체 TC 표시, 기존 클릭 유지.

## Risks & Rollback
- **Risks:** 버전 혼동, 오래된 응답, 부모 클릭 전파.
- **Rollback steps:** 이번 변경만 되돌린다.

## Open Questions
없음.

## 검증 결과
타입 검사 통과. 변경 파일 lint 오류 없음(RunMapPage의 기존 dependency 경고 1개). 단위 테스트 1,473개 통과. Vite 빌드 통과(기존 chunk 크기 경고). 모의 API 브라우저 검증에서 상세 요청 시점·빌드 버전·호버 이동·스크롤·포커스·Escape·기존 클릭·팔레트 방향키·오류 표시·테마·1440/1024/390px 경계 통과. 실제 로그인 서버 데이터 검증은 수행하지 않음.

## 리뷰 반영
RunMap의 gameBuild 필드, 목록의 버전 전달, 기존 ArrowDown 보존, 가져오기 목록의 TC 적용 누락 수정. 공유 상세 본문으로 중복 방지.
`mousedown`과 `dragstart`의 portal 전파를 차단하고 부모 목록 핸들러가 실행되지 않는 브라우저 검증 통과.

## PR 브랜치 적용
최신 develop(c124166)에 TC 호버 변경만 적용했다. 가상 스크롤과 InlineCode, 판정 이력의 EditorBadge·carriedFrom, TC 목록 revision 갱신을 보존했다. 새 QA Flow·FREE Raw TC 표시에도 같은 팝오버를 적용했다. CSS는 전역 스타일에서 불러와 QA 서버 렌더링 테스트를 유지했다.

## 2026-10-28 호버 정보 축소
사용자 피드백에 따라 340px 카드에 TC 내용·사전 조건·기대 결과만 표시한다. TestCasePreview는 판정 이력을 조회하지 않으며 씬·상태·cheats·behaviors·생성 정보는 표시하지 않는다. 기존 상세 화면과 클릭 동작은 유지한다. 한국어 예시 TC로 밝은/어두운 테마·좁은 화면·로딩·오류 캡처를 교체했다. 타입 검사, 변경 파일 lint, 빌드, 브라우저 검증에서 세 가지 내용만 표시되는지와 버전·키보드·스크롤·클릭 유지 확인.

## 2026-10-28 호버 디자인 수정
기존 InfoHint와 TC 검색 상세 패널의 토큰을 참고해 360px 카드의 배경·테두리·글자 크기를 맞췄다. TC 내용 아래에 구분선을 두고 사전 조건·기대 결과를 두 열로 정렬했다. 닫기 버튼을 제거하고 Escape와 호버 이탈로 닫는 동작을 유지했다. 실제 앱 폰트를 적용한 TestCaseSpecModal에서 모의 API 데이터로 밝은·어두운 테마와 좁은 화면을 다시 촬영했다. TypeScript·ESLint·Vite 빌드·브라우저 동작 검증 통과.
