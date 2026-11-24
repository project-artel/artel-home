# 2026-11-24 콘솔 화면별 가로 압축 점검

- Date: 2026-11-24
- Jira: ARTEL-1465
- Status: 브라우저 재검증 완료

## Goal

각 화면의 CSS viewport 폭별로 본문, 범례, 수치와 버튼의 가독성을 확인한다.

## Non-goals

운영 배포와 문구 변경은 범위 밖이다.

## Context / Constraints

기본 브랜치 develop에서 분리한 작업 폴더에서 검증한다. 로그인, 비밀번호 변경, 관리자와 프로젝트 상세는 각 상태에 맞는 데이터를 사용한다.

## Approach (Checklist)

- [x] 라우터와 계정·프로젝트 설정 탭 확인
- [x] 폭별 화면 렌더링과 내부 줄바꿈 검사
- [x] 발견한 결함 수정 및 재검증
- [x] 변경 검토 및 로컬 빌드·테스트

## Validation

각 열은 CSS viewport 폭(px)이다. ✓는 라이트·다크 모두 해당 화면 본문을 확인하고 캡처했다는 뜻이다. 79개 화면·상태에서 총 1,738개 이미지를 기록했다. 로그인 전, 비밀번호 변경, 관리자, 프로젝트 소유자 상태는 로컬 API 예시 데이터로 재현했다. forced=1과 dock=1은 검증용 상태를 가리킨다. 테스트 런 편집 주소는 앱에서 첫 시나리오 편집기로 이동한다.

| 화면 | 320 | 360 | 390 | 600 | 768 | 960 | 1024 | 1280 | 1440 | 1826 | 1920 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `/projects` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/setup` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/login` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/sdk-login` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/mcp/connect` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects?forced=1` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/not-found` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/account?tab=profile` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/account?tab=email` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/account?tab=preferences` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/account?tab=api` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/account?tab=cli-tokens` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/qa` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/usage` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/knowledge` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/graph` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/labels` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/users` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/settings` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/chat` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/documents` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/test-cases` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/test-runs` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/qa` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/qa-history` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/qa-history/9601` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/game-builds` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/game-identities` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/content-map` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/macros` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/performance` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/issues` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/knowledge` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/setup` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/api` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/members` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/settings?tab=general` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/settings?tab=tracker` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/settings?tab=review` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/settings?tab=agent` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/settings?tab=danger` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/instances/9101` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/test-scenarios/9501` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/test-runs/9401` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/test-runs/9401/edit` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/qa-runs/9601` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/qa-runs/9601/performance` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/game-builds/9001/performance` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/not-found` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/game-identities?tab=exits` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/game-identities?tab=variables` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/game-identities?tab=facts` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/game-identities?tab=rules` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/issues?tab=issues` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/issues?tab=categories` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/issues?compose=new` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/game-builds?build=9001` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/sdk-login?port=48000&challenge=fixture&state=fixture` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/mcp/connect?request=fixture&client=Codex` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/setup?guide=cli` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/setup?guide=skills&agent=codex` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/setup?guide=skills&agent=claude-code` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/setup?guide=skills&agent=cursor` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/setup?guide=skills&agent=vscode` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/setup?guide=skills&agent=other` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/setup?guide=cli` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/setup?guide=skills&agent=codex` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/setup?guide=skills&agent=claude-code` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/setup?guide=skills&agent=cursor` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/setup?guide=skills&agent=vscode` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/setup?guide=skills&agent=other` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/issues?discussion=9950` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/issues?issue=9801` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/qa-history/9601?review=1` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/test-cases?case=9201` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/macros?build=developer` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/projects/7/?dock=1` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/account?tab=api&project=7` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 재현 결과와 수정 확인

| 화면 | 재현 조건 | 수정 후 확인 |
| --- | --- | --- |
| 계정 API 관리 | 320px에서 범례 이름 폭 0px, 1440px에서 11px | 각각 146px, 163px. 기능명, 비율, 금액을 읽을 수 있고 프로젝트 선택도 동작한다. |
| 프로젝트 설정·테스트 런 목록 | 320px에서 설정 카드 본문이 세로로 접히고 960·1024px에서 런 이름이 사라짐 | 본문과 조작 버튼이 칸 폭에 맞춰 다른 줄로 이동한다. |
| 대시보드·QA 실행 | 중간 폭에서 표 제목과 결과 카드가 좁아짐 | 단축 표와 카드 열 수가 본문 폭을 따른다. |
| 전체 이슈·팀 공유 | 좁은 표에서 열 제목과 글 제목이 한 글자씩 줄바꿈 | 이슈 표 안에서 오른쪽 열까지 스크롤할 수 있다. 팀 공유에서는 제목 아래에 분류 정보가 놓인다. |
| 테스트 런 캔버스 | 768px에서 메뉴와 대화창 사이에 캔버스 174px만 남음 | 채팅이 아래로 이동하며 전체 보기와 도구 모음을 사용할 수 있다. |
| 화면 지도·인증 | 320px에서 연결 상태가 잘리고 1024px 로그인 폼 옆이 비었음 | 상태 문구가 줄바꿈되고 로그인 폼은 가로 공간을 채운다. |
| 프로젝트 채팅·Test Case 편집 | 768px에서 열린 대화창이 본문을 압축하고 320px에서 Agent 버튼이 저장을 덮음 | 대화창과 본문이 함께 들어갈 때만 나란히 표시한다. 탐색 메뉴에서 대화를 열 수 있고 편집 창의 하단 버튼이 보인다. |

- Edge에서 실제 앱 라우트를 열어 각 조합의 화면, 본문 식별 문구, 테마, 가로 넘침과 비정상 줄바꿈을 검사했다. 라이트·다크 캡처를 모아 검토하고 문제가 의심되는 조합은 원본 크기로 확인했다.
- 320px 이슈 표의 마지막 열 접근, 계정 사용량 프로젝트 선택, 768px의 독립 채팅 진입을 브라우저에서 확인했다.
- npm run build, npm test(1,695개), git diff --check 통과. npm run lint는 오류 0개, 기존 Fast Refresh 경고 2개였다.

## Risks & Rollback

같은 페이지에서도 데이터 길이와 열린 패널에 따라 본문 폭이 달라진다. 문제를 재현한 조건을 결과에 함께 기록한다. 레이아웃 수정은 해당 CSS 변경을 되돌릴 수 있다.

## Open Questions

실제 Unity 세션과 운영 데이터의 실시간 동기화는 검증 범위 밖이다. 게임 뷰어에는 예시 JPEG 프레임을 전달했다. 사용량·로그·회원·이슈 데이터는 예시 응답이다. QA 실행·결제·키 등록은 수행하지 않았다.
