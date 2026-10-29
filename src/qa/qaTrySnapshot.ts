import { getQaTry, listQaLogs, listQaVerdicts } from './qaApi'
import { mergeQaVerdicts } from './qaVerdicts'

export async function loadQaTrySnapshot(qaTryId: string, signal?: AbortSignal) {
  const [qaTry, page] = await Promise.all([
    getQaTry(qaTryId, signal),
    listQaLogs(qaTryId, undefined, signal),
  ])
  // SSE cursor를 확보한 뒤 판정을 읽는다. 반대 순서면 두 조회 사이의 판정이
  // 최신 50개 밖으로 밀려날 때 snapshot과 SSE 양쪽에서 빠질 수 있다.
  const verdicts = await listQaVerdicts(qaTryId, signal)
  return { qaTry, page, verdictLogs: mergeQaVerdicts(verdicts, page.items) }
}
