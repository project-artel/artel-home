# QA 녹화 화면 검증

2026-11-04, ARTEL-1374.

실제 `QaRunRoute`와 하위 컴포넌트를 합성 API 응답으로 구동했습니다. `video.mp4`는 FFmpeg `testsrc2`로 생성한 3초 H.264 영상입니다. 사용자 프로젝트·운영 녹화 데이터는 읽거나 수정하지 않았습니다. 이 검증은 실제 Unity QA 및 운영 서버 E2E 검증이 아닙니다.

## 실행

`npm run dev -- --host 127.0.0.1 --port 5195 --strictPort`를 실행한 뒤 `node .plan/assets/qa-replay/check.cjs`로 확인합니다. Playwright가 프로젝트에 없으면 `PLAYWRIGHT_MODULE`에 설치된 모듈 경로를 지정하고, 기본 Chromium 대신 이미 설치된 브라우저를 쓰려면 `CHROMIUM_EXECUTABLE`에 실행 파일 경로를 지정합니다. fixture URL은 `http://127.0.0.1:5195/.plan/assets/qa-replay/index.html`입니다.

## 결과

Chromium 화면 회귀 19개가 통과했습니다.

- 기존 영상 로드, TC 반복 시도와 시작 시각 없는 attempt 표시.
- pulse 기본 제외·포함 전환, 메시지 필터·payload find와 Enter 이동.
- TC 선택과 실행 바 탐색 시 segment offset 및 시점 로그 동기화.
- 이전 로그 페이지 로드, 100개 초과 attempt 페이지 로드.
- 영상 중간 gap 및 마지막 영상 이후 gap에서 이전 프레임 제거.
- 실제 영상 종료 후 다음 segment 재생, 재시도 시 0초·정지 초기화.
- 재생·검색·키보드 실행 바 탐색 중 입력 포커스 유지.
- 라이트·다크, 1440px·1024px·390px 화면과 가로 넘침 확인.
- 녹화 API 오류·재시도와 보관 만료 안내, 브라우저 pageerror 없음.

전체 테스트 1,621개, build, 변경 파일 ESLint와 diff-check도 통과했습니다. 전체 lint는 수정하지 않은 `authoringFrames.ts`, `useCaseListNav.ts`, `RunListPanel.tsx`, `RunNameCrumb.tsx`, `useStepEditor.ts`의 기존 오류 5개와 경고 3개로 실패합니다. build에는 기존 bundle 크기 경고가 남습니다.

## 캡처

- `desktop-light.png`, `desktop-dark.png`: 영상·TC 구간·raw 필터.
- `mobile-dark.png`, `tablet-light.png`: 작은 화면 실행 바.
- `gap.png`, `tail-gap.png`: 중간·끝 누락 구간.
- `error.png`, `expired.png`: API 오류와 보관 만료.
