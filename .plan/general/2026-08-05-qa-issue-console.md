# 2026-08-05 — QA 이슈 목록 화면과 런 이슈 패널

- Date: 2026-08-05
- Jira: ARTEL-247 (Epic ARTEL-13 [Frontend] 사용자 대시보드 개발)
- Branch: `feat/qa-이슈-목록-화면과-런-이슈-패널을-추가한다-ARTEL-247`
- Status: Draft

## Goal

QA 실행이 남긴 이슈를 **한자리에서 보고**, **처리 표시**하고, **원본 런으로 되돌아가게** 한다.

앞선 두 조각: artel-agent-server ARTEL-246(보고 툴), artel-orchestration-server ARTEL-245
(조회·해결 API). 이 화면은 그 API의 유일한 소비자다.

## Non-goals

- 이슈 본문 편집·코멘트·담당자 지정. 서버가 주지 않는다.
- 전역(모든 프로젝트) 이슈 화면. 프로젝트 경계 안에서 먼저 쓸모를 확인한다.
- 이슈 통계·차트.
- 이슈 실시간 스트리밍. 런 로그처럼 SSE로 밀지 않고, 런이 진행 중일 때 패널을 다시 읽을 수단만
  둔다.

## Context / Constraints

- `.agents/docs/DESIGN.md`를 따른다. 특히: 그림자 금지(1px 규칙과 배경 단차로 깊이를 만든다),
  색만으로 상태를 말하지 않는다(아이콘·모양·라벨을 함께), `--font-mono`는 타임스탬프·ID·로그에만.
  심각도는 `status.critical`(BLOCKER/CRITICAL) / `status.warning`(MAJOR) / `text.muted`
  (MINOR/TRIVIAL) 계열로 쓰되 **라벨을 항상 함께** 둔다.
- 서버 응답 파싱은 `projectApi`/`qaApi`의 방어적 파서 관례를 따른다: `asRecord`/`asString`/
  `isDecimalId`로 좁히고, 목록의 깨진 행은 통째로 실패시키지 않고 버린다(`listQaTries` 방식).
- 문구는 전부 `src/i18n/messages/issues.ts`에 두고 en/ko를 채운다. 화면에 영어 리터럴을
  남기지 않는다(`QaTryPage`에 남아 있는 하드코딩 문구는 이 계획의 범위가 아니다).
- 라우팅은 `App.tsx`의 인증 서브트리 안, `AppShell` 아래에 붙인다.

의존 계약(ARTEL-245): `GET /api/projects/{projectId}/issues?status=&severity=&beforeId=&size=`,
`GET /api/qa-tries/{qaTryId}/issues`, `POST /api/issues/{id}/resolve|reopen`(204, 멱등).
응답은 `{ items, nextBeforeId, hasMore }` + `IssueResponse{ id, qaTryId, severity, title,
detail, status, reportedAt, createdAt, resolvedAt, resolvedBy }`.

## Approach (Checklist)

- [ ] **Step 0: Recon** — `qaApi.ts`(파서·페이지 관례), `ProjectDetailPage`(패널 배치·진입점),
      `QaTryPage`(워크스페이스 레이아웃), `i18n/messages.ts`(사전 등록), `App.css`(패널/버튼
      클래스) 확인. *(완료)*

- [ ] **Step 1: 타입·API** — `src/issues/issueTypes.ts`, `src/issues/issueApi.ts`
      - `ISSUE_SEVERITIES`(서버 사다리 순서 그대로), `ISSUE_STATUSES`, `Issue`, `IssuePage`.
      - `listProjectIssues`, `listQaTryIssues`, `resolveIssue`, `reopenIssue`.
      - `severity`/`status`는 알 수 없는 값이면 행을 버린다 — 서버가 사다리를 늘리면 화면이
        모르는 등급을 조용히 잘못 그리는 것보다 낫다.

- [ ] **Step 2: 데이터 훅** — `src/issues/useProjectIssues.ts`, `src/issues/useQaTryIssues.ts`,
      `src/issues/useIssueResolution.ts`
      - 필터 변경 시 재조회(AbortController로 이전 요청 취소), `hasMore`면 더 불러오기.
      - 해결 토글은 **낙관적 반영 후 실패 시 되돌리기**. 서버가 204만 주므로 성공 시 다시 읽을
        이유가 없고, 목록 재조회는 스크롤과 필터를 흔든다.
      - 그 토글·되돌림은 두 훅이 **같은 `useIssueResolution`을 부른다**. 테스트가 없는 로직을
        두 벌 쓰지 않는다. 훅은 `(issue, next) => Promise<void>`와 진행 중 id 집합, 마지막
        실패 메시지를 돌려주고, 목록 상태를 바꾸는 일은 호출한 쪽의 setter로 넘긴다.
      - 실패 시: 상태를 원래대로 되돌리고 행 옆에 오류 문구를 남긴다(토스트 체계가 이 앱에
        없다 — `panel-message` + `role="alert"` 관례를 따른다). 어떤 상태 코드든 동일하게
        다룬다. 되돌림에 성공/실패의 분기는 없다.

- [ ] **Step 3: 표시 컴포넌트** — `src/issues/IssueList.tsx`, `IssueRow.tsx`, `SeverityTag.tsx`
      - 목록 페이지와 런 패널이 **같은 컴포넌트**를 쓴다. 두 화면에 같은 행을 두 번 그리지 않는다.
      - 행: 심각도 태그 · 제목 · 관측 시각(`reported_at`, mono) · 해결 상태 · 처리 버튼 ·
        (목록 페이지에서만) 런으로 가는 링크.
      - `detail`은 접힌 채로 두고 펼치면 `expected`/`actual`/`reproduction`을 읽을 수 있게 한다.
        알려진 키만 골라 그리고, 나머지는 원본 JSON으로 보여준다 — Agent가 무엇을 더 실을지는
        서버가 강제하지 않는다.

- [ ] **Step 4: 목록 페이지** — `src/issues/IssueListPage.tsx` + `App.tsx` 라우트
      - 경로 `/projects/:projectId/issues`.
      - 필터: 해결 여부(기본 **미해결**), 심각도(전체/개별).
      - 각 행에서 `/projects/:projectId/qa-tries/:qaTryId`로 이동.
      - 빈 상태(이슈 없음 / 필터 결과 없음을 구분), 로딩, 오류+재시도.

- [ ] **Step 5: 진입점·패널**
      - `src/issues/QaTryIssuePanel.tsx` 신설 — `useQaTryIssues` + `IssueList`를 감싼 패널.
        `QaTryPage`에 인라인하지 않는다(`CancelQaTryDialog`가 같은 자리에서 독립 컴포넌트인 선례).
        런이 진행 중이면 새로고침 버튼을 둔다.
      - `QaTryPage`의 워크스페이스에 그 패널을 얹는다.
      - `ProjectDetailPage`에 이슈 목록으로 가는 링크(미해결 건수는 붙이지 않는다 — 그 수를 주는
        API가 없고, 세기 위해 전체를 받아오는 것은 화면이 할 일이 아니다).

- [ ] **Step 6: i18n·스타일** — `src/i18n/messages/issues.ts`(en/ko) 및 `messages.ts` 등록,
      `App.css`에 이슈 목록·행·태그 클래스 추가(기존 패널/버튼 클래스 재사용 우선).
      필요한 키: `title`, `projectLinkLabel`, `panelTitle`, `refresh`, `loading`,
      `empty`(이슈 없음)와 `emptyFiltered`(필터 결과 없음)를 구분, `loadError`+`retry`,
      `loadMore`, `filterStatus`/`filterSeverity`+`all`, `severity.{blocker,critical,major,
      minor,trivial}`, `status.{open,resolved}`, `resolve`/`reopen`/`resolveFailed`,
      `resolvedAt`, `reportedAt`, `openQaTry`, `detailToggle`.

- [ ] **Step 7: 검증** — lint / typecheck / build + 수동 확인.

## Validation

- **Commands to run:** `npm run lint`, `npm run typecheck`, `npm run build`
- **Expected output:** 셋 다 성공. 수동: 이슈 있는 프로젝트에서 목록이 뜨고, 필터가 걸리고,
  해결 토글이 즉시 반영되며 새로고침 후에도 유지되고, 행에서 런으로 이동한다. 서버가 아직
  배포되지 않았다면 오류 상태가 그대로 보여야 한다(빈 목록으로 위장하지 않는다).

## Risks & Rollback

- **Risks**
  - ARTEL-245보다 먼저 배포되면 모든 요청이 404다. 오류 상태를 성실히 그려 그 사실이 화면에
    드러나게 한다.
  - 낙관적 토글은 서버 실패 시 되돌려야 한다. 되돌림을 빠뜨리면 화면과 DB가 갈린다 — 테스트가
    없는 영역이므로 코드에서 눈에 띄게 짠다.
- **Rollback steps:** `git revert`. 라우트와 링크가 함께 사라지므로 잔여 진입점이 남지 않는다.

## Open Questions

- 없음.
