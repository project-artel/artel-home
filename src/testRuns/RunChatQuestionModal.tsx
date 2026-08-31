import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { getTestScenario } from '../testScenarios/scenarioApi'
import { getRunScenarios } from './testRunApi'
import { RunChatQuestionBlock } from './RunChatQuestion'
import type { RunChatAnswer, RunChatQuestion } from './runChatApi'
import type { ScenarioStep } from '../testScenarios/scenarioTypes'

/**
 * Everything authoring could not settle, in the middle of the screen — with the
 * place each answer lands (ARTEL-677).
 *
 * These questions used to sit inside the chat thread, in a 300px column, under
 * whatever else the turn had said. Six of them turned the panel into a wall of text,
 * and none of them said *where* the answer goes — the user is asked "how do you get
 * past StagePosition" with no way to see that it is step 6 of one scenario, between
 * "click continue on the title" and "press any key in the story".
 *
 * So: one dialog, one question at a time, and above each one the slot it fills with
 * the step before and the step after. The answer is the same one the chat sent; only
 * the place it is asked changed.
 */
type Slot = {
  scenarioTitle: string
  position: number
  before: string | null
  after: string | null
}

export function RunChatQuestionModal({
  projectId,
  runId,
  questions,
  disabled,
  onAnswer,
  onClose,
}: {
  projectId: string
  runId: string
  questions: RunChatQuestion[]
  disabled: boolean
  onAnswer: (answer: RunChatAnswer) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const q = t.scenarios.chat.question
  const [at, setAt] = useState(0)
  const [slots, setSlots] = useState<Record<string, Slot>>({})
  // 답한 것은 지도에 표시로 남는다 — 몇 개 남았는지 세지 않아도 보이게.
  const [answered, setAnswered] = useState<string[]>([])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // **어느 칸에 들어가는지 찾아 온다.** 질문 id 에 막은 것의 이름이 들어 있고(`gap:StagePosition`),
  // 그 이름은 시나리오의 미상 스텝에 `step_unknown_reason` 으로 같이 적혀 있다. 그래서 자리를
  // 짚는 것은 계산이지 추측이 아니다 — 편집 화면이 이미 같은 열쇠로 그 자리를 표시한다.
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const items = await getRunScenarios(projectId, runId)
        const found: Record<string, Slot> = {}
        for (const item of items) {
          const scenario = await getTestScenario(Number(item.testScenarioId))
          if (!alive) return
          const steps: ScenarioStep[] = scenario.payload.steps
          steps.forEach((step, index) => {
            const reason = step.step_unknown_reason
            if (reason === null || reason.length === 0) return
            const id = `gap:${reason}`
            if (id in found) return
            found[id] = {
              scenarioTitle: scenario.payload.title,
              position: index + 1,
              before: steps[index - 1]?.action ?? null,
              after: steps[index + 1]?.action ?? null,
            }
          })
        }
        if (alive) setSlots(found)
      } catch {
        // 자리를 못 찾아도 묻는 일은 그대로 한다 — 미리보기는 거들 뿐이다.
      }
    }
    void load()
    return () => { alive = false }
  }, [projectId, runId, questions])

  const current = questions[Math.min(at, questions.length - 1)]
  const slot = useMemo(() => (current === undefined ? undefined : slots[current.id]), [slots, current])

  if (current === undefined) return null

  return (
    <div className="tc-modal-scrim" onClick={(ev) => { if (ev.target === ev.currentTarget) onClose() }}>
      {/* **넘기는 것은 모달 밖 양옆이다.** 안에 두면 답하는 단추들과 섞여, 무엇이 답이고
          무엇이 이동인지 헷갈린다. */}
      {questions.length > 1 && (
        <button
          className="askmodal-arrow askmodal-arrow--prev"
          type="button"
          aria-label={q.modalPrev}
          disabled={at === 0}
          onClick={(ev) => { ev.stopPropagation(); setAt(at - 1) }}
        >
          ‹
        </button>
      )}

      <div className="tc-modal askmodal" role="dialog" aria-modal="true" aria-labelledby="askmodal-title">
        <div className="tc-modal-head">
          <h3 id="askmodal-title" className="tc-modal-title">{q.modalTitle}</h3>
          <button className="tc-modal-close" aria-label={q.modalClose} onClick={onClose} type="button">✕</button>
        </div>

        <div className="tc-modal-body">
          {/* **어디쯤인지 보이는 지도.** 여섯을 묻는데 하나씩만 보이면, 남은 것을 세는 일이
              사용자 몫이 된다. 답한 것은 채워진 점으로 남는다. */}
          {questions.length > 1 && (
            <div className="askmodal-map">
              <ol className="askmodal-dots">
                {questions.map((question, index) => (
                  <li key={question.id}>
                    <button
                      className={
                        'askmodal-dot' +
                        (index === at ? ' askmodal-dot--here' : '') +
                        (answered.includes(question.id) ? ' askmodal-dot--done' : '')
                      }
                      type="button"
                      aria-label={String(index + 1)}
                      aria-current={index === at}
                      onClick={() => setAt(index)}
                    />
                  </li>
                ))}
              </ol>
              <span className="askmodal-count">
                {q.modalProgress.replace('{at}', String(at + 1)).replace('{total}', String(questions.length))}
              </span>
            </div>
          )}

          <p className="askmodal-question">{current.text}</p>
          {current.why !== null && <p className="askmodal-why">{current.why}</p>}

          {/* **어디에 들어가는지 먼저 보인다.** 자리를 모르면 무엇을 답해야 할지도 모른다. */}
          {slot === undefined ? (
            <p className="askmodal-slot askmodal-slot--unknown">{q.modalSlotUnknown}</p>
          ) : (
            <div className="askmodal-slot">
              <p className="askmodal-slot-where">
                {q.modalSlotWhere
                  .replace('{scenario}', slot.scenarioTitle)
                  .replace('{position}', String(slot.position))}
              </p>
              <ol className="askmodal-preview">
                {slot.before !== null && (
                  <li className="askmodal-preview-step">
                    <span className="askmodal-preview-no mono">{slot.position - 1}</span>
                    <span className="askmodal-preview-text">{slot.before}</span>
                  </li>
                )}
                <li className="askmodal-preview-step askmodal-preview-step--here">
                  <span className="askmodal-preview-no mono">{slot.position}</span>
                  <span className="askmodal-preview-text">{q.modalSlotHere}</span>
                </li>
                {slot.after !== null && (
                  <li className="askmodal-preview-step">
                    <span className="askmodal-preview-no mono">{slot.position + 1}</span>
                    <span className="askmodal-preview-text">{slot.after}</span>
                  </li>
                )}
              </ol>
            </div>
          )}

          <RunChatQuestionBlock
            question={current}
            disabled={disabled}
            onAnswer={(answer) => {
              onAnswer(answer)
              setAnswered([...answered, current.id])
              // 답하면 다음 것으로 넘어간다. 아직 안 답한 것이 없으면 닫는다.
              const next = questions.findIndex(
                (question, index) =>
                  index !== at && question.id !== current.id && !answered.includes(question.id),
              )
              if (next === -1) onClose()
              else setAt(next)
            }}
          />
        </div>

      </div>

      {questions.length > 1 && (
        <button
          className="askmodal-arrow askmodal-arrow--next"
          type="button"
          aria-label={q.modalNext}
          disabled={at + 1 >= questions.length}
          onClick={(ev) => { ev.stopPropagation(); setAt(at + 1) }}
        >
          ›
        </button>
      )}
    </div>
  )
}
