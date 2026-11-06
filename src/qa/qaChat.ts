import { answer, type Question } from './evaluation/evaluationApi'
import { sendQaMessage } from './qaApi'
import type { QaLog } from './qaTypes'

export type ChatTurn = {
  id: string
  role: 'USER' | 'AGENT'
  message: string
  pending: boolean
  createdAt: string
  waiting?: boolean
  questionAnswer?: boolean
}

export function chatTurns(logs: QaLog[], questions: Question[], qaTryId: string): ChatTurn[] {
  const turns: ChatTurn[] = logs
    .filter(log => log.qaTryId === qaTryId && log.type === 'CHAT' && log.direction !== 'ORCHE_TO_AGENT')
    .map(log => ({ id: `chat-${log.id}`, role: log.direction === 'USER_TO_ORCHE' ? 'USER' : 'AGENT', message: log.message, pending: false, createdAt: log.createdAt }))
  for (const question of questions.filter(question => question.qaTryId === qaTryId)) {
    turns.push({ id: `question-${question.id}`, role: 'AGENT', message: question.question, pending: false, createdAt: question.createdAt, waiting: question.state === 'WAITING' })
    if (question.answer !== null) turns.push({ id: `answer-${question.id}`, role: 'USER', message: question.answer, pending: false, createdAt: question.answeredAt ?? question.createdAt, questionAnswer: true })
  }
  return turns.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
}

export function waitingQuestion(questions: Question[], qaTryId: string): Question | null {
  return questions.filter(question => question.qaTryId === qaTryId && question.state === 'WAITING')
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0] ?? null
}

export function latestQuestionId(questions: Question[], qaTryId: string): string | null {
  return questions.filter(question => question.qaTryId === qaTryId)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]?.id ?? null
}

export async function sendChatMessage(projectId: string, qaTryId: string, message: string, question: Question | null): Promise<void> {
  if (question !== null) {
    if (question.qaTryId !== qaTryId || question.state !== 'WAITING') throw new Error('Question is not waiting for this QA')
    await answer(projectId, question.id, message)
  } else {
    await sendQaMessage(qaTryId, message)
  }
}
