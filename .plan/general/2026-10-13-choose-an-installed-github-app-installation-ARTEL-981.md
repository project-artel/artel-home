# 2026-10-13 — 이슈 트래커 연결에 installation 선택 화면과 계정 변경 버튼 추가

- Date: 2026-10-13
- Jira: ARTEL-981 (스토리 ARTEL-979, 먼저 merge 할 것: ARTEL-980)
- Status: Implemented

## Goal

프로젝트 설정의 이슈 트래커 패널에서 OWNER 가 이미 GitHub App 이 설치된 계정을 골라 프로젝트에 연결하고,
연결된 계정을 연결 해제 없이 바꿀 수 있게 한다.

## Non-goals

- game instance 단위 연결.
- Jira provider.
- 서버 API 구현. ARTEL-980 이 맡는다.
- 단위 테스트 도입. 이 저장소에는 단위 테스트가 설정되어 있지 않다(`project.md`).

## Context / Constraints

### 지금 화면

`src/tracker/TrackerLinkPanel.tsx` 는 `trackerLink` 하나로 세 상태를 그린다.

| 상태 | 조건 | OWNER 에게 보이는 것 |
| --- | --- | --- |
| NotConnected | `trackerLink === null` | "GitHub 연결" → `install-url` 로 이동 |
| RepositoryPicker | `trackerLink.repository === null` | installation 의 저장소 목록 |
| Connected | 저장소가 있음 | 자동 `sync` severity, 연결 해제 |

설치 복귀는 `?tracker=connected|failed` 로 오고, mount 시점에 한 번 읽은 뒤 URL 에서 지운다.

### ARTEL-980 이 정한 서버 계약

모든 경로는 OWNER 만 부른다.

| Method | Path | 응답 | 오류 code |
| --- | --- | --- | --- |
| GET | `/api/projects/{projectId}/tracker/github/authorize-url` | `{ url }` | `tracker_not_configured` (503) |
| GET | `/api/projects/{projectId}/tracker/github/installations` | `{ items: [{ installationId: string, account: string, accountType: 'USER' \| 'ORGANIZATION' }] }` | `tracker_authorization_required` (409) |
| PUT | `/api/projects/{projectId}/tracker/github/installation` 본문 `{ installationId }` | `{ link: TrackerLink }` | `tracker_authorization_required` (409), `tracker_installation_not_verified` (400) |

- 인가가 끝나면 서버가 `.../settings?tracker=choose` 로 되돌린다.
- installation 이 바뀌면 서버가 `repository` 를 비운다. 응답의 `link` 를 그대로 적용하면 패널이
  RepositoryPicker 로 넘어간다.
- 기존 `install-url` 은 "다른 계정에 설치" 에 계속 쓴다.

## Approach (Checklist)

- [ ] **Step 0: Recon** — 끝났다. 구현 전에 `.agents/docs/DESIGN.md` 를 읽고 버튼, badge, 목록 행, 오류
  표시를 기존 tracker 패널과 같은 class 로 맞춘다.

- [ ] **Step 1: 타입과 API**
  - `src/tracker/trackerTypes.ts`: `TRACKER_ACCOUNT_TYPES = ['USER', 'ORGANIZATION'] as const`,
    `TrackerInstallation { installationId: string; account: string; accountType: TrackerAccountType }`.
  - `src/tracker/trackerApi.ts`:
    - `getTrackerAuthorizeUrl(projectId, provider)`: `getTrackerInstallUrl` 과 같은 모양.
    - `listTrackerInstallations(projectId, provider, signal)`: 모르는 `accountType` 이나 빈 필드가 있는
      행은 버린다(`parseTrackerRepositoryList` 와 같은 규칙).
    - `selectTrackerInstallation(projectId, provider, installationId)`: `PUT`, 응답을
      `parseTrackerLink` 로 읽는다. 읽지 못하면 `updateTrackerLink` 와 같은 방식으로
      `CLIENT_MALFORMED_TRACKER_LINK` 오류를 던진다.

- [ ] **Step 2: `TrackerLinkPanel` 에 선택 단계 추가**
  - mount 시점에 읽는 플래그에 `choose` 를 더한다. URL 에서 지우는 동작은 기존과 같다.
  - 선택 단계 여부는 `initialTrackerFlag === 'choose' && !pickerClosed` 로 계산한다. `pickerClosed` 는
    취소나 연결 성공 때 true 가 되는 로컬 상태 하나다. OWNER 이고 선택 단계이면 다른 세 상태 대신
    InstallationPicker 를 그린다. OWNER 가 아니면 무시한다.
  - URL 에서 플래그를 지운 뒤 새로고침하면 선택 단계는 다시 열리지 않는다. 의도한 동작이다. 목록은 서버에
    10분 동안 남아 있지만, 다시 "GitHub 연결"을 누르면 인가를 한 번 더 거쳐 새 목록을 받는다.
  - 연결을 시작하는 함수 `startAuthorization()` 은 `getTrackerAuthorizeUrl` 로 받은 주소로
    `window.location.assign` 한다. 실패 문구는 기존 `connectFailed` 를 쓴다.
  - "GitHub 연결" 버튼(NotConnected)은 `startAuthorization()` 을 부른다. 지금처럼 `install-url` 로 바로
    보내지 않는다.
  - RepositoryPicker 와 Connected 에 OWNER 전용 "계정 변경" 버튼을 추가하고 `startAuthorization()` 을
    부른다.

- [ ] **Step 3: `InstallationPicker` 컴포넌트**
  - 같은 파일 안의 함수 컴포넌트로 둔다(기존 `RepositoryPicker` 와 같은 배치).
  - 열릴 때 `listTrackerInstallations` 를 부른다. 로딩, 오류, 빈 목록, 목록 네 상태를 RepositoryPicker
    와 같은 방식(token 으로 요청 구분, `AbortController`)으로 그린다.
  - 목록 행: `account`, `accountType` badge(User / Organization), "연결" 버튼. 요청이 진행 중이면 모든
    행의 버튼을 비활성화한다(RepositoryPicker 의 `connectingRepo` 와 같은 방식). 성공한 뒤에 도착한 응답은
    무시한다. 누르면
    `selectTrackerInstallation` → `applyTrackerLink(link)` → `pickerClosed=true` →
    `aria-live` 로 "<account> 계정을 연결했습니다" 를 알린다.
  - 목록 아래: "다른 계정에 설치" 버튼 → 기존 `getTrackerInstallUrl` 로 이동. 빈 목록이면 안내 문구와
    이 버튼만 보인다.
  - 오류 code 가 `tracker_authorization_required` 이면 "GitHub 인가가 만료되었습니다" 문구와
    "다시 인가" 버튼(`startAuthorization()`)을 보인다. 그 밖의 오류는 재시도 버튼을 보인다.
  - "취소" 버튼 → `pickerClosed=true`. 기존 `trackerLink` 상태로 돌아간다.
  - 빈 목록일 때 GitHub 설치 화면으로 자동 이동하지 않는다. 사용자가 안내 문구를 읽고 버튼을 누르게 한다.
    처음 연결하는 사람에게는 클릭이 한 번 늘지만, 어떤 계정이 없는지 보이지 않은 채 다른 사이트로 넘어가는
    것보다 낫다고 판단했다.

- [ ] **Step 4: 문구**
  - `src/i18n/messages/tracker.ts` 의 영어와 한국어 양쪽에 같은 key 를 추가한다.
    `chooseInstallationCopy`, `installationsLoading`, `installationsFailed`, `installationsEmpty`,
    `authorizationExpired`, `reauthorize`, `accountTypeLabels: Record<TrackerAccountType, string>`,
    `useInstallation`, `selectInstallationFailed`, `installOnAnotherAccount`, `changeAccount`,
    `accountConnected(account)`.
  - "취소" 와 "다시 시도" 는 기존 `t.projects.shared.cancel` 과 `t.projects.shared.retry` 를 쓴다.
  - `apiErrorMessage` 가 서버 code 로 문구를 고르는 구조라면 두 오류 code 를 등록한다. 아니면 위 문구를
    패널에서 직접 고른다.

## Validation

- **Commands to run:** `npm run lint`, `npm run typecheck`, `npm run build`.
- **Expected output:** 셋 다 오류 없이 끝난다.
- **Manual:** ARTEL-980 branch 의 서버를 로컬에서 띄우고 `artel-jwt` 로 OWNER 세션을 만든다.
  실제 GitHub 인가는 로컬에서 할 수 없으므로, Redis 에 목록 키를 직접 넣고
  `/projects/<id>/settings?tracker=choose` 를 열어 아래를 screen capture 한다.
  1. 목록 두 건(User, Organization)
  2. 빈 목록
  3. `tracker_authorization_required`(키 없음)
  4. 연결 후 RepositoryPicker 와 "계정 변경" 버튼
  5. MEMBER 로 같은 주소를 열었을 때 선택 화면이 보이지 않음

## Risks & Rollback

- **Risks:**
  - ARTEL-980 보다 먼저 배포되면 "GitHub 연결" 이 404 를 받는다. merge 순서를 지킨다.
  - 이미 App 을 인가한 사람은 GitHub 화면 없이 바로 돌아온다. 화면이 한 번 깜빡이는 것처럼 보일 수 있다.
- **Rollback steps:** `git revert`.

## Implementation notes

- 서버 code `tracker_installation_not_verified`(400)는 서버 메시지 대신 `selectInstallationFailed` 문구와
  "다시 승인" 버튼으로 처리한다. 목록이 낡았을 때만 생기고, 다시 승인하면 목록이 새로 만들어진다.
- 다시 승인이 필요한 실패 뒤에는 이전 목록을 숨긴다. 이미 실패한 행을 다시 누르지 않게 하기 위해서다.
- 버튼은 `.tracker-actions` 가로 묶음에 둔다. 첫 screen capture 에서 버튼이 간격 없이 붙고, 연결된 상태의
  두 버튼이 세로로 꽉 차게 쌓였다.
- screen capture 는 `.plan/assets/2026-10-13-choose-an-installed-github-app-installation-ARTEL-981/` 에 있다.

## Merge 전 확인

- ARTEL-980 PR 의 staging App 실제 왕복 확인이 끝나야 이 PR 도 merge 한다.

## Open Questions

- 없음.
