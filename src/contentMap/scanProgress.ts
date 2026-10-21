import type { LastScan, ScanPhase } from './contentMapTypes'

/**
 * 단계마다 도넛에서 차지하는 몫(%). 앞 끝은 그 단계에 들어서는 순간의 값이다.
 *
 * 서버는 퍼센트를 만들지 않는다 — 단계마다 분모가 다르고(씬 수 · 업로드 걸음 · 문서 수) 그 몫을 정하는 것은 그리는
 * 쪽이다. 씬을 도는 것이 대부분의 시간이라 그 몫이 크다. TC 를 함께 만들면 그 단계가 끝에 붙는다.
 * 마지막 단계도 100 에 닿지 않는다 — 100 은 서버가 끝났다고 말한 뒤에만 그린다.
 */
const BANDS: Record<'scanOnly' | 'withTestCases', Partial<Record<ScanPhase, readonly [number, number]>>> = {
  scanOnly: {
    SCANNING: [0, 80],
    UPLOADING: [80, 90],
    INGESTING: [90, 99],
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
