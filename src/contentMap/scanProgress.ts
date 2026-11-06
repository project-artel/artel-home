import type { LastScan, ScanPhase } from './contentMapTypes'

/**
 * 단계마다 도넛에서 차지하는 몫(%). 앞 끝은 그 단계에 들어서는 순간의 값이다.
 *
 * 서버는 퍼센트를 만들지 않는다 — 단계마다 분모가 다르고(씬 수 · 업로드 걸음 · 문서 수) 그 몫을 정하는 것은 그리는
 * 쪽이다. 씬을 도는 것이 대부분의 시간이라 그 몫이 크다. TC 를 함께 만들면 그 단계가 끝에 붙는다.
 * 마지막 단계도 100 에 닿지 않는다 — 100 은 서버가 끝났다고 말한 뒤에만 그린다.
 *
 * **몫은 그 단계가 실제로 움직이는 칸 수에 맞춘다.** 씬은 씬 수만큼 움직이고, 업로드는 네 걸음이다
 * (`EvidenceUploader` 의 `UploadSteps`). 적재는 한 칸도 못 움직인다 — 스캔 한 번이 올리는 문서가 늘 한 장이라
 * 분모가 1 이고, 서버도 그 단계에 들어서며 `progress` 를 지운다. 그래서 적재에 큰 몫을 주면 그만큼이 한 숫자에
 * 붙박여, 재 보니 그 자리에 1.1 ~ 36.1초를 서 있었다(빌드 5 · 8 · 4 의 `received_at` → `ingested_at`).
 * 못 채울 자리는 좁게 둔다. 그 구간의 진행은 옆의 문서 적재 막대가 따로 들고 있다.
 */
const BANDS: Record<'scanOnly' | 'withTestCases', Partial<Record<ScanPhase, readonly [number, number]>>> = {
  scanOnly: {
    SCANNING: [0, 90],
    UPLOADING: [90, 96],
    INGESTING: [96, 99],
  },
  withTestCases: {
    SCANNING: [0, 70],
    UPLOADING: [70, 78],
    INGESTING: [78, 88],
    GENERATING_TEST_CASES: [88, 99],
  },
}

/**
 * 스캔 하나의 진행 %(ARTEL-1179). 그릴 수 없으면 null 이다 — 단계를 모르는 옛 서버이거나 스캔이 깨졌다. 그때 화면은
 * 지금처럼 경과 시간만 보인다.
 */
export function scanPercent(scan: LastScan): number | null {
  if (scan.state === 'SUCCEEDED') return 100
  if (scan.state === 'FAILED' || scan.phase === null) return null

  const band = BANDS[scan.testCases === null ? 'scanOnly' : 'withTestCases'][scan.phase]
  if (band === undefined) return null
  const [start, end] = band
  if (scan.progress === null) return start
  return Math.floor(start + ((end - start) * scan.progress.done) / scan.progress.total)
}
