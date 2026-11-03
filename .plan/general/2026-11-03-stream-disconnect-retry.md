# 2026-11-03 — 스트리밍 연결 끊김 안내와 재연결 버튼 추가

- Date: 2026-11-03
- GitHub Issue: None (Jira: ARTEL-1336, story ARTEL-1334)
- Status: Implemented; draft PR pending

## Goal

`SDK_UPDATE_REQUIRED`가 도착하면 연결 끊김 안내와 `재연결 시도` 버튼을 표시한다. 버튼을 누르면 기존 retry로 새 viewer 연결을 만든다.

## Non-goals

서버 transport 불일치 안내, 권한 오류, 자동 재연결 정책, SDK 및 배포 변경.

## Context / Constraints

이전 서버는 응답 시간 초과에도 `SDK_UPDATE_REQUIRED`를 보낸다. code만으로 SDK 버전을 단정할 수 없다. 마지막 frame과 끊긴 시각은 기존 hook에서 유지한다.

## Approach (Checklist)
- [x] **Step 0: Recon** — JPEG viewer, 오류 안내, retry hook 확인.
- [x] **Step 1: Implementation** — 오류 notice에 retryLabel을 포함하고 SDK 오류에는 warning banner와 연결 끊김 안내를 표시한다. 서버 transport 오류는 버튼 없이 유지한다.
- [x] **Step 2: Tests** — 실제 컴포넌트 렌더링과 retry 연결 동작, stale frame 안내를 검증하고 typecheck/build 실행.
- [x] **Step 3: Rollout / Rollback** — 서버 ARTEL-1335와 독립 적용 가능. draft PR 생성; 배포하지 않는다.

## Validation
- **Commands to run:** `npm test`, `npm run typecheck`, `npm run build`; 브라우저에서 오류 상태와 재연결 버튼 확인.
- **Expected output:** SDK 업데이트 문구 없이 연결 끊김과 재연결 버튼 표시. 클릭 시 새 socket으로 정상 frame 수신 가능.

## Risks & Rollback
- **Risks:** 실제 구 SDK도 같은 안내를 받으므로 재시도가 실패할 수 있다. 자동 재시도는 추가하지 않는다.
- **Rollback steps:** 이 변경 commit을 revert한다.

## Open Questions
- 없음.

## 검증 결과

- 전체 frontend 테스트 1,604개 통과, build 통과, 변경 파일 lint 통과.
- 전체 lint는 기존 파일 5개 오류로 실패. 이번 변경 파일에는 오류 없음.
- Chromium에서 1280/360 px × light/dark × frame 유무 8개 조합 통과. 키보드 재연결로 socket 2개째에서 live 복구, overflow 없음.
- UI 검증은 mock socket fixture이며 실제 SDK/server 통합 검증은 아님. 스크린샷은 .plan/assets/2026-11-03-stream-disconnect-retry/.
- FAST/MEDIUM/HEAVY plan review와 pair-review VERDICT: PASS.
