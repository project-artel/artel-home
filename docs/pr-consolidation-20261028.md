# home PR 6개 통합

작성일: 2026-10-28 (Asia/Seoul)

`dev-yunseong`의 열린 home PR 6개를 `codex/pr-bundle-20261028`에 통합했다. base는 `develop`의 `c124166412d5f2dbed20dba84769d9d7721cc3e3`다. 원본 head를 merge해 commit과 작성자 이력을 보존했으며 원본 branch와 실행 중인 로컬 stack은 변경하지 않았다. 이 문서는 develop merge나 배포 완료를 뜻하지 않는다.

## 원본 PR과 포함 범위

| 원본 PR | 고정한 head | 포함한 변경 |
| --- | --- | --- |
| [#224](https://github.com/project-artel/artel-home/pull/224) | `07ec646a66a92d3a202423c3ad8943ef7c1a00b1` | TC 시연, 입력 제어권, 전후 장면 저장, 검증 절차 추출·승인 |
| [#227](https://github.com/project-artel/artel-home/pull/227) | `6305a479a821fe0c3445990a98c537ddc8b68f23` | QA 실행 버전의 TC 확인·추가와 고급 설정 통합 |
| [#228](https://github.com/project-artel/artel-home/pull/228) | `f1825ba0004c8e185b4ec82bb878334ed540f0d3` | 영상·TC 평가·신뢰도·질문, JPEG_WS 중계 화면, TC 판정 표시와 TC 구간 상대 재생 진행도 |
| [#229](https://github.com/project-artel/artel-home/pull/229) | `75c09e406205b1a4b44dddc30aee27d65e0d190a` | QA 화면의 Cheat 표시 제거 |
| [#230](https://github.com/project-artel/artel-home/pull/230) | `d3b19d9fe834b0eefc4a1c6669b60021a40fae3e` | 최근 로그 50개 밖의 TC 판정도 재진입 시 복원 |
| [#231](https://github.com/project-artel/artel-home/pull/231) | `b9cbdbfbc78011233c6dff5df2d90cd4dc0c8a2f` | TC 참조의 상세 hover 표시 |

위 6개 head가 모두 통합 HEAD의 ancestor인지 확인했다. 원본 body의 Jira·검증·화면 링크는 각 PR에서 확인할 수 있다. 통합 PR이 원본을 대체해도 원본 branch나 증거 파일은 삭제하지 않는다.

## 충돌 해결과 동작 보존

- `useGameStream.ts`: #224는 이전 WebRTC `MediaStream`을 시연 화면에서 사용했고 #228은 JPEG_WS canvas callback으로 바뀌었다. JPEG_WS를 유지하면서 시연의 `stopOnDisconnect` 정책을 세 번째 인자로 보존했다. 시연 viewport는 같은 연결의 canvas frame을 표시하고 그 canvas를 PNG 근거로 저장한다. 입력 좌표 변환, 입력 전후 장면 저장, 정지·중단 시 제어권 해제는 유지한다. 별도 viewer나 미디어 연결을 추가하지 않는다.
- `QaRunPage.tsx`: #230의 전체 판정 snapshot을 #228의 `case_outcome` parser와 연결했다. `caseVerdicts`와 `caseReports` 모두 `session.verdictLogs`를 읽어 최근 로그 창 밖의 판정을 보존한다. 참고 step을 완료로 만들지 않으며 신규 TC STATUS와 이전 step·CASE_VERDICT를 구분하는 표시를 유지한다.
- #227이 변경 수 배지를 상위 `LaunchPanel`로 옮긴 것에 맞춰 기존 SSR 검증도 그 위치에서 수행하도록 조정했다. 엔진·knob별 변경 수 규칙은 바꾸지 않았다.
- #229의 Cheat 표시 제거, #231의 hover, #228의 TC 구간 상대 진행도와 시도 전환 초기화를 함께 보존했다. 영상·TC 선택 UI를 이전 구현으로 덮어쓰지 않았다.

## 기존 기반과 서버 계약

원본 #228 head에는 다른 작성자의 [#222](https://github.com/project-artel/artel-home/pull/222), [#223](https://github.com/project-artel/artel-home/pull/223), [#225](https://github.com/project-artel/artel-home/pull/225)가 이미 포함돼 있다. 판정 근거·추가 검토·QA 종료 알림 화면에 필요한 기존 기반으로 통합 ancestry에 남겼다. 이 세 PR은 통합 종료 대상이 아니다.

시연 관련 원본 PR은 이력으로만 남으며 기능·데이터는 제거한다. 판정 snapshot은 orchestration [#382](https://github.com/project-artel/artel-orchestration-server/pull/382)의 `/verdicts` API를 사용한다. 영상·평가·질문·신뢰도는 orchestration [#383](https://github.com/project-artel/artel-orchestration-server/pull/383), agent [#275](https://github.com/project-artel/artel-agent-server/pull/275), SDK [#174](https://github.com/project-artel/artel-sdk/pull/174)의 계약과 함께 배포해야 한다. 이 원본 PR들은 저장소별 통합 PR의 포함 목록을 추적하는 링크다.

## 검증과 기존 화면 증거

- `npm run typecheck`: 통과.
- `npm test`: 1,547개 통과. JPEG_WS canvas와 이전 video의 근거 capture 제한, 전체 snapshot에서 신규 TC 통과·판단 불가 복원을 통합 회귀로 추가했다.
- `npm run build`: 통과. Vite의 500 kB 이상 chunk 경고는 남아 있다.
- 충돌 해결·통합 회귀 파일 7개의 `eslint --max-warnings 0`: 통과.
- `npm run lint`: 기존 오류 4개·경고 4개로 실패했다. 오류 파일은 `src/testCases/useCaseListNav.ts`, `src/testRuns/RunListPanel.tsx`, `src/testRuns/RunNameCrumb.tsx`, `src/testScenarios/useStepEditor.ts`이며 네 파일이 `origin/develop`과 동일함을 확인했다. 통합 범위 밖의 React 수명 처리는 변경하지 않았다.
- `git diff --check`: 통과.

기존 화면과 실제 연결 검증 이력은 [영상·TC 평가 검증](qa-evaluation-verification.md), [TC 시연 기록](tc-demonstration.md) 및 각 원본 PR의 스크린샷을 보존했다. #228의 최신 TC 판정·상대 재생 진행도 캡처도 해당 원본 body에서 확인할 수 있다. `.plan/assets/2026-10-23-tc-demonstration`, `.plan/assets/qa-version-cases`, `.plan/assets/remove-cheat-indicators`, `.plan/assets/qa-verdict-restoration`, `.plan/assets/2026-10-27-tc-hover-details`의 기존 이미지도 포함한다.

이번 통합 검증에서는 실행 중인 stack을 재시작하거나 유료 QA·실제 시연을 새로 시작하지 않았다. 원본 PR의 실제 브라우저·Unity 검증을 통합 branch의 새 실행 결과로 집계하지 않는다. TC 시연 기능과 입력 제어, 검증 절차 추출·승인·agent 참고 연결은 이후 제거했다. 시연 기능은 더 이상 배포·검증 대상이 아니다.

## TC 시연 기능 제거

사용자 요청으로 시연 화면·입력 제어·판정 기록·검증 절차 추출과 승인·agent 참고를 제거했다. 기존 시연 데이터와 시연 전용 저장 객체 삭제는 orchestration의 정리 작업으로 처리한다. QA 실행 녹화와 판정 검토, 사용자 피드백은 유지한다. TC 번호 표시 변경은 별도 세션에서 진행한다.
