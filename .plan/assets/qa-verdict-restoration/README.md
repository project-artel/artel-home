# QA 재진입 판정 화면 캡처

2026-10-28, PR #230의 실제 `QaRunRoute` 및 `useQaTry`를 로컬 Vite에서 렌더링했다.
API 응답과 SSE는 `fixture.tsx`의 테스트 데이터로 대체했으며 게임과 운영 서버에는 연결하지 않았다.
화면 상단에도 이 제한을 표시했다.

## 재현

1. 저장소에서 `npm run dev -- --host 127.0.0.1 --port 5199` 실행.
2. `http://127.0.0.1:5199/.plan/assets/qa-verdict-restoration/index.html` 열기.
3. Raw 탭 선택: 최신 일반 로그 50개와 TC 판정(통과 2, 실패 1, 대기 1) 확인.
4. 상단 `화면 나가기`를 누르고 `QA 화면으로 돌아가기` 선택.
5. Raw 탭 선택 후 동일 판정과 `판정 API 조회 2회` 확인.

`01-before-leaving.png`와 `02-after-returning.png`는 1280×720 브라우저 캡처 원본이다.
실제 컴포넌트의 unmount/remount와 응답 기반 복원을 검증하지만 운영 서버와의 E2E 검증은 아니다.
