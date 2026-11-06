# 2026-08-27 — [Home] 지식 항목에 묶인 씬·화면을 보인다

- Date: 2026-08-27
- Jira: ARTEL-593 (epic ARTEL-582; blocked by ARTEL-591, ARTEL-605)
- Branch: `feat/home-지식-항목에-묶인-씬-화면을-보인다-ARTEL-593`
- Base: `origin/develop`
- Status: Implemented, typecheck·test green, PR not opened

## Goal

지식창고 화면에서 지식 항목이 어느 씬·화면에 묶여 있는지 보이게 한다. 앵커가 없는 항목은 "게임 전체에서
성립한다"고 분명히 말한다. 목록을 씬 하나로 좁힐 수 있게 한다.

## Non-goals

- 화면에서 앵커를 편집하지 않는다.
- 캔버스(SVG) 그리기 자체는 손대지 않는다.
- 다른 저장소는 손대지 않는다.

## Context / Constraints

QA 에이전트가 지식창고에 만들던 화면 지도는 orchestration server 의 `content_map` 으로 옮겼다.
지식창고에 남는 것 중 한 화면에서만 성립하는 사실은 이제 **앵커**(씬 이름 + 선택적 화면 id)를 단다.
앵커가 **없는** 항목은 게임 어디서나 참인 사실이며 이쪽이 보통이다.

백엔드(ARTEL-605)는 아직 머지되지 않았다. 노드마다 `anchors` 가 붙되 항상 존재하고 없으면 빈 배열이다.

```json
"anchors": [{ "sceneName": "BattleScene", "screenId": "4242" }]
```

- `sceneName` — 문자열, 앵커에 항상 있다.
- `screenId` — 문자열 또는 `null`. 숫자가 아니다. `null` 이 정상이고 흔하다.

제약:

- `parseKnowledgeNode` 의 방어적 파싱 규칙을 따른다. `id` 가 없을 때만 노드를 버리고 나머지는 얇은 데이터로
  받아들인다. `anchors` 키가 아예 없는 응답(오늘의 서버)은 모든 노드가 빈 배열인 응답과 똑같이 동작해야 한다.
- 형식이 깨진 앵커(`sceneName` 없음)는 그 앵커만 버리고 노드는 살린다.
- `DESIGN.md`: 색만으로 앵커 있음/없음을 가르지 않는다. 라벨과 모양을 짝짓는다. box shadow 없다.
- 캔버스는 pointer-only 이고 `aria-hidden` 이다. 접근성은 인스펙터가 진다.

## Approach (Checklist)

- [x] **Step 0: Recon** — `knowledgeApi.ts`, `knowledgeTypes.ts`, `KnowledgeInspector.tsx`,
      `i18n/messages/knowledge.ts`, `App.css` 의 `kg-*` 블록, `IssuesSection.tsx` 의 필터 관용구.
- [x] **Step 1: 계약** — `knowledgeTypes.ts` 에 `KnowledgeAnchor` 를 두고 `KnowledgeNode.anchors` 를 얹는다.
      `knowledgeApi.ts` 에 `parseKnowledgeAnchor` 를 더한다. 같은 (씬, 화면) 앵커가 두 번 오면 하나로 접는다 —
      edge 중복 접기와 같은 이유로, 두 번 그리면 서버가 말하지 않은 두 개의 사실을 만든다.
- [x] **Step 2: 인스펙터** — 고른 항목의 앵커를 `kg-detail-fields` 한 행으로 보인다. 앵커가 없으면
      "게임 전체에서 성립합니다" 문장을 쓴다. 빈칸도 "없음"도 아니다. 채워진 마름모(묶임)와 빈 마름모(전체)로
      모양을 짝짓는다.
- [x] **Step 3: 필터** — 목록 위에 씬 `<select>`. `IssuesSection.tsx` 의 `label > span + select` 관용구를 쓴다.
      순수 함수(`knowledgeAnchors.ts`)가 씬 목록과 술어를 낸다. 앵커가 하나도 없으면 필터를 아예 그리지 않는다 —
      오늘의 서버에서 쓸모없는 컨트롤이 늘지 않게.
- [x] **Step 4: Tests** — `knowledgeApi.test.ts` 에 앵커 파싱 케이스, `knowledgeAnchors.test.ts` 에 필터 케이스.
- [ ] **Step 5: Rollout / Rollback** — 서버가 `anchors` 를 보내기 전에는 모든 항목이 "게임 전체"로 읽히고
      필터는 나타나지 않는다. 되돌리려면 이 commit 을 revert 한다.

## Validation

- **Commands run:** `npm run typecheck`, `npm test`, `npx eslint src/knowledge src/i18n/messages/knowledge.ts`
- **Result:** typecheck exit 0. 144 tests pass, 0 fail — 새 `knowledgeAnchors.test.ts` 7건과
  `knowledgeApi.test.ts` 의 앵커 8건 포함. 변경한 파일에 lint 경고 없음.
- **Screens:** headless Chrome 으로 상태별 스크린샷을 찍어 `.plan/assets/2026-08-27-show-knowledge-scene-anchors/`
  에 두었다. 앵커 하나·여럿(씬만 있는 것 포함)·게임 전체(light·dark)·씬 필터·게임 전체 필터.
  **실서버가 아니라 fixture 노드에 인스펙터를 물려 찍은 것이다.** 컴포넌트가 그린다는 증거이지
  ARTEL-605 의 응답이 이 모양이라는 증거가 아니다.
- **스크린샷이 잡은 실제 결함:** 씬만 있는 앵커에서 "화면은 아직 기록되지 않았습니다" 가 줄바꿈되며
  마름모 아래로 떨어져, 어느 씬 이야기인지 읽히지 않았다. 씬과 화면을 한 덩이로 묶어 고쳤다.
- **Not run:** 실서버 연동 확인. 서버가 아직 `anchors` 를 싣지 않는다.

## Risks & Rollback

- **Risks:**
  - ARTEL-605 가 다른 모양으로 착지하면(예: `screenId` 를 숫자로, 또는 `anchors` 대신 다른 이름) 앵커가
    안 읽힌다. 그때 화면은 전부 "게임 전체"로 읽히고 이는 틀린 말이다 — 실패로 보이지 않는다는 점이 위험이다.
    완화: `screenId` 는 숫자로 와도 문자열로 받아 준다. 필드 이름이 바뀌면 파서 한 줄만 고치면 된다.
  - 앵커가 많은 항목은 인스펙터 행이 길어진다. 목록으로 쌓아 세로로만 자란다.
- **Rollback steps:** `git revert`.

## Open Questions

- 목록 행마다 앵커를 표시할지. 지금은 안 한다 — 태그·출처·id 로 이미 붐빈다. 필터가 그 역할을 한다.
