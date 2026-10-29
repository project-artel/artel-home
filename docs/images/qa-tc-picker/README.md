# TC 판정 검토의 가로 선택 바 적용

QA 히스토리의 TC 선택 dropdown을 가로 스크롤 선택 바로 변경했다. 각 TC의 agent 판정과 사람 평가를 함께 표시하며, 같은 TC를 여러 번 검증한 경우 시도별 선택도 유지한다.

## 검증 결과

- 전체 테스트 1,551개, build, 변경 파일 ESLint, git diff --check 통과.
- 로컬 QA 실행 6의 실제 저장 영상을 사용해 TC 1~5 선택과 Home/End 키 이동 확인.
- TC 5 영상 재생 중 TC 4를 선택하면 재생 막대가 0초이고 영상이 정지됨을 확인. 원본 영상 위치는 TC 4 구간 시작인 9.272초다.
- 390px 화면에서 선택 바 폭 342px, 내용 폭 896px로 가로 스크롤 확인. End 키로 TC 5를 선택하면 scrollLeft 552px로 이동하며 페이지 폭은 390px를 유지한다.
- 같은 TC의 반복 시도와 오래된 직접 링크 시도는 자동 테스트로 확인했다. 실제 데이터에 반복 시도를 추가하지 않았다.
- 로컬 검증이며 배포 환경 E2E 검증은 포함하지 않는다.

## 화면 캡처

- [변경 전 dropdown](00-before-dropdown.png)
- [변경 후 TC 선택 바](01-after-tabs.png)
- [TC 4 전환](02-tc4-video-reset.png)
- [작은 화면](03-mobile-scroll.png)
- [작은 화면 첫 TC 선택](04-mobile-first-tc.png)
- [작은 화면 마지막 TC 선택](05-mobile-last-tc.png)
