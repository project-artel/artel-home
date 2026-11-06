import { cancelRunChat, parseRunStreamEvent, runChatStreamUrl, sendRunChatMessage } from '../../../testRuns/runChatApi'
import { driveAuthoring, type AuthoringDependencies, type AuthoringStream } from '../../jobs/authoringSession'
import { browserClock } from '../../jobs/browserSources'
import { tasksCopy } from '../../tasksCopy'
import type { ToolHandler } from '../toolTypes'

/** 연결이 열리기를 기다리는 최대 시간. 넘기면 열리지 않았어도 지시를 보낸다(EventSource 가 알아서 다시 붙는다). */
const STREAM_OPEN_WAIT_MS = 3000

const FRAME_NAMES = ['result', 'progress', 'notice', 'question', 'applied', 'draft', 'error'] as const

function openRunChatStream(projectId: string, runId: string, onFrame: Parameters<AuthoringDependencies['openStream']>[0]): AuthoringStream {
  const source = new EventSource(runChatStreamUrl(projectId, runId), { withCredentials: true })
  const opened = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, STREAM_OPEN_WAIT_MS)
    source.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  for (const name of FRAME_NAMES) {
    source.addEventListener(name, (event: Event) => {
      // 'error' 는 전송 오류에도 같은 이름으로 온다. data 가 있는 것만 서버가 보낸 frame 이다.
      if (!(event instanceof MessageEvent)) return
      const frame = parseRunStreamEvent(event.data)
      if (frame !== null) onFrame(frame)
    })
  }
  return { opened, close: () => source.close() }
}

/**
 * `author_scenarios`. 시나리오 작성 agent(RunChat)에게 지시를 보내고 결과가 올 때까지 기다린다.
 * 저장은 `autoApply: true` 로 서버가 직접 한다. 질문은 대화창의 선택 카드로 올리고 답을 RunChat 에 돌려준다.
 */
export const authorScenarios: ToolHandler = async (args, ctx) => {
  const copy = tasksCopy()
  const rawRunId = args.run_id
  const runId = typeof rawRunId === 'number' ? String(rawRunId) : typeof rawRunId === 'string' ? rawRunId.trim() : ''
  if (!/^\d+$/.test(runId)) return { status: 'error', error: copy.errors.authoringRunMissing }
  const instruction = typeof args.instruction === 'string' ? args.instruction.trim() : ''
  if (instruction.length === 0) return { status: 'error', error: copy.errors.authoringInstructionMissing }

  return driveAuthoring(
    {
      openStream: (onFrame) => openRunChatStream(ctx.projectId, runId, onFrame),
      send: (message, answer) => sendRunChatMessage(ctx.projectId, runId, message, true, answer),
      cancel: () => cancelRunChat(ctx.projectId, runId),
      askChoice: (question, options) => ctx.askChoice(question, options),
      upsertJob: ctx.upsertJob,
      clock: browserClock,
      copy: tasksCopy,
    },
    { runId, instruction, signal: ctx.signal },
  )
}
