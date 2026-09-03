# content map 화면에 적재 진행률과 문서별 실패를 보인다 (ARTEL-764)

## Goal

`GET .../content-map/events` (ARTEL-763 이 만드는 SSE, `contract-contentmap.md` 로 못 박힌 계약)를
구독해서, content map 화면이 문서 적재 진행률(올라온 문서 수 대 앉은 문서 수)과 문서별 상태
(안 읽힘/읽힘/실패, 실패 시 `ingestError`)를 스스로 갱신한다. 스캔 자체는 진행률 막대 없이
`ScanState`(REQUESTED/SUCCEEDED/FAILED) + 경과 시간으로 보인다. 서버 재시작으로
`snapshot.scan` 이 `null` 이면 "이 서버는 이 빌드의 스캔을 모른다"고 명시적으로 말하고, 영원한
진행 중으로 그리지 않는다.

## Non-goals

- 실패한 문서를 다시 적재하는 버튼
- 지도 레이아웃(`screenMapLayout.ts`, `ScreenMapCanvas.tsx`) 변경
- ARTEL-761 이 만드는 `src/projects/**` 의 SSE 훅과 공유하는 helper — 이 트랙은 `src/contentMap/`
  안에서 독립적으로 만든다

## Interpretation decisions (계약에 없는 것)

1. **소스 오브 트루스는 SSE 하나.** `GET .../content-map` 응답의 `lastScan` 필드는 파싱하지
   않는다. 파싱하면 GET 스냅샷과 SSE 스냅샷 두 곳이 같은 사실(스캔 상태)을 말하게 되고, 그
   재조정 로직이 딱 이 이슈가 피하라는 "같은 사실을 두 곳에서 말하기"다. SSE 는 구독 직후
   `snapshot` 이벤트를 정확히 한 번 보내므로 그 공백은 "connecting" 상태로 충분히 짧다.
2. **문서 목록은 완결되지 않은 것만 개별 행으로.** SSE `documents` 는 이 빌드의 모든
   `content_map_document` 행을 준다. 전부를 개별 행으로 그리면 이미 적재된 문서가 수십~수백
   개일 때 목록이 통제 불능이 된다(`DESIGN.md` 의 "Dense, not crowded", "Calm until critical").
   그래서 집계 줄(적재 진행률 막대)로 "읽힘" 상태를 보이고, 개별 행은 "아직 안 읽힘"과 "실패"
   만 나열한다. `ingestedDocuments` 카운트가 "읽힘" 상태를 이미 화면에 올리므로 세 상태가
   구별되지 않는 것은 아니다.
3. **`ContentMapPage` 상단 배너의 분모는 SSE 를 우선한다.** `view.pendingDocuments.length`(GET)
   와 SSE 의 `ingest` 파생값이 동시에 화면에 있으면 그것도 같은 사실의 이중 진술이다. SSE 가
   스냅샷을 아직 안 줬을 때만 GET 값으로 보이고, 스냅샷을 받은 뒤로는 SSE 파생값 하나로
   바뀐다.

## Changes

- `contentMapTypes.ts` — `ScanState`, `LastScan`, `IngestProgress`, `ContentMapDocumentEvent`,
  `documentIngestState`, `ContentMapStreamState`, `scanElapsedSeconds` 추가.
- `contentMapApi.ts` — SSE 프레임 파서 4개(`snapshot`/`scan`/`ingest`/`document`) + 그 안의
  객체 파서(`parseLastScan`/`parseIngestProgress`/`parseContentMapDocumentEvent`) + `contentMapEventsUrl`.
- `useContentMapEvents.ts` (신규) — `EventSource` 구독. `useQaTry.ts:122-167` 를 본뜨되 이
  파일 안에서 독립적으로 구현(공유 helper 없음). 언마운트에서 `source.close()`.
- `EvidenceScanPanel.tsx` — 스캔 상태 표시(상태+경과시간, 진행률 막대 없음)와 문서 적재
  진행률(막대 있음) + 미완료 문서 목록을 SSE 상태로 교체. `requested` 카피에서 "새로고침"
  안내를 뺀다(이제 스스로 갱신되므로).
- `ContentMapPage.tsx` — `useContentMapEvents` 호출, 상단 배너 분모를 SSE 우선으로.
- `contentMapEvents.test.ts` (신규) — 새 순수 파서와 `documentIngestState`/`scanElapsedSeconds`
  단위 테스트. `EventSource` mock 은 만들지 않는다.

## Validation

`npm run typecheck`, `npm run test`. 로컬 stack 검증(이슈 Validation Notes)은 서버 쪽
(ARTEL-763)이 아직 구현 중이라 수행하지 않는다 — PR 에 명시한다.
