# QA 녹화 화면 검증

2026-11-04, ARTEL-1374.

실제 `QaRunRoute`와 하위 컴포넌트를 합성 API 응답으로 구동했습니다. `video.mp4`는 FFmpeg `testsrc2`로 생성한 3초 H.264 영상입니다. 사용자 프로젝트·운영 녹화 데이터는 읽거나 수정하지 않았습니다. 이 검증은 실제 Unity QA 및 운영 서버 E2E 검증이 아닙니다.

## 실행

`npm run dev -- --host 127.0.0.1 --port 5195 --strictPort`를 실행한 뒤 `node .plan/assets/qa-replay/check.cjs`로 확인합니다. Playwright가 프로젝트에 없으면 `PLAYWRIGHT_MODULE`에 설치된 모듈 경로를 지정하고, 기본 Chromium 대신 이미 설치된 브라우저를 쓰려면 `CHROMIUM_EXECUTABLE`에 실행 파일 경로를 지정합니다. fixture URL은 `http://127.0.0.1:5195/.plan/assets/qa-replay/index.html`입니다.

## 결과

Chromium 화면 회귀 59개가 통과했습니다.

- 기존 영상 로드, TC 반복 시도와 시작 시각 없는 attempt 표시.
- pulse 기본 제외·포함 전환, 메시지 필터·payload find와 Enter 이동.
- TC 선택과 실행 바 탐색 시 segment offset 및 시점 로그 동기화.
- 검색 시 이전 로그 자동 조회, 100개 초과 attempt 페이지 로드.
- 시나리오 아래 전체 폭 타임라인, 경계선의 드래그 높이 조절과 SVG 접기·펼치기 버튼, 시간축 확대.
- 타임라인 높이 조절·펼치기 중 기존 영상 위치·크기 유지, 키보드 높이 조절.
- 동시 TC별 track과 같은 TC 반복 검증의 겹친 lane, 현재 TC3건 표시.
- 시점 로그 조회 성공 뒤 다른 seek 실패·재시도 복구, 재생 버튼과 시간 바 진행.
- 영상 중간 gap 및 마지막 영상 이후 gap에서 이전 프레임 제거.
- 실제 영상 종료 후 다음 segment 재생, 재시도 시 0초·정지 초기화.
- 재생·검색·키보드 실행 바 탐색 중 입력 포커스 유지.
- 라이트·다크, 1440px·1024px·390px 화면과 가로 넘침 확인.
- 녹화 API 오류·재시도와 보관 만료 안내, 브라우저 pageerror 없음.

전체 테스트 1,635개, build, 변경 파일 ESLint와 diff-check도 통과했습니다. 전체 lint는 수정하지 않은 `authoringFrames.ts`, `useCaseListNav.ts`, `RunListPanel.tsx`, `RunNameCrumb.tsx`, `useStepEditor.ts`의 기존 오류 5개와 경고 3개로 실패합니다. build에는 기존 bundle 크기 경고가 남습니다.

## 캡처

- `desktop-light.png`, `desktop-dark.png`: 영상·TC 구간·raw 필터.
- `mobile-dark.png`, `tablet-light.png`: 작은 화면 실행 바.
- `gap.png`, `tail-gap.png`: 중간·끝 누락 구간.
- `error.png`, `expired.png`: API 오류와 보관 만료.

실제 QA12의 영상 decode, TC별16개 track, Raw 로그 표시, 1.3초 재생 시 bar1.3과 일시 정지 버튼, 접기·펼치기와4배 확대를 읽기 전용으로 확인했습니다.

타임라인은 하단 overlay로 표시합니다. 위로 높이를 늘려도 기존 시나리오·영상·로그 레이아웃을 밀지 않습니다.

드래그 손잡이는 경계선의 얇은 선으로 표시하고 접기 버튼은 오른쪽 도구 모음에 둡니다. 영상 누락 구간 수는 표시하지 않으며 해당 시점을 선택하면 영상 영역에서 안내합니다.

아래로 드래그하면 접히고 접힌 상태에서 위로 드래그하면 펼쳐집니다. 접힌 실행 바49px만큼 본문 공간을 확보하며, 추가로 펼쳐지는 영역은 overlay입니다. 브라우저에서 본문 하단과 접힌 bar 상단이 일치하는지 확인했습니다.

2026-11-04 develop1418c7b 통합 후 전체 테스트1635개, Chromium40개, build와 충돌 해결 파일 ESLint를 다시 확인했습니다. 모델 API 오류 안내·실행 안 함 표시와 replay 기능을 함께 유지합니다.

통합 시 추가된 not_started 시나리오는 녹화 player를 mount하지 않습니다. fixture에서 공유 run 녹화가 있더라도 video와 타임라인이 표시되지 않는 회귀를 추가했습니다. not-started.png는 이 상태입니다.

영상이 없거나 보관 만료·준비 중·조회 오류인 경우 큰 영상 영역을 제거하고 짧은 안내만 남깁니다. 채팅이 확보된 공간을 사용하며 유효한 시간 범위의 TC 타임라인과 로그는 유지됩니다. 일부 gap은 기존 영상 배치를 유지합니다. API·영상 파일 오류 후 재시도 복구와 무영상 상태의 양 테마·모바일 배치를 확인했습니다. no-recording-light.png, no-recording-dark.png, no-recording-mobile.png에 캡처를 남겼습니다. 이번 보완은 Chromium59개, 시간·로그 테스트11개, build 및 변경 파일 ESLint로 확인했습니다. 전체1635개 테스트는 직전 develop 통합 시 통과한 결과입니다.
