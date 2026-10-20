import type {
  AuthoringStage,
  RunChatQuestion,
  RunChatStreamEvent,
  ScenarioChange,
} from '../../testRuns/runChatApi'
import type { TasksCopy } from '../tasksCopy'

/*
 * RunChat 의 stream frame 하나가 `author_scenarios` 에게 무엇을 뜻하는지 가르는 순수 함수.
 * RunChat 화면은 같은 frame 을 말풍선으로 그리고, 여기서는 진행 카드·선택 카드·tool 결과로 바꾼다.
 */

export type FrameOutcome =
  | { kind: 'ignore' }
  | { kind: 'progress'; stage: AuthoringStage; text: string }
  | { kind: 'notice'; message: string }
  | { kind: 'question'; questions: RunChatQuestion[] }
  | { kind: 'result'; summary: string; changes: ScenarioChange[] }
  | { kind: 'failure'; message: string }

/** 단계 이름에 `done/total` 이 붙으면 "묶음 2/5" 처럼 몇 번째인지 함께 보인다. */
export function progressText(
  stage: AuthoringStage,
  done: number | undefined,
  total: number | undefined,
  copy: TasksCopy['jobs'],
): string {
  const label = copy.authoringStages[stage]
  return done !== undefined && total !== undefined && total > 0 ? copy.authoringStep(label, done, total) : label
}

export function interpretFrame(frame: RunChatStreamEvent, copy: TasksCopy): FrameOutcome {
  switch (frame.type) {
    case 'progress':
      return { kind: 'progress', stage: frame.stage, text: progressText(frame.stage, frame.done, frame.total, copy.jobs) }
    case 'notice':
      return frame.message.length > 0 ? { kind: 'notice', message: frame.message } : { kind: 'ignore' }
    case 'question':
      return { kind: 'question', questions: frame.questions ?? [frame.question] }
    case 'result':
      return {
        kind: 'result',
        summary: frame.reply?.result ?? frame.message,
        changes: frame.reply?.changes ?? [],
      }
    case 'error': {
      const detail = [frame.code, frame.detail].filter((part) => part.length > 0).join(': ')
      return { kind: 'failure', message: detail.length > 0 ? `${copy.errors.authoringFailed} (${detail})` : copy.errors.authoringFailed }
    }
    case 'applied':
    case 'draft':
      return { kind: 'ignore' }
  }
}
