import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { InlineCode } from '../../contentMap/InlineCode'
import type { MapScenario } from './runMapModel'

const pad = (n: number) => String(n).padStart(2, '0')

/** 고른 TS 의 스텝 전부를 씬 구간별로 보이는 서랍. 이전 · 다음 TS, 스텝 넣기, TC 가져오기, 편집 열기. */
export function RunMapDrawer({
  scenario,
  position,
  total,
  pickedStep,
  onClose,
  onPrev,
  onNext,
  onPickStep,
  onAddStep,
  onImportTcs,
  onOpenEditor,
}: {
  scenario: MapScenario
  position: number
  total: number
  pickedStep: number | null
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onPickStep: (index: number) => void
  onAddStep: () => void
  onImportTcs: () => void
  onOpenEditor: () => void
}) {
  const { t } = useI18n()
  const m = t.scenarios.map
  const listRef = useRef<HTMLOListElement | null>(null)

  // scrollIntoView 는 overflow 가 hidden 인 캔버스까지 밀어 버린다. 서랍 목록 안에서만 움직인다.
  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>('.rmd-step.is-picked')
    if (list && row) list.scrollTop = row.offsetTop - list.offsetTop - list.clientHeight / 3
  }, [pickedStep, scenario.id])

  return (
    <aside aria-label={scenario.title} className="rm-drawer">
      <div className="rmd-head">
        <div className="rmd-top">
          <div>
            <div className="rmd-pos">{m.drawer.position(position, total)}</div>
            <h2>{scenario.title.length > 0 ? scenario.title : m.untitledScenario}</h2>
          </div>
          <button aria-label={m.drawer.close} className="rmd-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="rmd-meta">
          {m.drawer.summary(scenario.steps.length, scenario.tcCount, scenario.segments.length)}
          {scenario.gapCount > 0 && <span className="rmd-gap"> · GAP {scenario.gapCount}</span>}
        </div>
        <div className="rmd-actions">
          <button className="button button--secondary button--compact" disabled={position === 1} onClick={onPrev} type="button">{m.drawer.prev}</button>
          <button className="button button--secondary button--compact" disabled={position === total} onClick={onNext} type="button">{m.drawer.next}</button>
          <span className="rmd-spacer" />
          <button className="button button--primary button--compact" data-open-editor={scenario.id} onClick={onOpenEditor} type="button">{m.openHint}</button>
        </div>
        <div className="rmd-actions">
          <button className="button button--secondary button--compact" onClick={onAddStep} type="button">
            {pickedStep === null ? m.drawer.addStepEnd : m.drawer.addStepAfter(pickedStep + 1)}
          </button>
          <button className="button button--secondary button--compact" onClick={onImportTcs} type="button">{m.drawer.importTcs}</button>
        </div>
      </div>
      <ol className="rmd-steps" ref={listRef}>
        {scenario.segments.map((segment, order) => (
          <li className="rmd-segment" key={order}>
            <span className="rmd-scene">{segment.scene ?? m.unknownScene} · {segment.to - segment.from + 1}</span>
            <ol>
              {scenario.steps.slice(segment.from, segment.to + 1).map((step, offset) => {
                const index = segment.from + offset
                return (
                  <li key={index}>
                    <button
                      className={'rmd-step' + (step.gap ? ' is-gap' : '') + (pickedStep === index ? ' is-picked' : '') + (step.tcStart && index > 0 ? ' is-tc-start' : '')}
                      onClick={() => onPickStep(index)}
                      type="button"
                    >
                      <span className="rmd-no">{step.gap ? '!' : pad(index + 1)}</span>
                      <span className="rmd-text">{step.action.length > 0 ? <InlineCode className="tct-code" text={step.action} /> : m.untitledStep}</span>
                      {step.tc !== null && !step.gap ? <span className="rmd-tc">{m.tcUnit} {step.tc}</span> : <span />}
                    </button>
                  </li>
                )
              })}
            </ol>
          </li>
        ))}
      </ol>
    </aside>
  )
}
