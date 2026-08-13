# 2026-08-13 — 성능 지표 런 상세·빌드 추세 화면

- Date: 2026-08-13
- GitHub Issue: None
- Status: Implemented — awaiting server integration

## Goal

ARTEL-379의 확정 Notion 계약만 사용해 QA 런 상세와 빌드 추세 화면을 추가한다. 프레임 평균·p95·최대, hitch 시점, CPU·메모리, 프레임 예산, 측정 공백, 신뢰도 경고를 오독 없이 보여준다. 서버 준비 전에는 계약 형태의 로컬 mock으로 모든 경계를 재현한다.

## Non-goals

- 성능 회귀 자동 판정이나 알림
- SDK 실시간 스트리밍 갱신
- 클라이언트 재다운샘플링
- orchestration 서버 구현

## Context / Constraints

- 런 API: `GET /api/qa-runs/{runId}/performance`; 빌드 API: `GET /api/projects/{projectId}/game-builds/{gameBuildId}/performance`.
- Notion의 필드와 의미가 계약이다. 문서 밖 필드를 가정하지 않는다.
- `null`은 측정 안 됨이다. 시계열 선을 끊고 CPU·메모리를 0으로 표시하지 않는다.
- 비교 기준은 `hitchesPerMinute`; `budgetMs`가 있을 때만 예산 대비 해석을 제공한다.
- 계약에 “낮은 `coverageRatio`/높은 `dischargingRatio`”의 임계가 없다. 구현 전에 계약 문서의 해당 해석 블록에 임계값을 PATCH하고 ARTEL-378에 이유·서버 영향을 댓글로 남긴다. `ntn pages edit`는 사용하지 않는다.
- 임계 이하/초과 런은 값 자체를 버리지 않되 정상 런을 잇는 추세선에서는 분리하고, 점 모양·텍스트 경고·표 상태를 함께 제공한다. `summary: null`은 저신뢰와 다른 “샘플 없음” 상태다.
- hitch 시점은 새 필드가 아니라 `series.points[].atMs` 버킷에 `hitchCount > 0` marker로 표시한다. 정확도는 `bucketMs`이며 총수 비교로 해석하지 않는다.
- repo-local Blueprint Paper 토큰, 무그림자, 키보드 접근성, 시각 그래프의 표 대체물을 따른다.

## Approach (Checklist)

- [x] **Step 0: Recon** — Jira ARTEL-379, 세 Notion 문서, repo 지침·디자인 시스템, 기존 route/API/i18n 구조를 확인한다.
- [x] **Step 1: Contract correction** — Notion의 정확한 블록 ID/API PATCH 방법을 조회한다. 두 조회 문서에 동일한 신뢰도 임계와 UI/서버 의미를 블록 PATCH하고 ARTEL-378에 필요성·서버 영향을 댓글로 남긴 뒤 다시 읽어 검증한다.
- [x] **Step 2: Contract layer** — 계약 타입·엄격 parser를 만들고 기존 `apiFetch`를 직접 사용한다. 별도 인증/data-source/provider 계층은 만들지 않는다. 같은 parser를 통과하는 작은 환경 분기로 mock fixture를 반환한다. mock은 무샘플, 무process와 실제 0, 중간 null 구간, null budget, 동일 절대값·다른 budget, 낮은 coverage, 높은 discharging, 0·1개 runs를 포함한다.
- [x] **Step 3: Run detail** — 전체 폭 route에서 요약, `budgetMs != null`일 때만 budget 기준선·대비를 표시하고 null이면 절대값만 표시한다. 평균·p95·최대, 버킷 해상도 hitch marker, focus-loss 공백, CPU·메모리와 접근 가능한 표를 구현한다. 서버 포인트 순서·다운샘플을 그대로 쓴다.
- [x] **Step 4: Build trend** — 빌드별 route에서 runs만 `startedAt` 시간순 정렬해 `hitchesPerMinute`를 그린다. 빈·단일 상태, 저신뢰 점의 정상 선 분리/텍스트 경고, 런 상세 링크를 구현한다. 계약 값을 필터링해 버리지 않는다.
- [x] **Step 5: Entry points and copy** — 기존 QA 런·빌드 패널에 최소 링크만 추가하고 한·영 번역 및 semantic CSS를 추가한다. 기존 패널 재구성은 하지 않는다.
- [x] **Step 6: Tests** — 페이지별 로직을 유지하고 범용 chart engine은 만들지 않는다. 재사용 순수 함수는 null 연속구간 분리·runs 정렬·format에 한정한다. 평균/p95/max/CPU/memory null 단절, focus-loss 사유, null과 0 구분, budget 유무, hitch 버킷, 저신뢰 선 분리, 빈·단일 데이터, 포인트 무재정렬·무재샘플링을 테스트한다. 표·legend·marker·키보드·색상 외 구분도 브라우저에서 확인한다.
- [x] **Step 7: Review and delivery** — lint, typecheck, test, build와 1024px·1440px 브라우저 검증 후 전체 diff와 pair review를 통과시킨다. worktree 브랜치에서 한글 Conventional Commit + `Jira: ARTEL-379` footer로 커밋한다. `pull-request.md` 형식, base develop, `--assignee @me`, enhancement label로 PR을 만들고 mock 검증과 실서버 미검증을 분리 기록한다.

## Validation

- **Commands to run:** `npm test`; `npm run lint`; `npm run typecheck`; `npm run build`; 브라우저에서 mock route를 1024px·1440px와 키보드로 확인.
- **Expected output:** 모든 명령 성공. null 구간은 모든 series에서 끊기며 `isFocused: false`가 텍스트로 설명된다. 무process는 측정 안 됨, 실제 0은 0으로 남는다. 무샘플/빈/단일 runs는 안정된 empty/sparse 상태다. 저신뢰 값은 보존되지만 정상 추세선에 연결되지 않는다. null budget은 결함 암시가 없다.

## Risks & Rollback

- **Risks:** 계약 예시의 `series` 위치 해석, 기존 QA console의 정보 밀도 증가, mock이 실서버 연동 차이를 숨길 수 있음.
- **Rollback steps:** route·entry point·performance 모듈을 한 커밋으로 되돌린다. 서버 준비 시 환경 분기만 제거하고 동일 parser/API 호출을 유지한다.

## Contract corrections made

1. 두 조회 문서에 저신뢰 임계(`coverageRatio < 0.8`, `dischargingRatio > 0.2`, 경계값 제외)를 명시했다.
2. 런 상세 문서의 `해석 규칙`에 다운샘플 버킷의 `isFocused`와 `null`의 동치 규칙을 추가했다. 부분 포커스 버킷을 빈 구간으로 그릴지 값으로 그릴지 정할 근거가 없었다. ARTEL-378에 서버 영향과 함께 남겼다.

화면은 이 동치를 단정하지 않는다. 빈 구간은 그리는 계열의 `null` 여부로 판정하고 `isFocused`는 사유 라벨로만 쓴다.

## Open Questions

- 실서버가 아직 없어 HTTP 상태·인증·실제 payload 통합은 PR 이후 서버 준비 시 별도 검증이 필요하다.
- 브라우저 자동화 실행 파일과 헤드리스 크로미움이 환경에 없어 1024px·1440px 렌더와 키보드 이동은 사람이 확인해야 한다.
