# Scenario TC 시연과 검증 절차 검토 추가

승인된 루트 계획과 `tc-demonstration-contract.md`의 Browser API를 따른다. Scenario 편집 hook과 run chat은 유지하고 가운데 시연 패널에서 TC 선택, instance 연결, 입력, 장면 저장, 판정, 절차 검토를 제공한다.

- 입력은 하나의 ACK 대기 명령과 상한이 있는 queue로 제한한다. 마지막 pointer move만 합치며 키와 버튼 순서를 보존한다. 연결 상실, focus 상실, 지연 ACK는 제어를 종료하고 자동 재전송하지 않는다.
- letterbox를 제외한 정규화 좌표로 조작하고 SDK가 실행 시 게임 해상도로 변환한다. 축소된 스트림 해상도를 게임 픽셀로 오인하지 않는다. 실제 video frame을 PNG로 저장하며 판정 영역은 고정된 이미지의 정규화 좌표다.
- 첫 video frame, 키·버튼 입력 전, 입력 해제 후 다음 frame을 자동 저장한다. 250ms 간격, 세션당 60장, 전송 중 하나와 가장 최근 대기 장면 하나로 제한한다. ACK는 SDK 결과 저장 뒤 다음 입력을 허용하지만 성공을 뜻하지 않는다. 이 장면들은 브라우저 입력 전후의 context이며 정확한 SDK 적용 전후를 보장하지 않는다. 사람이 명시적으로 저장하는 판정 장면에는 이 자동 제한을 적용하지 않는다.
- 기록을 다시 읽고 절차 초안을 필드별로 수정한다. 같은 세션의 출처 이벤트를 단계와 판정마다 선택할 수 있다. 미해결 질문이 남은 빈 초안은 저장할 수 있으며 저장된 revision만 승인·철회한다. 미해결 질문이 있으면 승인하지 않는다.
- 좌표, 입력 순서, queue 상한, ACK, 지식 validation을 테스트하고 typecheck, lint, test, build를 실행한다. 실제 SDK 및 WebRTC 검증은 루트 통합 검증에서 수행한다.

## 검증 결과

- `npm run typecheck`, `npm run build` 통과. Vite의 기존 큰 bundle 경고가 남는다.
- `npm test`: 1,486건 통과. 시연 전용 테스트 13건은 축소 영상 좌표, Unity 입력 이름, ACK와 queue 순서·상한, 자동 capture queue, 근거 선택과 초안·승인 조건, 중단된 세션 정리 polling을 확인한다.
- 변경 파일의 `eslint`와 `git diff --check` 통과. 전체 lint는 기존 `GameStreamView`, `TestCaseModal`, `useCaseListNav`, `RunListPanel`, `RunNameCrumb`, `useStepEditor` 오류 6건으로 실패한다.
- 실제 React 컴포넌트에 mock API를 연결한 로컬 화면을 Chrome에서 확인했다. 한국어 light 360px, 영어 dark 1024/1440px에서 기록과 절차가 표시되고 가로 넘침이 없다. 미해결 질문을 입력하면 승인 버튼이 비활성화되는 것을 확인했다.
- 실제 서버(8096), agent(8098), Unity fixture와 home(5194)을 연결해 Count: 0 → 한 번 클릭 → Count: 1을 확인했다. 명시적 PNG #112, PASS 판정 #269, 실제 모델 추출, 출처 #87 선택, 초안 revision 2 저장과 승인을 UI에서 확인했다. session `706443ac-2823-4cab-b9bb-3f4ddeeb9b11`.
- 스크린샷은 `.plan/assets/2026-10-23-tc-demonstration/integration-count0.jpg`, `integration-count1.jpg`, `integration-approved.jpg`에 보관했다. 최초 hidden 게임은 검은 영상을 전송했으며 표시한 창으로 다시 실행해 해결했다.
- 모델이 한국어 입력에도 일본어 초안을 반환해 실제 편집 UI에서 한국어로 수정했다. 조작 직후 자동 장면은 표시 갱신 이전일 수 있어 완료 조건을 Count: 1 표시 확인으로 정리하고 정확한 지연은 측정하지 않았다고 기록했다.
- QA 실행과 승인 철회 후 재사용 차단 검증은 루트 통합 작업에서 이어간다.

- 검토용 스크린샷 3장의 표시 내용을 확인했다. 로컬 검증 계정과 fixture만 포함하며 JWT, API key, 개인 연락처는 없다.
- detail polling이 매번 새 presigned URL을 반환하면 기존 img src도 바뀌는 경로를 확인했다. 같은 evidence event의 이미지 URL을 컴포넌트에서 유지하고 로드 실패 때만 최신 URL로 재시도하도록 수정했다. 다른 장면을 선택하면 event ID key에 의해 새 이미지를 로드한다. 브라우저는 부모 QA 작업을 위해 조작하지 않았으며 수정 후 typecheck와 해당 파일 ESLint로 확인했다.

## 사람의 입력 부담 줄이기

사용자 피드백에 따라 관찰 현상·기대 결과·판정 이유 필수 입력을 없앴다. **이 화면 판정**은 PNG를 즉시 고정하고 입력 해제·시연 종료·업로드를 처리한다. 사람은 통과·실패·판단 보류 중 하나를 선택하며 설명만 선택적으로 덧붙인다. 기대 결과는 TC에서 읽고, 장면·영역 선택은 접힌 옵션에 둔다.

판정 저장 후 sourceHash가 준비되면 자동 추출을 세션별 한 번 시도한다. 수동 버튼과 실행 잠금을 공유하고 실패 시 수동 재시도를 제공한다. 절차는 요약과 승인 버튼을 기본으로 표시하고 편집 필드는 접었다. 기존 질문과 근거를 보존하며 질문이 남으면 승인을 차단한다.

설명 없는 최소 annotation payload와 선택 설명·영역, 자동·수동 추출 중복 차단 회귀 테스트를 추가했다. focused 13건, 전체 1,486건, build/typecheck/scoped ESLint 통과. 변경된 서버에서 실제 UI의 최소 입력 흐름까지 확인했다.

- 간소화 후 실제 session `cf713356-456d-4d5b-a0be-6a2aa1f3c04a`: Count 0→1, 화면 판정으로 freeze·종료·PNG #472 저장, 설명 없이 통과, 자동 추출, 한국어 요약, 미해결 질문 없는 revision 1을 수정 없이 승인했다. QA는 이 검증에서 실행하지 않았다.
- Network에서 annotation POST가 `{ "outcome": "PASS", "evidenceEventId": 472 }` 두 항목뿐이고 `/extract`가 자동 호출됨을 확인했다. `minimal-requests.json`은 요청 URL·method·body만 보관하며 인증 header를 포함하지 않는다. 새 UI 증거는 같은 assets 폴더의 `minimal-judgment.jpg`, `minimal-approved.jpg`다.
- 마우스 이동 진단: 브라우저 자연 이동은 1초 동안 move_mouse 35개를 전송한 후 중단됐고, ACK는 모두 수신됐다. SDK의 glide 누적 여부를 루트에서 조사 중이다. DOM video bounds `(520,464,530,298.125)`의 CSS 좌표 `(917.5,613.0625)`를 브라우저 CDP 입력으로 클릭하면 정규화 `(0.75,0.5)`가 실제 게임 Increment 버튼에 도달했다. 페이지 좌표를 게임 좌표로 보내는 변환 오류는 이 경로에서 재현되지 않았다. 스크롤 오프셋·720p/1080p/2160p 입력 크기 회귀 추가 후 focused 13건 통과. 임시 브라우저 진단 listener는 reload로 제거하고 viewport를 복원했다.

- 마우스 지연 수정 계약: backend는 SDK 결과 저장 후 ACK를 전송한다(최대 2.5초 대기). FAILED도 처리 완료로 ACK를 받고 UNKNOWN timeout은 제어를 종료한다. Browser는 기존 one-inflight와 pending move 병합을 그대로 사용한다. 추가 시간 throttle은 넣지 않았다. 새 SDK의 시연 전용 즉시 이동과 결합한 검증을 완료했다.

## 최종 마우스 검증

실제 video bounds `(520,464,530,298.125)`에서 좌상단 `(0.01,0.01)`, 우하단 `(0.99,0.99)`, 중앙 `(0.5,0.5)`을 지나는 연속 hover 60회 후 Browser의 자연 클릭으로 버튼 `(0.75,0.5)`을 한 번 눌렀다. 연결이 유지됐고 Count 0→1, 게임 pointer `(1440,540)`을 확인했다. Browser 영상은 1280×720이었으며 SDK는 게임의 1920×1080 좌표로 변환했다.

실제 INPUT 33개와 ACK 33개를 확인했다. 각 ACK 다음에 다음 INPUT이 전송됐고 마지막 move, mouse_down, move, mouse_up 순서가 유지됐다. `mouse-input-acks.json`에는 INPUT/ACK만 저장했으며 SDP, ICE, 인증 header는 제외했다. `mouse-count1.jpg`는 고정 장면 #627과 게임 pointer를 보여준다. 이 검증은 local fixture의 마우스 위치와 한 번 클릭을 확인하며 모든 게임의 입력 처리나 시각적 지연을 보장하지 않는다.

최종 전체 테스트 1,486/1,486, build(TypeScript 포함), 변경 파일 ESLint, diff 검사를 통과했다. 전체 lint의 기존 오류 6건과 Vite bundle 크기 경고는 남는다. Browser viewport는 복원했고 검토 중인 로컬 서비스는 유지했다.