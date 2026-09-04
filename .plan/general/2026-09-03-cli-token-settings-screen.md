# 2026-09-03 — 계정 설정에 CLI 토큰 발급·폐기 화면을 만든다

- Date: 2026-09-03
- Jira: ARTEL-781 (Story ARTEL-779, Epic ARTEL-778)
- Status: Draft

## Goal

`/account` 화면에 `CliTokenPanel` 을 하나 더 붙인다. 이름과 만료를 받아 `artel-cli` 인증에 쓸
토큰을 발급하고, 발급 직후에만 원문을 보여주고, 목록에서 만료·폐기 상태를 구분해 보여주고,
확인을 거쳐 폐기한다.

## Non-goals

- 남의 토큰을 보는 관리자 화면
- scope 입력. 서버가 아직 해석하지 않는다(ARTEL-780 Constraints)
- 토큰 재발급이나 이름 변경. 계약에 그 API 가 없다
- 목록 정렬을 화면이 다시 계산하는 일. 서버가 준 순서를 그대로 그린다

## 소비하는 계약 (ARTEL-780)

| 메서드 | 경로 | 요청 | 응답 |
| --- | --- | --- | --- |
| POST | `/api/auth/cli-tokens` | `{"name": string, "expiresInDays": number\|null}` | 201 `{"id","name","token","createdAt","expiresAt"}` |
| GET | `/api/auth/cli-tokens` | — | 200 `[{"id","name","createdAt","lastUsedAt","expiresAt","revokedAt"}]` |
| DELETE | `/api/auth/cli-tokens/{id}` | — | 204 |

`token` 은 발급 응답에만 실린다. `expiresAt` 은 무기한이면 `null`. 90일 기본값은 이 콘솔이
미리 골라 두는 값이지 서버 기본값이 아니다(ARTEL-780 은 `expiresInDays` 를 필수로 받는다) —
그래서 select 는 값 없이 열리지 않고 처음부터 `90` 을 선택한 채로 뜬다.

DELETE 는 서버 쪽에서 행을 지우는 게 아니라 `revoked_at` 을 찍는 폐기다
(ARTEL-780 AC: "폐기한 토큰으로 부른 다음 요청은 401"). 그래서 GET 목록에는 폐기된 토큰도
그대로 남고, 화면이 `revokedAt` 값으로 그 줄을 구분해 그려야 한다 — 서버가 걸러주지 않는다.
만료도 마찬가지로 목록에서 빠지지 않는다: AC 자체가 "만료된 것과 폐기된 것은 구분되어 보인다"
고 요구하므로, 구분해 그릴 대상이 목록에 남아 있다는 뜻이다.

## Context / Constraints

### 이 화면은 새 경로가 아니라 `AccountSettingsPage` 의 세 번째 panel 이다

`AccountSettingsPage.tsx:29` 의 주석이 이미 이 결정을 한 번 내려 두었다 — "`ARTEL-733` adds
`EmailPanel` as a sibling of `ProfilePanel` in the same `section-columns` list, rather than
folding email into `ProfilePanel` or reshaping the page." 계정 설정은 지금 tab 이나 하위 경로가
없는 한 페이지고, 그 페이지가 `section-columns` 에 panel 을 나란히 두는 식으로 커 왔다. CLI
토큰만 `/account/cli-tokens` 같은 새 경로로 빼면 이 페이지에 처음으로 하위 라우팅을 들여오는
것이고, 그 구조를 지금 이 작업 하나 때문에 만들 이유가 없다. `CliTokenPanel` 을 `ProfilePanel`,
`EmailPanel` 과 같은 `section-columns` 안에 세 번째로 둔다(`AccountSettingsPage.tsx:53`).

### 원문은 panel 의 local state 에만 있고, unmount 가 지우는 유일한 장치다

`CliTokenPanel` 안에 `const [createdToken, setCreatedToken] = useState<CliTokenCreated | null>(null)`
를 둔다. `AuthProvider`, `AuthContext`, sessionStorage, localStorage 어디에도 원문을 올리지
않는다 — 이 값을 세션이나 전역 상태로 올리는 순간, 그 값을 지우는 일을 이 작업이 챙겨야 할
새 코드 경로가 하나 더 생긴다.

`/account` 는 `App.tsx:90` 의 `<Route path="/account" element={<AccountSettingsPage />} />`
하나뿐이라, 다른 경로로 갔다가 돌아오면 React Router 가 `AccountSettingsPage` 를 통째로
unmount 했다가 새로 mount 한다. `CliTokenPanel` 도 그 자식이라 함께 unmount 되고, 돌아왔을 때는
`createdToken` 이 `useState` 초기값인 `null` 로 되돌아간 새 컴포넌트다 — 화면을 벗어나면 원문이
사라진다는 제약이 컴포넌트 트리 구조에서 그냥 따라 나온다. 이 화면 안에서 한 번 더 지울 수
있는 자리도 둔다: 발급 폼 제출이 성공하면 이전 `createdToken` 을 새 값으로 덮고, 목록 아래
"닫기(`t.account.cliTokens.dismissReveal`)" 버튼을 눌러도 `null` 로 되돌린다 — 사용자가
떠나기 전에 스스로 지울 수 있는 경로이지, unmount 를 대신하는 장치는 아니다.

### 발급 폼은 열고 닫는 토글이 아니라 항상 보인다

`ProfilePanel`, `EmailPanel` 은 "읽기 → 편집 요청" 리듬을 쓰지만, `MembersSection.tsx` 의
`InvitePanel` 은 다르다 — 부르는 폼이 늘 떠 있고, 보낸 결과가 그 바로 아래 목록에 선다
(`MembersSection.tsx:172` 주석: "폼과 아직 답을 기다리는 초대가 한 panel 에 있다"). CLI 토큰
발급도 반복적으로 하는 동작이고 발급 직후 결과(원문)를 같은 자리에서 봐야 하므로,
`ProfilePanel` 이 아니라 `InvitePanel` 의 리듬을 따른다. 이름 입력, 만료 select, 발급 버튼을
`CliTokenPanel` 헤더 바로 아래 항상 그리고, 그 아래에 원문 reveal 블록(있을 때만), 그 아래에
목록을 둔다.

### 만료 select 의 선택지

계약은 `expiresInDays` 를 임의의 정수로 받는다 — 정해진 enum 이 아니다. 이 화면이 고르는
선택지는 `30`, `90`, `180`, `365`, 그리고 무기한이다. `90` 을 기본 선택으로 둔다. 이 숫자
넷은 서버 계약이 정한 게 아니라 이 콘솔의 선택이므로, 나중에 값을 조정해도 API 계약을 건드리는
일이 아니다.

`<select>` 는 `ProjectForm.tsx:61` 의 genre select 와 같은 모양 — `className="field-input"`,
`value`/`onChange` 로 문자열을 받는다. 무기한은 select 안에서 숫자와 나란히 놓여야 하므로
sentinel 문자열 `'never'` 를 쓰고, 제출 직전에 `expiryDraft === 'never' ? null : Number(expiryDraft)`
로 `expiresInDays` 를 만든다.

### 이름 길이는 클라이언트에서 자르지 않는다

`nickname`(`NICKNAME_MAX_LENGTH = 64`), `email`(`EMAIL_MAX_LENGTH = 320`) 은 서버 컬럼 폭이
문서화돼 있어(`authTypes.ts:79`, `:97`) `maxLength` 를 그 값으로 건다. `cli_token.name` 의
컬럼 폭은 ARTEL-780 설명에 나오지 않는다. 모르는 숫자를 만들어 `maxLength` 로 박느니, 빈
이름만 막는다 — `ProfilePanel` 이 빈 nickname 을 막는 것과 같은 자리, 같은 이유
(`AccountSettingsPage.tsx:107`).

### 목록은 행 목록이지 표가 아니다

`<table>` 은 이 코드베이스에 있지만(`UsageSection.tsx` 등) 전부 집계·성능 화면이다. "내가
가진 것 + 이름 + 시각들 + 폐기 버튼" 모양의 목록은 전부 `<ul>`/`<li>` 행이다 —
`GameInstancePanel.tsx` 의 `.instance-list`/`.instance-row`, `MembersSection.tsx` 의
`.member-list`, `.invitation-row`. CLI 토큰도 같은 모양(이름 + 시각 여러 개 + 폐기)이라 그
관행을 따른다. `GameInstancePanel` 이 가장 가까운 전례다 — 이름, 두 개의 시각(`lastConnectedAt`,
`createdAt`), 상태 뱃지, 폐기성 동작(`delete`)까지 구조가 거의 같다.

### 시각은 `formatDateTime` 을 쓴다

`formatters.ts` 의 `formatDate` 는 날짜만, `formatDateTime` 은 "값의 하루 안 순서가 중요할 때"
쓴다고 문서화돼 있다(`formatters.ts:26`). AC 원문이 "만든 시각", "마지막 쓴 시각" 이라고
쓴 것 — `SettingsSection` 의 "만들어진 날짜"(`formatDate`)와 다른 단어다 — 이 화면에서는
하루 안의 시점이 실제로 의미가 있다는 뜻으로 읽는다. CLI 토큰은 발급 직후 바로 쓰이는 일이
흔해서, 날짜만으로는 "오늘 발급해서 오늘 썼다"를 구분할 수 없다. `createdAt`, `lastUsedAt`,
`expiresAt` 모두 `formatDateTime` 으로 그린다.

`lastUsedAt`, `expiresAt` 은 `string | null` 이라 `formatDate`/`formatDateTime` 에 그대로
못 넣는다(둘 다 `string` 을 받는다). `null` 을 먼저 걸러 `t.account.cliTokens.neverUsed` /
`t.account.cliTokens.neverExpires` 로 바꾸고, 아닐 때만 `formatDateTime` 을 부른다 —
`GameInstancePanel.tsx:279` 가 `instance.lastConnectedAt.length === 0` 을 먼저 걸러 `neverConnected`
로 바꾸는 것과 같은 자리, 다른 sentinel(빈 문자열 대신 `null`)이다.

### 만료·폐기·live 를 가르는 표시

세 상태 모두 뱃지 색만으로 가르지 않는다 — `DESIGN.md` 의 "Always pair semantic colors with an
icon, shape, or text label" 을 그대로 따른다. 뱃지 글자 자체가 `Expired`/`Revoked` 를 말하므로
색이 지워져도 상태가 읽힌다.

- **live**: 뱃지 없음. 이름은 `--color-text-primary`. `Revoke` 버튼(`button--danger-quiet
  button--compact`, `GameInstanceRow` 의 delete 버튼과 같은 모양)이 있다.
- **expired** (`revokedAt === null && isCliTokenExpired(token)`): `badge--warning`
  (`App.css:596`, DESIGN.md 의 `status.warning` — "Amber for uncertainty and retries") 로
  `Expired`. 이름은 `.issue-row--resolved .issue-row-title`(`App.css:3306`)과 같은 자리 —
  "처리된 항목은 읽히되 아직 열린 것과 경쟁하지 않는다" — 을 본떠 `--color-text-secondary` 로
  낮춘다. `Revoke` 버튼은 그대로 둔다: 서버가 만료된 토큰을 목록에서 빼지 않으므로, 사용자가
  정리 삼아 명시적으로 폐기하는 경로를 막을 이유가 없다.
- **revoked** (`revokedAt !== null`, 만료 여부와 무관하게 우선): `App.css` 에
  `badge--critical` 을 새로 추가해(`badge--warning`/`badge--success` 와 같은 모양 —
  `border-color`/`color` 만 있는 outline, DESIGN.md 의 `status.critical` 토큰) `Revoked`.
  이름 색은 expired 와 같은 `--color-text-secondary`. 되돌릴 수 없는 동작이 이미 끝났으므로
  `Revoke` 버튼은 그리지 않는다.

두 상태가 겹칠 수 있다 — 만료된 뒤에 폐기됐거나, 폐기된 뒤에 만료 시각이 지날 수 있다.
`revokedAt` 이 있으면 무조건 revoked 로 그린다: 사용자가 실제로 누른 동작이라 서버 시계가 정한
만료보다 더 확정적인 사실이다.

새 CSS: `.cli-token-row--expired .cli-token-row-name`, `.cli-token-row--revoked
.cli-token-row-name` 에 `color: var(--color-text-secondary)`. `.cli-token-list` 를
`App.css` 의 기존 `.instance-list, .build-list, .scenario-list` 선택자 그룹에 더해 행 목록
기본 스타일(`display:flex; flex-direction:column` 등)을 그대로 물려받는다. `.cli-token-row` 는
`.instance-row` 와 같은 모양(세로 flex, `padding: var(--space-4) 0`, `+` 로 위 테두리)으로
새로 추가한다 — 폭 넷(이름, 만든 시각, 마지막 쓴 시각, 만료)과 뱃지·버튼이 같이 있어 필드
개수가 `.instance-row` 보다 하나 많다는 점만 다르다.

### 원문 reveal 은 색을 한 번만 쓴다

`DESIGN.md` 의 "Calm until critical — Keep default surfaces quiet. Reserve strong colors for
actions, warnings, and failures." 를 따라, "다시 볼 수 없다"는 경고 문장 하나에만 강한 색을
쓴다. 그 문장은 `EmailPanel` 의 `cannotInviteYet` 과 같은 자리 — `.inline-notice`
(`App.css:781`, `status.warning` 배경)를 그대로 재사용한다. 그 아래 원문 값 자체는 경고색을
한 번 더 두르지 않는다 — 이미 위 문장이 주의를 끌었고, 값 상자까지 amber 로 칠하면 같은
신호를 두 번 반복해 오히려 "항상 켜진 경고"처럼 읽힌다. 값은 새 클래스 `.cli-token-value`
(`display:flex; align-items:center; gap: var(--space-2); padding: var(--space-3); border:
1px solid var(--color-border-strong); border-radius: var(--radius-md); background:
var(--color-bg-raised);`)로 중립적인 상자에 `<code className="mono">{createdToken.token}</code>`
와 `CopyButton` 을 나란히 둔다.

### 복사 버튼은 기존 `CopyButton` 을 그대로 쓴다

`src/projects/CopyButton.tsx` 는 `projects` 아래 있지만 프로젝트에 매인 로직이 없다 —
`navigator.clipboard.writeText` 를 부르고, 성공하면 `onResult(copiedMessage)` 를, 실패하면
`onResult(t.projects.copy.blocked)` 를 부르는 것이 전부다(`CopyButton.tsx:32`). 보안 컨텍스트가
아니거나 권한이 거부되면 `writeText` 가 reject 되고, catch 블록이 그 실패를 잡아 안내 문장을
돌려준다 — 값은 여전히 화면에 평문으로 남아 있으니 손으로 선택해 복사할 수 있다. 실패해도
예외를 던지거나 화면을 깨뜨리지 않는다.

`t.projects.copy.blocked` 는 이름만 `projects` 아래 있을 뿐 "복사가 막혔다"는 범용 문장이라,
`account` 용으로 따로 만들지 않고 그대로 재사용한다 — 같은 클립보드 실패 처리 로직을 이 화면을
위해 한 벌 더 만들지 않기 위해서다. `onResult` 는 `CliTokenPanel` 의 `aria-live` 영역
(`announcement` state)으로 연결한다. `copiedMessage` 는 `t.account.cliTokens.copiedAnnouncement`.

### 폐기 확인은 `ConfirmActionDialog` 를 그대로 쓴다

`DeleteProjectDialog`, `DeleteGameInstanceDialog`, `MembersSection` 의 멤버 내보내기 셋이 이미
`design-system/primitives/ConfirmActionDialog.tsx` 위에 서 있다. `RevokeCliTokenDialog.tsx`
를 그 넷째로 추가한다 — `DeleteGameInstanceDialog.tsx` 와 거의 같은 모양:

```tsx
<ConfirmActionDialog
  body={<><strong>{tokenName}</strong>{copy.revokeConfirmSuffix}</>}
  cancelLabel={t.account.shared?.cancel ?? ...}
  confirmLabel={copy.revoke}
  onClose={onClose}
  onConfirm={async () => { await deleteCliToken(tokenId); onRevoked() }}
  pendingLabel={copy.revoking}
  title={copy.revokeTitle}
  toFailureMessage={() => copy.revokeFailed}
/>
```

`account` 네임스페이스에는 `projects.shared` 같은 공유 문구 묶음이 없으므로, `취소`는
`t.account.cliTokens.cancel` 로 이 그룹 안에 둔다 — 이 화면이 유일한 소비자라 공유 묶음을
새로 만들 이유가 없다. `toFailureMessage` 는 상태 코드로 가를 이유가 없어(계약에 문서화된
오류 코드가 없다) 항상 같은 문장을 돌려준다 — `endSession`, `updateMyProfile` 이 상태를
가르지 않는 것과 같은 판단이다. 취소가 먼저, 위험한 버튼이 나중에 오는 배치와
`finally` 를 쓰지 않는 규칙은 `ConfirmActionDialog` 가 이미 지킨다.

### 생성은 응답을 그대로 앞에 꽂고, 폐기는 다시 읽는다

`DELETE` 는 204 라 몸이 없다 — 서버가 실제로 찍은 `revokedAt` 시각을 이 응답에서 알 수 없다.
`MembersSection.tsx:312` 의 `onRevoked={onChanged}` 가 정확히 같은 상황(초대 취소, 204, 몸
없음)에서 `refresh()` 로 다시 읽는 것과 같은 길을 따른다 — 폐기 뒤에는 `useCliTokens` 의
`refresh()` 를 불러 서버가 가진 진짜 `revokedAt` 을 받아온다.

`POST` 는 다르다. 응답 몸에 `id`, `name`, `createdAt`, `expiresAt` 이 전부 있고, 방금 만든
토큰은 `lastUsedAt` 이 `null`(아직 한 번도 안 쓰였다), `revokedAt` 이 `null`(막 만들었다)임을
서버에 다시 묻지 않아도 안다. `DocumentPanel` 이 업로드 응답으로 `applyNewDocument` 를 불러
목록 맨 앞에 끼워 넣는 것과 같은 자리 — 재조회 없이 응답 자체로 새 행을 만들어 목록 앞에
꽂는다.

### 빈 목록도 이 화면이 무엇을 하는 자리인지 말한다

발급 폼은 항상 떠 있어 그 자체로 "여기서 만든다"를 말하지만, AC 는 목록이 비었을 때를 따로
못박는다. `GameInstancePanel` 의 `panel-empty-block`(`App.css:1055`, 문구 + 버튼)과 같은
자리에, 목록 대신 `t.account.cliTokens.empty` 한 줄을 그린다 — "아직 만든 CLI 토큰이 없다.
위 양식으로 `artel-cli` 인증에 쓸 토큰을 만든다"는 내용.

## Approach (Checklist)

- [ ] **Step 0: Recon** — `authApi.ts`(`apiFetch`, 401 재시도), `authTypes.ts`(형 변환·검증
      관행), `memberTypes.ts:96`(`isInvitationExpired`), `ConfirmActionDialog.tsx`,
      `DeleteGameInstanceDialog.tsx`, `GameInstancePanel.tsx`, `CopyButton.tsx`,
      `useMembers.ts`(`read`/`reload`/`refresh` 세 단계), `AccountSettingsPage.tsx`,
      `App.css` 의 `.badge*`, `.instance-*`, `.issue-row--resolved`, `.inline-notice`,
      `.panel--danger`, `DESIGN.md` 의 색 토큰과 "Calm until critical" 원칙

- [ ] **Step 1: 타입** — `src/auth/cliTokenTypes.ts`
  - `type CliToken = { id: string; name: string; createdAt: string; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null }`
  - `type CliTokenCreated = { id: string; name: string; token: string; createdAt: string; expiresAt: string | null }`
  - `type CliTokenExpiryDraft = '30' | '90' | '180' | '365' | 'never'`, `CLI_TOKEN_EXPIRY_OPTIONS: CliTokenExpiryDraft[]`, `DEFAULT_CLI_TOKEN_EXPIRY: CliTokenExpiryDraft = '90'`
  - `toExpiresInDays(draft: CliTokenExpiryDraft): number | null`
  - `isCliTokenExpired(token: CliToken, now: number = Date.now()): boolean` — `expiresAt === null` 이면 `false`, 아니면 `isInvitationExpired` 와 같은 모양으로 `Date.parse` 뒤 `<= now`
  - `isCliTokenRevoked(token: CliToken): boolean` — `token.revokedAt !== null`

- [ ] **Step 2: API** — `src/auth/cliTokenApi.ts`
  - `parseCliToken(data: unknown): CliToken | null` — `id`, `name`, `createdAt` 은 비어 있지
    않은 문자열이어야 하고 아니면 `null`(줄을 버린다). `lastUsedAt`/`expiresAt`/`revokedAt` 은
    문자열이면 그대로, 아니면 `null` 로 내린다
  - `parseCliTokenCreated(data: unknown): CliTokenCreated` — `token` 이 비어 있지 않은
    문자열이 아니면 던진다(`createSdkLoginCode` 가 발급한 code 를 검증하는 것과 같은 엄격도 —
    이 응답에서 원문이 잘못되면 화면이 대신 채울 안전한 기본값이 없다). 나머지 필드는
    `CliToken` 과 같은 규칙
  - `listCliTokens(signal?): Promise<CliToken[]>` — `GET /api/auth/cli-tokens`, 배열이
    아니면 빈 배열, 각 원소를 `parseCliToken` 뒤 `null` 을 걸러낸다
  - `createCliToken(name: string, expiresInDays: number | null): Promise<CliTokenCreated>` —
    `POST /api/auth/cli-tokens`, `!response.ok` 면 던진다
  - `deleteCliToken(id: string): Promise<void>` — `DELETE /api/auth/cli-tokens/{id}`,
    `!response.ok` 면 던진다(204 라 `readJson` 을 부르지 않는다 — `revokeInvitation` 과 같다)

- [ ] **Step 3: hook** — `src/auth/useCliTokens.ts`
  - `useMembers.ts` 와 같은 세 단계: mount 시 `read()`, `reload()`(목록을 `loading` 으로
    되돌리고 다시 읽는다 — 이 화면에서는 안 쓰지만 읽기 실패 뒤 재시도 버튼에 필요하다),
    `refresh()`(목록만 조용히 다시 맞춘다, 실패해도 기존 목록을 그대로 둔다)
  - `applyCreated(created: CliTokenCreated)` — 응답을 `CliToken` 모양으로 바꿔
    (`lastUsedAt: null, revokedAt: null`) 목록 맨 앞에 꽂는다

- [ ] **Step 4: 폐기 dialog** — `src/auth/RevokeCliTokenDialog.tsx`(`ConfirmActionDialog` 위)

- [ ] **Step 5: panel** — `src/auth/CliTokenPanel.tsx`
  - 발급 폼(이름 입력 + 만료 select + 제출), 원문 reveal 블록(있을 때만, `.inline-notice` +
    `.cli-token-value` + `CopyButton` + 닫기 버튼), 목록(`CliTokenRow` 서브컴포넌트,
    live/expired/revoked 세 갈래), 빈 상태, 로딩 skeleton(`MembersSection` 의
    `member-row--skeleton` 과 같은 자리), 읽기 실패 + 재시도(`panel-message` + `reload`),
    `aria-live` region 하나

- [ ] **Step 6: 붙이기** — `AccountSettingsPage.tsx` 의 `section-columns` 안, `EmailPanel`
      다음에 `<CliTokenPanel />` 을 셋째로 놓는다

- [ ] **Step 7: 스타일** — `App.css` 에 `.cli-token-list`(기존 `.instance-list,
      .build-list, .scenario-list` 그룹에 합류), `.cli-token-row`, `.cli-token-row-name`,
      `.cli-token-row--expired`, `.cli-token-row--revoked`, `.cli-token-row-meta`,
      `.cli-token-value`, `.badge--critical` 을 더한다. 전부 `tokens.css` 의 기존 색
      변수만 쓴다 — 새 색상 값을 만들지 않는다

- [ ] **Step 8: 문구** — `src/i18n/messages/account.ts` 의 `accountEn`/`accountKo` 에
      `cliTokens` 그룹을 더한다: `title`, `intro`(패널 상단 짧은 설명), `nameLabel`,
      `nameRequired`, `expiryLabel`, `expiryOption30/90/180/365`, `expiryNever`, `create`,
      `creating`, `createFailed`, `createdAnnouncement(name)`, `revealWarning`, `copy`,
      `copiedAnnouncement`, `dismissReveal`, `loadingLabel`, `loadFailed`, `empty`,
      `createdLabel`, `lastUsedLabel`, `neverUsed`, `expiresLabel`, `neverExpires`,
      `expiredBadge`, `revokedBadge`, `revoke`, `revoking`, `revokeTitle`,
      `revokeConfirmSuffix`, `revokeFailed`, `revokedAnnouncement(name)`, `cancel`

- [ ] **Step 9: Tests** — `src/auth/cliTokenApi.test.ts`(`authApi.test.ts` 옆, 같은
      `withMockedFetch` 모양을 그대로 복제)
  - `parseCliToken` 이 `id`/`name`/`createdAt` 없는 원소를 버린다
  - `parseCliToken` 이 `lastUsedAt`/`expiresAt`/`revokedAt` 이 없거나 `null` 이면 `null` 로
    내린다
  - `parseCliTokenCreated` 가 `token` 이 없거나 빈 문자열이면 던진다
  - `createCliToken` 이 `expiresInDays: null` 과 정수 값 둘 다 요청 몸에 그대로 싣는다
  - `deleteCliToken` 이 204 응답에서 몸을 읽으려 하지 않는다(빈 본문을 줘도 던지지 않는다)
  - `isCliTokenExpired` 가 `expiresAt === null` 이면 항상 `false`, 경계 시각에서 `<=` 로
    만료로 본다(`isInvitationExpired` 와 같은 경계)
  - hook(`useCliTokens.ts`) 은 별도 테스트를 두지 않는다 — `useMembers.ts` 도 없다. `npm run
    test` 는 `src/**/*.test.ts` 만 돌고, 실제로 틀릴 수 있는 로직은 파서와 만료 판정뿐이다

## Validation

- **Commands to run:** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- **Expected output:** 넷 다 통과, 새 `cliTokenApi.test.ts` 가 파서·만료 판정·요청 모양을
  덮는다
- 로컬 스택으로 발급 → 원문 복사 확인 → 새로고침(원문 사라짐 확인) → 다른 경로 갔다가
  `/account` 로 복귀(원문 사라짐 재확인) → 폐기 확인 dialog → 목록에서 Revoked 뱃지 확인 →
  만료 옵션으로 만든 토큰이 시간 경과 후 Expired 로 보이는지는 만료를 짧게 잡을 수 없는 계약
  (분/시간 단위가 아니라 일 단위)이라 스크린샷으로 확인하기 어렵다 — `isCliTokenExpired` 단위
  테스트로 그 경계만 보장한다

## Risks & Rollback

- **Risks:**
  - ARTEL-780 이 먼저 merge 되지 않으면 이 화면은 목록·발급 전부 실패로 뜬다. `reload` 재시도
    버튼이 있어 화면이 깨지지는 않지만, merge 순서로 막는 게 우선이다
  - `badge--critical` 을 새로 추가하는 것은 이 작업이 처음 여는 규칙이라, 나중에 다른 화면이
    "폐기됨/닫힘" 류 상태를 그릴 때 이 클래스를 다시 쓸지 또 만들지 결정이 필요해진다.
    `badge--success`/`badge--warning` 과 같은 얕은 규칙(outline, 텍스트 라벨 필수)만 지키면
    재사용에 문제가 없다
  - `parseCliTokenCreated` 가 `token` 없는 응답에 던지므로, 서버가 201 인데 `token` 필드를
    빠뜨리면 발급이 성공했는데 화면은 실패로 보인다. 계약이 명시한 형태라 서버 쪽 회귀로
    본다
- **Rollback steps:** `CliTokenPanel` 을 `AccountSettingsPage.tsx` 에서 빼면 화면에서
  사라진다. `cliTokenApi.ts`/`cliTokenTypes.ts`/`useCliTokens.ts` 는 남지만 아무도 부르지
  않는다. `git revert` 로 되돌려도 안전하다 — 다른 화면이 이 파일들을 아직 쓰지 않는다

## Open Questions

- `cli_token.name` 컬럼의 최대 길이가 ARTEL-780 설명에 없다. 서버가 정하면 `maxLength` 를
  그 값으로 걸 수 있지만, 지금은 빈 이름만 막고 길이는 서버 400 에 맡긴다
- 발급 폼의 만료 선택지(30/90/180/365일 + 무기한)는 이 콘솔의 선택이라 product 쪽 확인이
  필요하면 이 자리에서 조정한다
