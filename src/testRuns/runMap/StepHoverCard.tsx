import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n/useI18n'
import { InlineCode } from '../../contentMap/InlineCode'
import type { MapStep } from './runMapModel'

/** 스텝에 마우스를 올리면 뜨는 카드. 맵에는 점과 번호만 두고, 무엇을 하는 스텝인지는 여기서 읽는다. */
export function StepHoverCard({ step, index, anchor }: { step: MapStep; index: number; anchor: DOMRect }) {
  const { t } = useI18n()
  const m = t.scenarios.map
  const width = 320
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 8)
  const below = anchor.bottom + 8
  const top = below + 170 > window.innerHeight ? Math.max(8, anchor.top - 178) : below
  return createPortal(
    <div className={'rm-hover' + (step.gap ? ' is-gap' : '')} role="tooltip" style={{ left, top, width }}>
      <div className="rm-hover-head">
        <span className="rm-hover-no">{String(index + 1).padStart(2, '0')}</span>
        <b>{m.verbs[step.verb]}</b>
        {step.tc !== null && !step.gap && <span className="rm-hover-tc">{m.tcUnit} {step.tc}</span>}
      </div>
      {!step.gap && step.target.length > 0 && <div className="rm-hover-target">{step.target}</div>}
      <div className="rm-hover-text">{step.action.length > 0 ? <InlineCode className="tct-code" text={step.action} /> : m.untitledStep}</div>
      <div className="rm-hover-scene">{step.gap ? m.gapNote : step.scene ?? m.unknownScene}</div>
    </div>,
    document.body,
  )
}
