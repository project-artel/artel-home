# 2026-10-15 — QA 실행 폼에 agent 구조 고급 설정 추가와 마지막 모델·구조 선택 브라우저 저장

- Date: 2026-10-15
- GitHub Issue: None
- Jira: ARTEL-1091
- Status: Implemented (2026-10-16 에 develop 의 ARTEL-1084 새 실행 화면 위로 rebase)

## Goal

QA 실행 화면의 "실행 설정" 패널(`src/qa/launch/LaunchPanel.tsx`, ARTEL-1084)에서 agent 의
구조(agent-server 의 `QaArchSpec`)를 고를 수 있게 하고, run 을 시작한 구조를 이 브라우저에 남겨
다음에 화면을 열 때 그 값으로 시작한다.

모델 저장은 하지 않는다. ARTEL-1084 가 테스트 런 · 게임 · 모델 · reasoning 의 마지막 조합을 서버의
실행 기록에서 읽어 첫 선택으로 쓰므로, 브라우저에 따로 남길 것은 그 기록에 없는 agent 구조뿐이다.

서버 쪽은 이미 되어 있다. orchestration 서버의 `CreateQaRunRequest.arch` 는 JSON 을 열어 보지 않고
agent-server 로 넘기고, agent-server 의 `OpenQaSessionRequest.arch` 가 `QaArchSpec` 으로 검증한 뒤
`run_config.agent_arch` 에 label 을 적는다. 이 변경은 artel-home 한 곳이다.

## Non-goals

- reasoning 선택 저장
- orchestration 서버와 agent-server 변경, arch 스키마를 내려받는 API
- `base_tool_calls` 같은 숫자 상한 knob 과 compaction 세부 knob. 구조 비교에 쓰이는 축만 보여 준다.

## Context / Constraints

- knob 의 스키마는 `artel-agent-server/app/agents/qa/arch.py` 가 정한다. 콘솔은 오늘 있는 축을 폼으로
  보여 주고, 서버 기본값은 **보내지 않는 것**으로 표현한다. 기본값 숫자나 문자열을 콘솔에 복사하면
  agent-server 가 기본값을 바꿀 때 콘솔 쪽 복사본이 틀린 값이 된다.
- knob 을 하나라도 바꾸면 label 이 필요하다. `/api/qa-stats` 가 `agent_arch` 로 run 을 묶기 때문에,
  knob 을 바꾸고 label 을 기본값으로 두면 그 run 이 기본 구조의 통계에 섞인다(`arch.py` 의 v4 설명).
  artel-cli 의 `qa matrix --arch` 도 같은 이유로 label 을 요구한다.
- `vision=on` 과 `on_demand` 가 아닌 `screen_capture` 는 이미지를 읽는 모델에서만 된다. agent-server 가
  422 로 거절하므로 폼에서 먼저 막는다(`QaModel.multimodal`).
- localStorage 는 `src/contentMap/carryOverChoice.ts` 와 같은 방식으로 쓴다. try/catch 로 감싸고,
  읽기나 쓰기가 막혀 있으면 오늘과 같은 동작으로 돌아간다.
- 디자인은 `.agents/docs/DESIGN.md`. 기존 `qa-model-config` 상자 안의 모양을 따른다.

## Approach (Checklist)

- [x] **Step 0: Recon** — `QaTryPanel.tsx`, `qaApi.ts`(`createQaRun`), `qaTypes.ts`, `i18n/messages/qa.ts`,
  `App.css` 의 `.qa-model-config` 블록 두 곳(3060, 4135), orchestration `QaDtos.kt`, agent `arch.py`.
- [x] **Step 1: `src/qa/qaArch.ts`** — 폼이 아는 축과 요청 body.
  - `QaArchRequest`: wire 이름 그대로의 선택 필드. `label: string`, `phase_cycle`, `skills`, `macros`,
    `screen_capture`, `vision`, `pulse_relevance`, `report_step_view`, `fold_stale_scenes`,
    `fold_stale_knowledge`, `fold_stale_skills`, `fold_stale_macro_results`, `fold_threshold_chars`,
    `compaction`.
  - `QaArchSelection`: 사용자가 폼에서 고른 값. 각 knob 은 `undefined`(서버 기본값) 이거나 값.
    `label` 은 문자열.
  - `QA_ARCH_AXES`: 축 목록. `{ key, kind: 'choice', values }` 또는 `{ kind: 'toggle' }`,
    `{ kind: 'number' }`. `needsVision: true` 인 값은 이미지를 읽지 않는 모델에서 고를 수 없다
    (`vision=on`, `screen_capture=every_call|by_role`).
  - `changedKnobCount(selection)`, `toArchRequest(selection)`: 바꾼 knob 이 없으면 `null`, 있으면
    `{ label, ...바꾼 knob }`. label 이 비어 있으면 `qa_arch_label_missing` 을 던지는 대신 호출자가
    먼저 `archLabelMissing(selection)` 으로 확인한다.
  - `suggestArchLabel(selection)`: `phase_cycle=off skills=on_demand` 꼴, 50자에서 자른다. label 입력
    칸의 placeholder 로만 쓰고, 값으로 넣지 않는다 — 보내는 label 은 사용자가 적은 것이다.
  - `withoutVisionKnobs(selection)`: 모델이 이미지를 읽지 않을 때 `needsVision` 값을 `undefined` 로.
- [x] **Step 1b: `src/qa/qaStartChoices.ts`** — 마지막 구조 저장.
  - `artel.qa.lastArch` 에 `QaArchSelection` JSON. `readLastArch(storage?)`, `storeLastArch(selection,
    storage?)`. 읽을 때는 `QA_ARCH_AXES` 로 걸러서 모르는 키와 값은 버린다. 저장은 run 시작이 성공한
    뒤 한 번.
- [x] **Step 1c: `src/qa/qaApi.ts`** — `qaRunRequestBody(...)` 를 순수 함수로 빼고 `createQaRun` 이
  마지막 인자 `arch: QaArchRequest | null = null` 을 받는다. `null` 이면 body 에 `arch` 키가 없다.
- [x] **Step 1d: i18n** — `qa.panel.advanced.*` 에 en/ko. 축 이름은 wire 이름을 그대로 `code` 로 보여 주고,
  한 줄 설명을 붙인다. 값 이름도 wire 값 그대로.
- [x] **Step 1e: CSS** — `App.css` 의 `.qa-model-config` 블록 옆에 `.qa-advanced`(`details`),
  `.qa-advanced-grid`, `.qa-advanced-field`, `.qa-advanced-label` 추가.
- [x] **Step 1f: `src/qa/launch/ArchSettings.tsx`** — `<details className="qa-advanced">` 컴포넌트.
  - `summary` 에 "고급 설정" 과 바꾼 knob 수.
  - 축마다 `select`(첫 option 은 서버 기본값), `number` 는 `input type=number`(빈 값 = 기본값).
  - 바꾼 knob 이 1개 이상이면 label 입력과 되돌리기 버튼이 나타난다.
  - `readsImages=false` 면 vision 이 필요한 option 을 `disabled` 로 하고 안내를 보여 준다.
- [x] **Step 1g: `LaunchPanel.tsx`, `QaLaunch.tsx`** — `QaLaunch` 가 `useState(() => readLastArch())` 로
  구조를 들고 `LaunchPanel` 에 `arch`, `onArchChange` 로 넘긴다. `LaunchPanel` 은 모델이 이미지를
  읽지 않으면 `withoutVisionKnobs` 로 걷어 낸 `effectiveArch` 를 쓰고, label 이 비어 있으면 점검 목록에
  `bad` 항목을 넣어 실행 버튼을 막는다. `createQaRun(..., force, toArchRequest(effectiveArch))`, 성공하면
  `storeLastArch`.
- [x] **Step 2: Tests** — `qaArch.test.ts`(요청 body, label 요구, vision 정리, label 제안 길이),
  `qaStartChoices.test.ts`(가짜 storage 로 구조 저장·복원, 깨진 JSON, throw 하는 storage),
  `qaApi.test.ts` 에 `qaRunRequestBody` 두 건.
- [x] **Step 3: Rollout** — 플래그 없음. 되돌리면 폼이 `arch` 를 보내지 않는 오늘 상태.

## Validation

- **Commands to run:**
  ```bash
  export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"; unset -f node npm npx 2>/dev/null
  npm test
  npm run typecheck
  npx eslint src/qa src/i18n/messages/qa.ts
  ```
- **Expected output:** 테스트 전부 통과, 타입 오류 0, lint 오류 0.
- **Manual (2026-10-16, rebase 뒤 새 화면에서 실행):** 떠 있는 orchestration(8090)을 proxy 하는 Vite 를
  따로 띄우고 Playwright 로 여섯 장을 찍었다(`.plan/assets/qa-agent-arch-advanced-settings/`).
  `POST /api/qa-runs` 는 가로채 body 만 기록하고 가짜 201 로 답했다 — 다른 세션의 게임 인스턴스를
  점유하지 않기 위해서다. 기록된 body 의 `arch` 는
  `{"label":"home-phase-off-skills","phase_cycle":"off","skills":"on_demand","fold_threshold_chars":56000}`
  이었고, label 이 비었을 때 실행 버튼의 `aria-disabled` 가 `true`, 적은 뒤 `false` 였다. 화면을 다시
  열면 같은 구조로 열렸다.
  `qa_try.run_config.agent_arch` 에 label 이 적히는 것은 실제 run 으로 확인하지 않았다. 서버 쪽은
  artel-cli 의 `--arch` 가 같은 필드로 이미 쓰고 있는 경로다.

## Risks & Rollback

- **Risks:** agent-server 가 축을 더하거나 값을 바꾸면 콘솔의 `QA_ARCH_AXES` 가 뒤처진다. 없는 값은
  보내지 않으므로 run 이 깨지지는 않고, 새 축을 폼에서 못 고를 뿐이다. 반대로 agent-server 가 축을
  없애면 그 knob 을 보낸 run 이 422 로 실패한다 — 그때 `QA_ARCH_AXES` 에서 지운다.
- **Rollback steps:** PR revert. localStorage 의 두 키는 남아도 읽는 코드가 없어 무해하다.

## Open Questions

- 없음. reasoning 저장은 요청에 없어 범위 밖으로 둔다.
