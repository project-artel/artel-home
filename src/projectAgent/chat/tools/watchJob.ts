import { clearWatchRecords, isWatchKind, loadWatchRecords, type WatchRecord } from '../../jobs/watchRecords'
import { browserWatchDependencies } from '../../jobs/browserSources'
import { defaultLabel, startWatch } from '../../jobs/watchRunner'
import { tasksCopy } from '../../tasksCopy'
import type { ToolContext, ToolHandler } from '../toolTypes'

/**
 * `watch_job`. 진행 카드를 띄우고 바로 돌아온다. 지켜보기는 백그라운드에서 계속되고, 끝나면
 * `ctx.postEvent` 가 `job_finished` 나 `job_failed` 를 보낸다.
 */
export const watchJob: ToolHandler = async (args, ctx) => {
  const copy = tasksCopy()
  const { kind, id, label } = args
  if (!isWatchKind(kind)) return { status: 'error', error: copy.errors.unknownJobKind }
  const jobId = typeof id === 'string' ? id.trim() : typeof id === 'number' ? String(id) : ''
  // qa_run 과 content_map_scan 의 id 는 모두 숫자 id(QA 실행 id, 빌드 id)다.
  if (!/^\d+$/.test(jobId)) {
    return { status: 'error', error: copy.errors.invalidJobId }
  }

  const dependencies = browserWatchDependencies(ctx.projectId)
  startWatch(
    {
      kind,
      id: jobId,
      label: typeof label === 'string' && label.trim().length > 0 ? label.trim() : defaultLabel(kind, jobId, copy),
      startedAtMs: dependencies.clock.now(),
    },
    ctx,
    dependencies,
  )
  return { status: 'ok', result: { watching: true } }
}

/**
 * 새로 고친 탭에서 이 대화가 지켜보던 job 을 다시 지켜본다. 대화창이 대화를 열 때 한 번 부른다.
 * 이어 지켜보기 시작한 job 의 수를 돌려준다.
 */
export function resumeWatches(ctx: ToolContext): number {
  const dependencies = browserWatchDependencies(ctx.projectId)
  const records: WatchRecord[] = loadWatchRecords(
    dependencies.storage,
    ctx.projectId,
    ctx.conversationId,
    dependencies.clock.now(),
  )
  return records.filter((record) => startWatch(record, ctx, dependencies)).length
}

/** 대화를 지우거나 사용자가 멈췄을 때 이어 지켜볼 기록을 없앤다. */
export function forgetWatches(ctx: Pick<ToolContext, 'projectId' | 'conversationId'>): void {
  clearWatchRecords(browserWatchDependencies(ctx.projectId).storage, ctx.projectId, ctx.conversationId)
}
