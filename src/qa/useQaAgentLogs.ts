import { useEffect, useMemo, useState } from 'react'
import { agentHistoryComplete, AGENT_LOG_TYPES, isAgentLog, isAgentRun } from './agentDockState'
import { listQaLogs } from './qaApi'
import type { QaLog } from './qaTypes'
import { mergeLogs } from './useQaTry'

const PAGE_SIZE = 100
/** `LOG` 의 대부분은 `action_timing` 이라 계획 한 줄까지 수십 쪽을 거슬러야 할 수 있다. 끝없이 받지는 않는다. */
const MAX_PAGES = 60
/** planner–executer 런이면 앞 몇 쪽 안에 `turn` 이나 계획이 있다. 없으면 다른 엔진의 런이라 더 받지 않는다. */
const PAGES_TO_DETECT = 3

/**
 * 에이전트 창이 읽는 로그. 세션 로그는 맨 뒤 50행(대부분 `PULSE`)에서 시작해 지금 계획을 못 볼 수 있어,
 * `LOG`·`STATUS` 만 지금 step 의 앞까지 따로 거슬러 받고 실시간 로그와 합친다.
 */
export function useQaAgentLogs(qaTryId: string, sessionLogs: QaLog[]): QaLog[] {
  const [loaded, setLoaded] = useState<{ tryId: string; logs: QaLog[] }>({ tryId: qaTryId, logs: [] })

  useEffect(() => {
    const controller = new AbortController()
    let cursor: string | undefined
    let history: QaLog[] = []
    const load = async () => {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await listQaLogs(qaTryId, cursor, controller.signal, AGENT_LOG_TYPES, PAGE_SIZE)
        history = mergeLogs(history, result.items.filter(isAgentLog))
        setLoaded({ tryId: qaTryId, logs: history })
        if (!result.hasMore || result.nextBeforeId === null || result.nextBeforeId === cursor) return
        if (agentHistoryComplete(history)) return
        if (page + 1 >= PAGES_TO_DETECT && !isAgentRun(history)) return
        cursor = result.nextBeforeId
      }
    }
    // 창은 보조 화면이다. 못 받으면 실시간 로그만으로 그린다.
    load().catch(() => undefined)
    return () => controller.abort()
  }, [qaTryId])

  const live = useMemo(() => sessionLogs.filter(isAgentLog), [sessionLogs])
  return useMemo(() => mergeLogs(loaded.tryId === qaTryId ? loaded.logs : [], live), [live, loaded, qaTryId])
}
