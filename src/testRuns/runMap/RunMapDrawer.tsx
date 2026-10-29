import { useEffect, useRef, useState } from 'react'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import { InlineCode } from '../../contentMap/InlineCode'
import type { MapScenario } from './runMapModel'
import { stepBlocks } from './stepOrder'

const pad = (n: number) => String(n).padStart(2, '0')

/** 끄는 중인 스텝 범위. */
type Drag = { start: number; end: number }

/**
 * 고른 TS 의 스텝 전부를 씬 구간별로 보이는 서랍. 이전 · 다음 TS, 스텝 넣기, TC 가져오기, 편집 열기.
 *
 * 스텝은 칸 하나씩, 같은 TC 의 연속 스텝은 묶음 하나로 감싼다. 스텝은 왼쪽 손잡이로, TC 묶음은 머리줄 손잡이로
 * 끌어 순서를 바꾼다. 놓을 자리는 칸의 위 · 아래 절반으로 정한다.
 */
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
  onMoveSteps,
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
  /** [start]..[end] 스텝을 [before] 순번 앞으로 옮긴다. */
  onMoveSteps: (start: number, end: number, before: number) => void
}) {
  const { t } = useI18n()
  const m = t.scenarios.map
  // 스크롤은 ref 로 움직이고, 서비스 스크롤 막대는 노드가 생기면 다시 재도록 state 로도 쥔다.
  const listRef = useRef<HTMLOListElement | null>(null)
  const [list, setList] = useState<HTMLOListElement | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [dropBefore, setDropBefore] = useState<number | null>(null)

  // scrollIntoView 는 overflow 가 hidden 인 캔버스까지 밀어 버린다. 서랍 목록 안에서만 움직인다.
  // 칸이 position:relative 라 offsetTop 은 칸 기준이다. 화면 좌표의 차이로 옮긴다.
  useEffect(() => {
    const box = listRef.current
    const row = box?.querySelector<HTMLElement>('.rmd-step.is-picked')
    if (!box || !row) return
    box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight / 3
  }, [pickedStep, scenario.id])

  const startDrag = (start: number, end: number) => (event: React.DragEvent) => {
    setDrag({ start, end })
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${start}-${end}`)
  }
  /** 칸의 위 절반이면 [first] 앞, 아래 절반이면 [last] 뒤. */
  const overRow = (first: number, last: number) => (event: React.DragEvent) => {
    if (drag === null) return
    event.preventDefault()
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2 ? first : last + 1
    if (before !== dropBefore) setDropBefore(before)
  }
  const drop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (drag !== null && dropBefore !== null) onMoveSteps(drag.start, drag.end, dropBefore)
    setDrag(null)
    setDropBefore(null)
  }
  const endDrag = () => {
    setDrag(null)
    setDropBefore(null)
  }
  const dragging = (index: number) => drag !== null && index >= drag.start && index <= drag.end
  const mark = (first: number, last: number) =>
    dropBefore === first ? ' is-drop-before' : dropBefore === last + 1 ? ' is-drop-after' : ''

  /** [tcBadge] 는 스텝 하나짜리 TC 의 번호. 묶음 머리줄 없이 칸 오른쪽에 붙인다. */
  const stepRow = (index: number, inTc: boolean, tcBadge: number | null = null) => {
    const step = scenario.steps[index]
    return (
      <li
        className={'rmd-row' + (dragging(index) ? ' is-dragging' : '') + (inTc ? ' is-in-tc' : '') + mark(index, index)}
        key={index}
        onDragOver={overRow(index, index)}
        onDrop={drop}
      >
        <span
          aria-label={m.drawer.dragStep(index + 1)}
          className="rmd-handle"
          draggable
          onDragEnd={endDrag}
          onDragStart={startDrag(index, index)}
          title={m.drawer.dragStep(index + 1)}
        >
          ⋮⋮
        </span>
        <button
          className={'rmd-step' + (step.gap ? ' is-gap' : '') + (pickedStep === index ? ' is-picked' : '')}
          onClick={() => onPickStep(index)}
          type="button"
        >
          <span className="rmd-no">{step.gap ? '!' : pad(index + 1)}</span>
          <span className="rmd-text">{step.action.length > 0 ? <InlineCode className="tct-code" text={step.action} /> : m.untitledStep}</span>
          {step.gap ? <span className="rmd-gap-tag">GAP</span> : tcBadge !== null ? <span className="rmd-tc">{m.tcUnit} {tcBadge}</span> : <span />}
        </button>
      </li>
    )
  }

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
          <button className="button button--secondary button--compact" onClick={onAddStep} type="button">
            {pickedStep === null ? m.drawer.addStepEnd : m.drawer.addStepAfter(pickedStep + 1)}
          </button>
          <button className="button button--secondary button--compact" onClick={onImportTcs} type="button">{m.drawer.importTcs}</button>
          <span className="rmd-spacer" />
          <button className="button button--primary button--compact" data-open-editor={scenario.id} onClick={onOpenEditor} type="button">{m.openHint}</button>
        </div>
        <p className="rmd-hint">{m.drawer.dragHint}</p>
      </div>
      <div className="rmd-listwrap">
        <ol
          className="rmd-steps"
          ref={(node) => {
            listRef.current = node
            setList(node)
          }}
        >
          {scenario.segments.map((segment, order) => (
            <li className="rmd-segment" key={order}>
              <span className="rmd-scene">
                <b>{segment.scene ?? m.unknownScene}</b>
                <span>{m.drawer.segmentSteps(segment.to - segment.from + 1)}</span>
              </span>
              <ol className="rmd-blocks">
                {stepBlocks(scenario.steps, segment.from, segment.to).map((block) => {
                  if (block.kind === 'step') return stepRow(block.index, false)
                  const size = block.end - block.start + 1
                  if (size === 1) return stepRow(block.start, false, block.tc)
                  return (
                    <li
                      className={'rmd-tcblock' + (dragging(block.start) ? ' is-dragging' : '') + mark(block.start, block.end)}
                      key={`tc${block.start}`}
                      onDragOver={overRow(block.start, block.end)}
                      onDrop={drop}
                    >
                      <div className="rmd-tchead">
                        <span
                          aria-label={m.drawer.dragTc(block.tc)}
                          className="rmd-handle"
                          draggable
                          onDragEnd={endDrag}
                          onDragStart={startDrag(block.start, block.end)}
                          title={m.drawer.dragTc(block.tc)}
                        >
                          ⋮⋮
                        </span>
                        <span className="rmd-tc">{m.tcUnit} {block.tc}</span>
                        <span className="rmd-tcsize">{m.drawer.tcSteps(size)}</span>
                      </div>
                      <ol>{Array.from({ length: size }, (_, offset) => stepRow(block.start + offset, true))}</ol>
                    </li>
                  )
                })}
              </ol>
            </li>
          ))}
        </ol>
        <EdgeScrollbar label={scenario.title} scroller={list} side="right" />
      </div>
    </aside>
  )
}
