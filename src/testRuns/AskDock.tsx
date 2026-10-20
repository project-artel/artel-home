import { useI18n } from '../i18n/useI18n'
import { StudioIcon } from '../testScenarios/studioIcons'
import type { AskFlow } from './askFlow'
import { parseInline } from './chatMarkdown'
import { InlineRun } from './ChatMessageBody'

/**
 * 입력 칸 바로 위의 질문 하나(ARTEL-1118). CLI 의 선택 프롬프트처럼 — 몇 번째인지, 질문, 이유, 번호 붙은
 * 보기. 키는 입력 칸이 받아 [AskFlow.onKey] 로 넘긴다. 마우스로 눌러도 같다.
 */
export function AskDock({ flow }: { flow: AskFlow }) {
  const { t } = useI18n()
  const c = t.scenarios.chat
  const question = flow.current
  if (question === null) return null
  return (
    <section aria-label={c.asksLabel} className="ask-dock" role="group">
      <header className="ask-dock-head">
        <StudioIcon className="ask-dock-icon" name="bulb" size={15} />
        <span className="ask-dock-step">{c.askStep(flow.step + 1, flow.total)}</span>
        <span className="ask-dock-spacer" />
        <button aria-label={c.askClose} className="ask-dock-close" onClick={flow.dismiss} title={c.askClose} type="button">
          <StudioIcon name="close" size={13} />
        </button>
      </header>
      <p className="ask-dock-text"><InlineRun parts={parseInline(question.text)} /></p>
      {question.why !== null && <p className="ask-dock-why"><InlineRun parts={parseInline(question.why)} /></p>}
      <ol className="ask-dock-choices" role="listbox" aria-label={question.text}>
        {flow.choices.map((choice, index) => (
          <li key={index}>
            <button
              aria-selected={index === flow.highlight}
              className={`ask-dock-choice${index === flow.highlight ? ' is-on' : ''}${choice.kind !== 'option' ? ' is-meta' : ''}`}
              onClick={() => flow.pick(index)}
              onMouseEnter={() => flow.setHighlight(index)}
              role="option"
              type="button"
            >
              <span className="ask-dock-key">{index + 1}</span>
              <span className="ask-dock-label">
                {choice.kind === 'option' ? choice.label : choice.kind === 'own' ? c.askOwn : c.askSkip}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="ask-dock-hint">{flow.typing ? c.askTypingHint : c.askHint}</p>
    </section>
  )
}
