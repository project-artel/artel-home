import { memo } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { DOT_R, FRAME_W, frameHeight, segmentBands, stepPoint, STEP_W, wirePath } from './frameGeometry'
import type { MapScenario } from './runMapModel'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * TS 하나 = 프레임 하나(ARTEL-1245). 머리줄은 끄는 손잡이이고, 몸통은 씬 구간(이름 + 번갈아 명암) 위에 스텝 점을
 * 화살표로 잇는다. 씬은 색으로 가르지 않는다. 씬이 수십 개여도 색 범례 없이 읽혀야 한다.
 */
export const TsFrame = memo(function TsFrame({
  scenario,
  position,
  x,
  y,
  z,
  folded,
  picked,
  pickedStep,
  dimmed,
  highlightScene,
  marked,
  renaming,
  onRename,
  dropped = null,
  lifting = false,
}: {
  scenario: MapScenario
  /** 런 안의 순서(1부터). */
  position: number
  x: number
  y: number
  z: number
  folded: boolean
  picked: boolean
  pickedStep: number | null
  dimmed: boolean
  highlightScene: string | null
  /** 영역 끌기로 여럿 고른 것에 들었다. */
  marked: boolean
  /** 이름을 고치는 중. 이름을 누르면 켜진다. */
  renaming: boolean
  /** 고친 이름. 그만두면 null. */
  onRename: (scenarioId: string, title: string | null) => void
  /** 방금 내려놓은 스텝 범위. 내려앉는 애니메이션을 한 번 탄다. */
  dropped?: { from: number; to: number } | null
  /** 이 프레임의 스텝을 끄는 중. 점이 새 자리로 미끄러지게 transition 을 켠다. */
  lifting?: boolean
}) {
  const { t } = useI18n()
  const m = t.scenarios.map
  const height = frameHeight(scenario.steps.length, folded)
  const title = scenario.title.length > 0 ? scenario.title : m.untitledScenario

  return (
    <div
      className={'rmf' + (picked ? ' is-picked' : '') + (marked ? ' is-marked' : '') + (dimmed ? ' is-dim' : '') + (lifting ? ' is-sorting' : '')}
      data-scenario-id={scenario.id}
      style={{ left: x, top: y, width: FRAME_W, height, zIndex: z }}
    >
      <div className="rmf-head" data-drag-frame={scenario.id}>
        <span className="rmf-no">{pad(position)}</span>
        {renaming ? (
          <input
            aria-label={m.frame.rename}
            autoFocus
            className="rmf-title-input"
            defaultValue={scenario.title}
            onBlur={(event) => onRename(scenario.id, event.currentTarget.value.trim())}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') onRename(scenario.id, null)
              event.stopPropagation()
            }}
          />
        ) : (
          <b className="rmf-title" data-rename={scenario.id} title={m.frame.rename}>{title}</b>
        )}
        <span className="rmf-meta">
          {m.frame.steps(scenario.steps.length)}
          {scenario.gapCount > 0 && <span className="rmf-gap"> · {m.frame.gaps(scenario.gapCount)}</span>}
        </span>
        <button className="rmf-btn rmf-edit" data-add-step={scenario.id} type="button">{m.frame.addStep}</button>
        <button className="rmf-btn rmf-edit" data-import-tcs={scenario.id} type="button">{m.frame.importTcs}</button>
        <button className="rmf-btn rmf-open" data-open-editor={scenario.id} type="button">{m.openHint}</button>
        <button aria-label={folded ? m.frame.unfold : m.frame.fold} className="rmf-btn" data-fold={scenario.id} type="button">
          {folded ? '▸' : '▾'}
        </button>
      </div>
      <div className="rmf-body">
        {folded ? (
          <div className="rmf-summary" aria-hidden="true">
            {scenario.steps.map((step, index) => {
              const segment = scenario.segments.findIndex((s) => index >= s.from && index <= s.to)
              return <i className={(step.gap ? 'is-gap' : '') + (segment % 2 === 1 ? ' is-shade' : '')} key={index} />
            })}
          </div>
        ) : scenario.steps.length === 0 ? (
          <p className="rmf-empty">{m.noSteps}</p>
        ) : (
          <>
            {segmentBands(scenario.segments).map((band, index) => {
              const lit = highlightScene !== null && band.scene === highlightScene
              return (
                <div key={index}>
                  <div
                    className={'rmf-band' + (band.scene === null ? ' is-unknown' : band.shade ? ' is-shade' : '') + (lit ? ' is-lit' : '')}
                    style={{ left: band.left, top: band.top, width: band.width }}
                  />
                  <span
                    className={'rmf-band-name' + (lit ? ' is-lit' : '')}
                    data-scene={band.scene ?? ''}
                    style={{ left: band.left + 4, top: band.top - 17, maxWidth: Math.max(44, band.width - 4) }}
                    title={`${band.scene ?? m.unknownScene} · ${band.count}`}
                  >
                    {band.first ? `${band.scene ?? m.unknownScene} · ${band.count}` : `↳ ${band.scene ?? m.unknownScene}`}
                  </span>
                </div>
              )
            })}
            <svg aria-hidden="true" className="rmf-wires" height={height} width={FRAME_W}>
              <defs>
                <marker id={`rm-ah-${scenario.id}`} markerHeight="7" markerWidth="7" orient="auto" refX="7" refY="4" viewBox="0 0 8 8">
                  <path className="rmf-arrowhead" d="M0 0 L8 4 L0 8 z" />
                </marker>
              </defs>
              {scenario.steps.map((_, index) =>
                index === 0 ? null : <path className="rmf-wire" d={wirePath(index)} key={index} markerEnd={`url(#rm-ah-${scenario.id})`} />,
              )}
            </svg>
            {scenario.steps.map((step, index) => {
              const point = stepPoint(index)
              return (
                <button
                  aria-label={`${pad(index + 1)} ${m.verbs[step.verb]} ${step.target}`}
                  className={
                    'rmf-step' +
                    (step.gap ? ' is-gap' : step.scene === null ? ' is-unknown' : '') +
                    (step.tc !== null && !step.gap ? ' is-tc' : '') +
                    (picked && pickedStep === index ? ' is-picked' : '') +
                    (step.slot ? ' is-slot' : '') +
                    (dropped !== null && index >= dropped.from && index <= dropped.to ? ' is-dropped' : '')
                  }
                  data-step={step.slot ? undefined : `${scenario.id}|${index}`}
                  key={step.key}
                  style={{ left: point.x - STEP_W / 2, top: point.y - DOT_R }}
                  type="button"
                >
                  <span className="rmf-dot" />
                  <span className="rmf-num">{pad(index + 1)}</span>
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
})
