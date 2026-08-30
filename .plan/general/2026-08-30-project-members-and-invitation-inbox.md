# 2026-08-30 — 프로젝트 멤버 화면과 받은 초대함

- Date: 2026-08-30
- Jira: ARTEL-686 (Story ARTEL-684, Epic ARTEL-683)
- Status: Reviewed (plan review 통과)

## Goal

프로젝트에 누가 있는지 보이고, `OWNER` 가 이메일로 사람을 부를 수 있게 한다. 부름을 받은 사람은 프로젝트 목록 화면에서 수락하거나 거절한다.

`SettingsSection.tsx` 의 주석이 지금 상태를 적어 두었다 — "Members have no path to becoming an owner in this release".

## Non-goals

- 역할 변경 UI. 서버에 그 API 가 없고, ARTEL-685 는 수락이 역할을 건드리지 않도록 만들었다
- 프로젝트에서 스스로 나가기
- 초대 재발송
- 받은 초대 알림 배지를 헤더에 다는 일
- 초대 메일 발송. 서버에 없다

## 소비하는 계약 (ARTEL-685)

| 메서드 | 경로 | 누가 |
| --- | --- | --- |
| GET | `/api/projects/:projectId/members` | 멤버 누구나 |
| DELETE | `/api/projects/:projectId/members/:userId` | `OWNER`, 204 |
| POST | `/api/projects/:projectId/invitations` | `OWNER`, 201 |
| GET | `/api/projects/:projectId/invitations` | `OWNER` |
| DELETE | `/api/projects/:projectId/invitations/:invitationId` | `OWNER`, 204 |
| GET | `/api/invitations` | 로그인한 사람 |
| POST | `/api/invitations/:invitationId/accept` | |
| POST | `/api/invitations/:invitationId/decline` | |

`ProjectMemberResponse` — `userId`, `displayName`, `email`(nullable), `role`, `joinedAt`. **`appUserId` 가 아니다.**

`ProjectInvitationResponse` — `id`, `projectId`, `projectName`, `email`, `role`, `status`, `invitedBy`(표시 이름, nullable), `createdAt`, `expiresAt`.

오류 code 여섯: `duplicate_invitation`, `already_member`, `invitation_already_settled`, `invitation_expired`, `invitation_not_yours`, `last_owner`.

## Context / Constraints

### 이메일 없는 계정에는 빈 목록이 답이 아니다

GitHub 에서 공개 이메일을 받지 못한 계정은 `app_user.email` 이 null 이라 `GET /api/invitations` 이 항상 빈 배열이다. 그 사람에게 "받은 초대가 없다"고 말하면 초대한 쪽과 받는 쪽이 서로를 기다린다.

빈 목록만으로는 두 경우를 구분할 수 없으므로, 판단은 `useAuth` 가 들고 있는 `/api/auth/me` 의 `email` 이 null 인지로 한다(`authTypes.ts` 의 `AuthUser.email` 은 `string | null` 이다).

두 상태는 서로 배타적이다.

- `email` 이 null 이면 조회를 아예 하지 않고 "이메일이 없어 초대를 받을 수 없다" 안내만 그린다. 그 계정에는 초대가 올 수 없으므로 목록을 함께 보일 이유가 없다
- `email` 이 있으면 조회하고, 초대가 한 건 이상일 때만 panel 을 그린다. 없으면 아무것도 그리지 않는다 — 빈 panel 이 늘 떠 있으면 목록 화면의 첫 줄이 언제나 "초대 없음"이 된다

### 서버 오류 code 를 `apiErrors` 에 넣는다

`apiErrorMessage` 는 code 가 `t.projects.apiErrors` 에 있으면 그것을, 없으면 서버 message 를 쓴다. 지금 그 사전에는 `CLIENT_*` 만 있어서, 서버가 준 한국어 문장이 영어 locale 사용자에게 그대로 나간다.

위 여섯 code 를 사전에 더한다. 기존 구조가 이미 그것을 받도록 돼 있고, 초대는 사용자가 오류를 자주 만나는 화면이다(중복 초대, 이미 멤버, 만료).

### Members 를 rail 의 어디에 두나

`WORKSPACE_SECTIONS` 는 QA 가 흐르는 순서다 — 대시보드에서 문서, 런, QA, 이슈, 지식창고로 이어진다. 그 사이에 관리 화면을 끼우면 순서가 깨진다. `sections.ts` 가 `settings` 를 그 목록에서 뺀 것과 같은 이유다.

`project-nav-foot` 에 Settings 위로 넣는다. `WorkspaceSectionId` 에 `members` 를 더하고 `ICON_PATHS` 에 아이콘 한 벌을 그린다.

**`sectionIdFromPath` 에 `members` 분기를 함께 넣어야 한다.** 그 함수는 `WORKSPACE_SECTIONS` 를 훑고 `settings` 만 따로 `if` 로 받는다(`sections.ts:42`). 목록 밖에 두면서 분기를 안 넣으면 `/projects/:id/members` 가 `dashboard` 로 떨어지고, `ProjectWorkspace.tsx:170` 이 그 id 로 제목을 뽑으므로 멤버 화면 머리글이 "대시보드" 가 된다.

### 받은 초대함은 프로젝트 목록 위에 둔다

수락의 결과가 "이 프로젝트가 내 목록에 나타난다"이므로 그 목록 옆이 맞다. 별도 경로를 만들면 사용자가 그 주소를 알아야 초대를 볼 수 있다.

수락하면 `useProjects` 의 `reload` 를 부른다. 목록을 손으로 이어 붙이지 않는 이유는 서버가 정렬과 `total` 을 정하기 때문이다.

### 읽는 중과 실패는 목록 화면의 관례를 따른다

workspace 안의 다른 section 은 `useProject` 가 미리 읽어 둔 것을 그리기만 해서 자기 loading 상태가 없다. Members 는 자기 데이터를 직접 읽으므로 상태를 갖는데, 새 관례를 만들지 않고 `ProjectListPage` 가 이미 쓰는 것을 그대로 쓴다 — 읽는 중에는 `skeleton-line` 줄 몇 개, 실패에는 `panel-message` 와 다시 시도 버튼.

### 확인 dialog 를 세 번째로 복사하지 않는다

`DeleteProjectDialog` 와 `DeleteGameInstanceDialog` 는 이미 구조가 같다 — 같은 `failure`·`pending` 상태, 같은 `Dialog` 껍데기, 같은 버튼 쌍이고 다른 것은 부르는 API 와 문구 세 개뿐이다. 멤버 내보내기가 세 번째가 된다.

셋째가 나타나는 지점이 뽑을 때다. `design-system/primitives/ConfirmActionDialog.tsx` 를 만들어 `title`, 본문, 확인 버튼 문구, 비동기 `onConfirm`, 오류를 문장으로 옮기는 함수를 받게 하고, 기존 둘도 그것을 쓰게 바꾼다. 동작은 그대로다.

납작하게 만들면 안 되는 것 넷.

- **진행 중 문구를 따로 받는다.** 기존 둘은 `pending ? t.projects.shared.deleting : 자기 확인 문구` 를 그린다. `shared.deleting` 을 primitive 안에 박으면 멤버 내보내기가 "삭제 중…" 이라고 말한다. `confirmLabel` 과 `pendingLabel` 을 둘 다 받는다
- **버튼 순서는 취소가 먼저다.** `Dialog.tsx:31` 이 첫 focusable 에 focus 를 준다. 두 파일의 주석이 "파괴적 버튼은 처음 focus 를 갖지 않는다" 를 명시한다
- **`finally` 를 쓰지 않는다.** 성공하면 dialog 가 unmount 되므로 `setPending(false)` 는 `catch` 에만 있어야 한다. `DeleteGameInstanceDialog.tsx:44` 가 그 이유를 적어 두었다
- **`labelledBy` 는 `useId()` 로 primitive 안에서 만든다.** 지금은 파일마다 문자열을 박아 두었는데, 셋이 같은 값을 쓰면 안 된다

기존 파일 둘이 diff 에 들어오는 것은 이 변경이 만든 중복을 이 변경이 치우는 것이라 범위 안이다. 세 번째 복사본을 두고 "나중에 정리한다"고 적는 쪽이 더 나쁘다.

### 낙관적 갱신을 하지 않는다

초대 보내기, 취소, 내보내기, 수락, 거절 모두 서버 응답을 받은 뒤에 화면을 바꾼다. 서버가 409 로 거절하는 경우가 여섯 가지나 되고(중복, 이미 멤버, 이미 처리됨, 만료, 마지막 소유자), 미리 그려 두면 그중 어느 것을 되돌려야 하는지 화면이 알 수 없다.

### `MEMBER` 에게는 초대 UI 를 감춘다

`myRole` 이 `OWNER` 가 아니면 초대 폼, 보낸 초대 목록, 내보내기 버튼을 그리지 않는다. `SettingsSection` 이 삭제 버튼에 이미 같은 규칙을 쓴다. 서버가 어차피 막지만, 눌러 봐야 403 이 나는 버튼은 죽은 UI 다.

`GET /api/projects/:projectId/invitations` 자체를 `OWNER` 일 때만 부른다. 부르면 403 이고, 그 오류를 화면에 띄울 자리도 없다.

**역할은 `useWorkspace()` 의 `project.myRole` 에서 온다.** `MembersSection` 이 그것을 `useMembers` 에 넘기고, hook 은 역할을 스스로 알아내지 않는다. 멤버 목록에는 "이 줄이 나인가"를 말하는 필드가 없어서, 목록에서 역할을 되짚으려면 로그인한 사용자 id 와 맞춰 보는 두 번째 판단 경로가 생긴다. `SettingsSection` 이 이미 믿고 있는 값과 어긋날 수 있는 경로를 만들지 않는다.

### 무엇을 테스트하나

`npm run test` 는 `src/**/*.test.ts` 만 돈다. `.tsx` 컴포넌트 테스트를 돌릴 자리가 없다.

테스트를 위해 파일을 새로 만들지는 않는다. 대신 `memberApi.ts` 의 관용 parser 를 export 하고 `memberApi.test.ts` 가 그것을 부른다 — `knowledgeApi.test.ts` 가 `parseKnowledgeGraph` 와 `parseKnowledgeNode` 를 그렇게 부르고, `contentMapApi.test.ts` 와 `qaApi.test.ts` 도 같다.

덮을 것은 parser 의 degradation 규칙이다. 모르는 역할과 status 를 무엇으로 떨어뜨리는지, 어느 필드가 없을 때 줄을 버리고 어느 필드는 없어도 그리는지. 그것이 이 화면에서 실제로 틀릴 수 있는 유일한 논리다.

만료 판정(`isInvitationExpired`)은 `memberTypes.ts` 에 type guard 옆에 둔다. `projectTypes.ts` 가 `isGenre` 와 `isProjectRole` 을 그렇게 두고 있다. 한 줄짜리를 위해 모듈을 새로 만들지 않는다.

### 쌓은 base

`ProjectNav.tsx` 를 다시 쓴 PR #76(ARTEL-660, rail 접기)이 아직 열려 있다. 이 작업이 같은 파일의 같은 자리를 건드리므로 그 브랜치 위에 쌓고 PR base 도 거기로 잡는다.

PR #78(ARTEL-672, GitHub 저장소 연결)과도 `src/i18n/messages/projects.ts` 에서 겹치는데, 그쪽은 키를 더하는 변경이라 나중에 머지되는 쪽이 문구 블록만 합치면 된다. 그 PR 위에 또 쌓지는 않는다 — base 는 하나만 고를 수 있고, 구조가 겹치는 것은 `ProjectNav` 쪽이다.

## Approach (Checklist)

- [x] **Step 0: Recon**
  - `projectApi.ts` 가 sibling module 이 쓰라고 export 해 둔 것들을 확인했다 — `readJson`, `toApiError`, `jsonRequest`, `asRecord`, `isOneOf`, `projectPath`
  - `apiErrorMessage` 가 code 를 사전에서 찾는 구조임을 확인했다
  - `DeleteProjectDialog` 의 확인 dialog 패턴과 `useProjects` 의 hook 패턴을 확인했다
  - `sections.ts` 가 `settings` 를 목록 밖에 둔 이유를 확인했다

- [ ] **Step 1: 타입과 API**
  - `src/projects/memberTypes.ts` — `ProjectMember`, `ProjectInvitation`, `InvitationStatus`, `isInvitationExpired`
  - `src/projects/memberApi.ts` — 위 여덟 경로. `projectApi.ts` 의 helper 를 그대로 쓴다
  - DELETE 셋은 204 라 본문이 없다. `readJson` 을 쓰면 빈 본문에서 `CLIENT_UNREADABLE_RESPONSE` 가 난다. `deleteProject`(`projectApi.ts:374`)처럼 `if (!response.ok) throw await toApiError(response)` 만 한다
  - accept 와 decline 은 `ProjectInvitationResponse` 를 돌려준다

- [ ] **Step 2: parser 테스트**
  - `src/projects/memberApi.test.ts` — degradation 규칙을 덮는다

- [ ] **Step 3: 확인 dialog 를 primitive 로 뽑는다**
  - `src/design-system/primitives/ConfirmActionDialog.tsx`
  - `DeleteProjectDialog` 와 `DeleteGameInstanceDialog` 를 그 위로 옮긴다

- [ ] **Step 4: hook**
  - `src/projects/useMembers.ts` — `(projectId, myRole)` 을 받는다. `OWNER` 가 아니면 초대는 읽지 않는다
  - `src/projects/useInvitations.ts` — 받은 초대함. 로그인한 계정의 `email` 이 null 이면 읽지 않는다

- [ ] **Step 5: 화면**
  - `src/projects/workspace/MembersSection.tsx`
  - `src/projects/InvitationInbox.tsx`

- [ ] **Step 6: 붙이기**
  - `sections.ts` 에 `members` 를 `WorkspaceSectionId` 와 `sectionIdFromPath` 양쪽에 추가
  - `ProjectNav` foot 에 링크와 `ICON_PATHS` 아이콘
  - `App.tsx` 에 `members` route
  - `ProjectListPage` 에 초대함. `status === 'loading' | 'error' | 'ready'` 분기 **밖**에 둔다 — 목록이 읽는 중이거나 실패해도 초대함은 남아야 한다

- [ ] **Step 7: 문구**
  - `src/i18n/messages/projects.ts` 에 en 과 ko. `apiErrors` 에 서버 code 여섯
  - `Messages` 타입은 `Localized<typeof messages.en>` 이라 영어 사전에 키를 더하면 타입이 따라 넓어지고, 한국어 사전이 같은 키를 갖지 않으면 `npm run typecheck` 가 잡는다. 타입을 따로 손댈 곳은 없다

## Validation

- **Commands to run:** `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`
- **Expected output:** 전부 통과. 새 `.test.ts` 가 만료와 정렬을 덮는다
- 로컬 스택을 띄우고 계정 둘로 확인한다. PR 의 Example 절에 각 상태의 화면 캡처를 넣는다

## Risks & Rollback

- **Risks:**
  - ARTEL-685 가 배포되기 전에는 새 경로가 404 다. 그때 이 화면은 "불러오지 못했다"를 띄운다. 머지 순서로 막는다
  - `/api/auth/me` 의 `email` 로 초대 가능 여부를 판단하는 것은 서버 규칙을 화면이 한 벌 더 갖는 것이다. 서버가 그 규칙을 바꾸면 둘이 어긋난다. 다른 길이 없다 — 빈 목록만으로는 두 경우가 구분되지 않는다
  - PR #78 과 `projects.ts` 에서 텍스트 conflict 가 난다. 문구 블록을 합치면 되고 구조 충돌은 아니다
  - 오류 code 문자열은 정확히 일치해야 한다. `code in t.projects.apiErrors` 로 찾으므로 `duplicate_invitation` 을 `DUPLICATE_INVITATION` 으로 적으면 조용히 서버의 한국어 문장으로 떨어진다 — 이 작업이 없애려는 바로 그 증상이다
  - 수락하면 `useProjects.reload` 가 목록을 `loadingState` 로 되돌려 skeleton 이 한 번 번쩍인다. 초대 한 건을 받아들이는 대가로는 받아들일 만하고, 목록을 손으로 이어 붙이는 쪽은 정렬과 `total` 을 화면이 다시 계산하게 만든다
  - `ConfirmActionDialog` 로 옮기면서 기존 dialog 둘의 동작이 바뀌면 프로젝트 삭제와 인스턴스 삭제가 함께 깨진다. 문구 키와 오류 분기를 그대로 넘기고, PR 의 Example 에 두 dialog 의 화면 캡처도 함께 넣는다
- **Rollback steps:** rail 링크와 route 를 걷어내면 화면이 사라진다. API module 은 남지만 아무도 부르지 않는다. `ConfirmActionDialog` 는 기존 둘이 쓰고 있으므로 함께 되돌려야 한다

## Open Questions

- 없음
