# 2026-10-16 — QA 이슈 팀 공유 게시판 화면

- Date: 2026-10-16
- Jira: https://artel-asm.atlassian.net/browse/ARTEL-1114
- Status: Implementation complete; local validation recorded
- Branch: `feat/issue-sharing-ui-ARTEL-1114`
- Base: `origin/develop`의 `89ab3bc`

## Goal

전체 QA 이슈 조회를 유지하면서, 여러 보고서를 묶어 팀과 논의하는 게시판을 제공한다. 승인된 목업을 기존 React·semantic token·i18n 구조에 맞춰 구현한다.

## Approach (Checklist)

- [x] 승인 목업과 기존 IssueList/tracker/member/API 구조 조사.
- [x] API 계약 검토 및 backend 연결.
- [x] 전체 이슈 / 팀 공유 탭, 목록·작성·상세·댓글 UI 구현.
- [x] 로딩·빈 목록·오류·재시도·권한별 동작 구현.
- [x] 실제 API 저장, 다크/라이트, 모바일 및 저장 실패 검증.
- [x] pair review 및 계획 최종 반영.

## Implemented Behavior

- `IssuesSection`에서 전체 이슈와 팀 공유를 전환한다. 기존 필터, tracker 배지·연동, resolve/reopen, QA 실행 이동, `?issue=`를 유지한다.
- 전체 이슈에서 최대 50개를 선택해 공유하거나, 작성기의 가벼운 검색·페이지 목록에서 연결한다.
- 제목·목적·설명 일부·작성자·연결 이슈/댓글 수·상태·활동 시간을 표시한다. 검색과 열린 논의/완료/구독/내 글 필터는 서버가 처리한다. 최근 활동은 현재 읽은 페이지 기준임을 표시한다.
- `?tab=team&discussion=<id>`로 상세를 열고 새로고침·링크 복사·뒤로가기를 지원한다. 탭 전환 시 반대 탭의 선택 ID를 제거한다.
- 글 작성·수정, 프로젝트 멤버 멘션, 댓글·댓글 수정·반응, 구독, 논의 종료/재개, OWNER 고정, 결정 댓글을 제공한다. 논의 종료는 연결 QA 이슈를 해결하지 않는다.
- 원본 보고서는 열 때 조회하며 기존 IssueList로 expected/actual/reproduction, tracker 및 QA 실행 링크를 제공한다.
- 실패해도 작성 입력을 유지하고 동일 요청의 UUID를 재사용한다. 제출 중에는 입력을 잠근다. 이미 읽은 댓글 페이지는 작성·수정 뒤 유지하며 아직 읽지 않은 중간 댓글은 더 보기로 이어진다.
- 프로젝트/사용자 전환은 상태를 분리한다. 조회 취소와 generation 검사로 오래된 응답이 새 상태를 덮지 않게 한다.
- 기존 Dialog와 semantic 색상을 사용하고 한국어/영어, 다크/라이트를 제공한다. 작은 화면은 이 화면 범위에서 상단 조작 폭을 줄인다.

## Validation

- `npm run typecheck`, `npm run build`: 통과. 기존 chunk size 경고는 남아 있다.
- `npm test`: **928개 통과**, 신규 API 계약 테스트 4개 포함.
- 변경 파일 ESLint: 통과. 전체 `npm run lint`는 **기존 오류 6개/경고 3개**. 변경 전 `89ab3bc`에서도 동일 파일·규칙·줄의 결과를 재현했다.
- 실제 Chrome + 별도 PostgreSQL/API: 글 작성, 두 보고서 연결, 멘션, 의도적 503 후 입력 보존·재시도, 새로고침 후 저장 유지, 논의 종료/재개와 QA 상태 독립성, 구독 해제, 원본 보고서, 검색 결과 없음 검증.
- 댓글 초기 30개 → 새 댓글 31개 → 더 보기 36개 → 마지막 댓글 수정 후 36개 유지 검증.
- 다크/라이트 화면, primary 대비, 1024px/390px 가로 넘침 없음, 모바일 작성 Dialog와 Escape 닫기 검증. 브라우저 runtime error 0개.
- `git diff --check` 통과.

## Context / Constraints

- 승인된 QA 이슈 팀 공유 목업을 구현했다. 기존 checkout과 다른 세션의 branch, 개발 서버는 변경하지 않았다.
- Jira Subtask 생성 화면에 `customfield_10080`, `customfield_10081`, `customfield_10015`, `duedate`가 없어 저장소별 Subtask 생성이 거부되었다. 일반 작업으로 우회하지 않았다.
- 사용자가 “분리된 워크트리로부터 브랜치를 바꾼 후 작업 완수될때까지 진행”하도록 명시하여, 이번 로컬 작업에 한해 Story 키를 사용한 별도 branch에서 구현했다. Jira는 진행 중이며 Subtask 설정은 관리자 작업으로 남아 있다.
- 공개 게시판, 외부 알림, 파일 첨부, AI 요약, agent-server 수정은 포함하지 않는다. 멘션은 프로젝트 구성원 표시, 구독은 구독한 글 필터를 제공한다.

## Review

`plan-review` Fast 검토의 계약·재전송·동시성 지적을 반영하고 Medium/Heavy 검토를 통과했다. `pair-review`에서 서버 댓글 수정 시 최근 활동 갱신, 중복 index 제거, 댓글 편집과 이슈 선택기 테스트를 보완했다. 화면은 댓글 작성·수정 뒤 이미 읽은 페이지 유지와 primary 버튼 대비를 수정해 재검토를 통과했다. 초기 댓글 조회 중 제출도 차단했다.

## Local Preview

- 별도 frontend `http://localhost:5184/projects/2/issues?tab=team`, backend `8094`/`8095`.
- 별도 PostgreSQL `5544`, Redis `6384`, 검증 프로젝트 `2`와 예시 QA 보고서 80개. 기존 DB와 분리되어 있다.
- 인증은 `artel-jwt` skill로 발급하고 별도 cookie 이름을 사용했다. 자격 증명은 저장소 밖에 둔다.
- 실제 PostgreSQL/API에 쓰고 다시 읽는 브라우저 검증이다. QA 실행 자체나 외부 tracker 전송을 검증한 것은 아니다.
- 검증 이미지·로그는 `/private/tmp/artel-team-work/`에만 두며 Git에 추가하지 않는다.

## Rollout / Rollback

서버의 추가 API와 migration을 먼저 배포한 뒤 home을 배포한다. 로컬 구현 완료이며 배포나 merge는 하지 않았다. UI를 이전 버전으로 되돌리면 기존 이슈 조회를 계속 사용할 수 있다. 배포된 migration은 삭제하지 않고 추가 테이블과 데이터를 보존한다.
