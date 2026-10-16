import { useState, type KeyboardEvent } from 'react'
import type { RunChatQuestion } from './runChatApi'

/**
 * 저작이 물은 것에 하나씩 답하는 흐름(ARTEL-1118) — CLI 의 선택 프롬프트처럼.
 *
 * 질문이 여럿이면 답 말풍선에 다 펼칠 수 없다. 그래서 입력 칸 바로 위에 **지금 질문 하나**만 세우고,
 * ↑↓ · 숫자로 고르고 Enter 로 정한다. 입력 칸에 글을 쓰고 Enter 하면 그 글이 이 질문의 답이다. 다 답하면
 * 모아서 **평범한 대화 한 줄로** 보낸다 — 저작은 대화를 기억하므로 답을 따로 잇는 장치가 없다.
 */

/** 질문 하나에 대한 답. 보기를 골랐거나, 직접 썼거나, 건너뛰었다. */
export type AskAnswer = { kind: 'option'; text: string } | { kind: 'text'; text: string } | { kind: 'skip' }

/** 고를 수 있는 줄: 질문의 보기들, 그리고 직접 입력 · 건너뛰기. */
export type AskChoice = { kind: 'option'; label: string } | { kind: 'own' } | { kind: 'skip' }

export function choicesOf(question: RunChatQuestion): AskChoice[] {
  return [
    ...question.options.map((option): AskChoice => ({ kind: 'option', label: option.label })),
    ...(question.allowFreeText ? [{ kind: 'own' } as const] : []),
    { kind: 'skip' },
  ]
}

/**
 * 답들을 보낼 한 줄로. 질문이 하나면 답 그대로("2~5단계도 넣어 줘") — 사람이 말하듯. 여럿이면 어느
 * 질문의 답인지 붙인다. 전부 건너뛰었으면 보낼 것이 없다(null).
 */
export function composeAnswers(asks: readonly RunChatQuestion[], answers: readonly AskAnswer[]): string | null {
  const given = asks.flatMap((ask, index) => {
    const answer = answers[index]
    return answer === undefined || answer.kind === 'skip' ? [] : [{ ask, text: answer.text.trim() }]
  }).filter((one) => one.text.length > 0)
  if (given.length === 0) return null
  if (asks.length === 1) return given[0].text
  return given.map((one, index) => `${index + 1}. ${one.ask.text} → ${one.text}`).join('\n')
}

export type AskFlow = {
  /** 지금 묻는 질문. 흐름이 닫혔으면 null. */
  current: RunChatQuestion | null
  step: number
  total: number
  choices: AskChoice[]
  highlight: number
  /** 직접 입력을 골랐다 — 입력 칸의 글이 이 질문의 답이 된다. */
  typing: boolean
  pick: (index: number) => void
  answerText: (text: string) => void
  setHighlight: (index: number) => void
  /** 입력 칸의 키를 먼저 본다. 처리했으면 true — 그때 입력 칸은 아무것도 하지 않는다. */
  onKey: (event: KeyboardEvent<HTMLTextAreaElement>, inputText: string) => boolean
  dismiss: () => void
}

/**
 * @param key 이 질문 묶음을 가리키는 열쇠(답 말풍선 id). 바뀌면 처음부터 다시 묻는다.
 * @param asks 지금 답을 기다리는 질문들. 비었으면 흐름이 없다.
 * @param send 다 답했을 때 보낼 한 줄.
 */
export function useAskFlow(
  key: string | null,
  asks: readonly RunChatQuestion[],
  send: (text: string) => void,
  /**
   * 하나 답할 때마다 바로 보낸다. 오케가 계산으로 낸 질문(경로 공백)이 이 길이다 — 답이 그 자리에 스텝으로
   * 들어가야 해서, 어느 질문 · 어느 보기인지를 그대로 실어 보낸다. 없으면 다 답한 뒤 한 줄로 모아 보낸다.
   */
  answerEach?: (question: RunChatQuestion, answer: AskAnswer, optionId: string | null) => void,
): AskFlow {
  const [state, setState] = useState<{ key: string | null; step: number; answers: AskAnswer[]; highlight: number; typing: boolean; closed: boolean }>({
    key: null, step: 0, answers: [], highlight: 0, typing: false, closed: false,
  })
  // 묶음이 바뀌면(새 답이 왔으면) 처음부터. 렌더 중에 고치지 않고, 열쇠가 다르면 첫 상태로 읽는다.
  const live = state.key === key ? state : { key, step: 0, answers: [], highlight: 0, typing: false, closed: false }
  const open = key !== null && asks.length > 0 && !live.closed && live.step < asks.length
  const current = open ? asks[live.step] : null
  const choices = current === null ? [] : choicesOf(current)

  function advance(answer: AskAnswer, optionId: string | null = null) {
    const answers = [...live.answers]
    answers[live.step] = answer
    const step = live.step + 1
    setState({ ...live, answers, step, highlight: 0, typing: false })
    if (answerEach !== undefined) {
      if (current !== null && answer.kind !== 'skip') answerEach(current, answer, optionId)
      return
    }
    if (step >= asks.length) {
      const message = composeAnswers(asks, answers)
      if (message !== null) send(message)
    }
  }

  function pick(index: number) {
    const choice = choices[index]
    if (choice === undefined) return
    if (choice.kind === 'own') {
      setState({ ...live, highlight: index, typing: true })
      return
    }
    if (choice.kind === 'skip') advance({ kind: 'skip' })
    else advance({ kind: 'option', text: choice.label }, current?.options.find((option) => option.label === choice.label)?.id ?? null)
  }

  function answerText(text: string) {
    if (text.trim().length === 0) return
    advance({ kind: 'text', text })
  }

  const setHighlight = (index: number) => setState({ ...live, highlight: index, typing: false })
  const dismiss = () => setState({ ...live, closed: true })

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>, inputText: string): boolean {
    if (current === null || event.nativeEvent.isComposing) return false
    const empty = inputText.length === 0
    if (event.key === 'Escape') {
      event.preventDefault()
      dismiss()
      return true
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      // 글이 있으면 그 글이 이 질문의 답이다. 없으면 가리키는 보기를 고른다.
      if (!empty) answerText(inputText)
      else pick(live.highlight)
      return true
    }
    if (!empty) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = (live.highlight + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length
      setHighlight(next)
      return true
    }
    if (/^[1-9]$/.test(event.key) && Number(event.key) <= choices.length) {
      event.preventDefault()
      pick(Number(event.key) - 1)
      return true
    }
    return false
  }

  return {
    current,
    step: live.step,
    total: asks.length,
    choices,
    highlight: live.highlight,
    typing: live.typing,
    pick,
    answerText,
    setHighlight,
    onKey,
    dismiss,
  }
}
