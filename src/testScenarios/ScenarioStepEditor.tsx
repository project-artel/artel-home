import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { SplitHandle } from '../design-system/primitives/SplitHandle'
import { useI18n } from '../i18n/useI18n'
import type { StepMark } from './draftChanges'
import { TestCaseModal } from '../testCases/TestCaseModal'
import { listTestCases } from '../testCases/testCaseApi'
import type { TestCase, VerificationStatus } from '../testCases/testCaseTypes'
import { GapFillModal } from './GapFillModal'
import { groupStepsByCase, isGapStep, type ScenarioStep } from './scenarioTypes'
import { StudioIcon } from './studioIcons'
import { StepsSketch } from './studioSketches'
import type { StepEditor } from './useStepEditor'

/** 이보다 단계가 많으면 바닥에 구간 점프를 단다. */
const JUMP_SIZE = 20

/** 판정의 순서. 범례도 이 순서로 선다. */
const VERDICTS: readonly VerificationStatus[] = ['VERIFIED', 'DRAFT', 'REGRESSION', 'FAILED', 'BROKEN']

const DETAIL_HEIGHT_KEY = 'artel.studio.stepDetailHeight'
const DETAIL_HEIGHT_DEFAULT = 300
const DETAIL_HEIGHT_MIN = 180
const DETAIL_HEIGHT_MAX = 640

/** 글 속의 씬 이름을 찾는 식. 프로젝트 TC 의 씬에서 만든다 — 없으면 아무것도 칠하지 않는다. */
const SceneContext = createContext<RegExp | null>(null)

/**
 * Editable steps of a scenario (ARTEL-289, 배치는 ARTEL-1107).
 *
 * **목록은 훑고, 고른 단계는 깊게 읽는다.** 단계마다 입력 테두리 · 힌트 · 이동 · 삭제를 늘어놓으면
 * 단계가 수십 개가 될 때 정작 순서와 내용이 묻힌다. 그래서 목록은 한 줄(순서 · 실행할 내용 · 연결 TC ·
 * 씬 · TC 판정)로 두고, 고친 것은 고른 단계의 아래 칸에서 한다 — 상세가 열려도 목록의 행 높이는
 * 그대로다.
 *
 * 하는 일은 예전 그대로다: 제목 · 내용 · 힌트를 고치고, 단계를 원하는 자리에 넣고 지우고, 위아래로
 * 옮기거나 끌어 옮긴다. 여러 단계를 골라 한 번에 지운다. TC 는 내부 id 대신 등장 순번으로 부르고 그
 * 자리에서 명세를 연다. 경로 공백은 번호 없이 서고 그 자리를 채우는 단계를 받는다(`GapFillModal`).
 * 사람이 쓴 단계는 표시한다. draft 는 바뀐 줄을 칠한다.
 *
 * This is a controlled view: undo/redo, autosave state, and the ⌘K TC spec live
 * on the studio header ({@link TestScenarioPage}), because they are run-scoped.
 */
export function ScenarioStepEditor({
  projectId,
  editor,
  banner,
  stepMarks,
}: {
  projectId: string
  editor: StepEditor
  /** Drawn above the title — the studio says here that what is open is a draft (ARTEL-1075). */
  banner?: ReactNode
  /** One per step: a draft paints what changed yellow and what is new green (ARTEL-1075). */
  stepMarks?: readonly StepMark[]
}) {
  const { t } = useI18n()
  const e = t.scenarios.stepsEditor
  const b = e.board
  const statusLabel = t.scenarios.composition.status
  const { working } = editor
  const steps = working.steps
  const cases = useCaseIndex(projectId)
  const sceneMatcher = useMemo(() => scenePattern(cases), [cases])
  const [detailHeight, setDetailHeight] = useDetailHeight()

  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const [fresh, setFresh] = useState<number | null>(null)
  const [dropped, setDropped] = useState<number | null>(null)
  const [tcView, setTcView] = useState<{ caseId: number; label: string } | null>(null)
  const [gapFill, setGapFill] = useState<{ index: number; blockedBy: string | null; detail: string } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const [titleField, setTitleField] = useState<HTMLInputElement | null>(null)
  const rowRefs = useRef(new Map<number, HTMLDivElement>())

  // 고른 자리가 목록 밖으로 밀리면(단계를 지우거나 다른 시나리오로 바뀌면) 놓는다.
  const current = selected !== null && selected < steps.length ? selected : null
  const pickedNow = [...picked].filter((index) => index < steps.length)

  // 순번: 경로 공백은 번호가 없고, 이어지는 같은 case_id 는 한 TC 다(내부 id 는 보이지 않는다).
  const numbering = useMemo(() => {
    const actionNo: (number | null)[] = []
    let next = 0
    for (const step of steps) actionNo.push(isGapStep(step) ? null : ++next)
    const tcNo = new Map<number, number>()
    let tcSeq = 0
    for (const group of groupStepsByCase(steps)) {
      if (group.caseId === null) continue
      tcSeq += 1
      for (const index of group.indices) tcNo.set(index, tcSeq)
    }
    return { actionNo, tcNo, actions: next, regions: tcSeq }
  }, [steps])

  const needle = query.trim().toLowerCase()
  const matches = useMemo(
    () => (needle === '' ? [] : steps.flatMap((step, index) => (stepText(step, cases).includes(needle) ? [index] : []))),
    [steps, cases, needle],
  )
  const gaps = steps.flatMap((step, index) => (isGapStep(step) ? [index] : []))

  useEffect(() => {
    if (current === null) return
    rowRefs.current.get(current)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  function select(index: number, openDetail = true) {
    setSelected(index)
    if (openDetail) setDetail(true)
  }

  function cycle(list: readonly number[]) {
    if (list.length === 0) return
    const after = list.find((index) => current === null || index > current)
    select(after ?? list[0], detail)
  }

  /** 자리가 바뀌면 고른 묶음의 번호가 다른 단계를 가리키게 된다 — 그래서 놓는다. */
  function clearPicked() {
    setPicked(new Set())
    setAnchor(null)
  }

  function insertAt(index: number) {
    editor.insertStep(index)
    clearPicked()
    setFresh(index)
    select(index)
  }

  function removeStep(index: number) {
    editor.removeStep(index)
    clearPicked()
    setSelected(steps.length <= 1 ? null : Math.min(index, steps.length - 2))
  }

  function removePicked() {
    // 뒤에서부터 지운다 — 앞을 먼저 지우면 뒤 번호가 한 칸씩 당겨져 엉뚱한 단계가 지워진다.
    for (const index of [...pickedNow].sort((left, right) => right - left)) editor.removeStep(index)
    const left = steps.length - pickedNow.length
    clearPicked()
    setSelected(left <= 0 || current === null ? null : Math.min(current, left - 1))
    if (left <= 0) setDetail(false)
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return
    editor.moveStep(from, to)
    clearPicked()
    setSelected(to)
    setDropped(to)
  }

  function onDragStart(event: DragEvent<HTMLLIElement>, index: number) {
    event.dataTransfer.effectAllowed = 'move'
    // Firefox 는 실린 값이 없으면 끌기를 시작하지 않는다.
    event.dataTransfer.setData('text/plain', String(index))
    event.dataTransfer.setDragImage(event.currentTarget, 28, 22)
    setDragIndex(index)
  }

  function endDrag() {
    setDragIndex(null)
    setOverIndex(null)
  }

  function onDrop(target: number) {
    if (dragIndex !== null && dragIndex !== target) moveStep(dragIndex, target)
    endDrag()
  }

  function pick(index: number, range: boolean) {
    setPicked((before) => {
      const next = new Set([...before].filter((value) => value < steps.length))
      if (range && anchor !== null) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor]
        for (let value = from; value <= to; value += 1) next.add(value)
      } else if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
    if (!range || anchor === null) setAnchor(index)
  }

  function onRowClick(event: MouseEvent<HTMLDivElement>, index: number) {
    // ⌘/Ctrl 는 하나씩, Shift 는 이어서 고른다 — 파일 목록이 쓰는 그대로다.
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault()
      pick(index, event.shiftKey)
      return
    }
    setFresh(null)
    select(index)
  }

  function onRowKey(event: KeyboardEvent<HTMLDivElement>, index: number) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = index + (event.key === 'ArrowDown' ? 1 : -1)
      if (next < 0 || next >= steps.length) return
      select(next, detail)
      rowRefs.current.get(next)?.focus({ preventScroll: true })
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(index)
    } else if (event.key === 'Escape') {
      setDetail(false)
    }
  }

  const openStep = current === null ? undefined : steps[current]
  const allPicked = steps.length > 0 && pickedNow.length === steps.length
  const picking = pickedNow.length > 0

  return (
    <SceneContext.Provider value={sceneMatcher}>
    <div className={`se${detail && openStep !== undefined ? ' has-detail' : ''}${picking ? ' is-picking' : ''}${dragIndex !== null ? ' is-dragging' : ''}`}>
      <section className="se-head">
        {banner}
        <div className="se-eyebrow">
          <span aria-hidden="true" className="se-mode-dot" />
          {b.modeOrdered}
          <span aria-hidden="true">/</span>
          {b.kicker}
        </div>
        {/* 제목은 고칠 수 있다는 것이 늘 보여야 한다 — 평소엔 연필과 점선, 가져다 대면 칸이 선다. */}
        <div className="se-title-wrap" title={b.titleEdit}>
          <input
            aria-label={e.titleLabel}
            className="se-title"
            onChange={(event) => editor.setTitle(event.target.value)}
            placeholder={t.scenarios.page.untitled}
            ref={setTitleField}
            value={working.title}
          />
          <button aria-label={b.titleEdit} className="se-title-edit" onClick={() => titleField?.select()} tabIndex={-1} type="button">
            <StudioIcon name="pencil" size={15} />
          </button>
        </div>
        <div className="se-summary">
          <span className="se-tag">{b.stepTag} <b>{numbering.actions}</b></span>
          <span className="se-tag se-tag--tc">{b.tcTag} <b>{numbering.regions}</b></span>
        </div>
      </section>

      {editor.saveError !== null && (
        <p className="se-error" role="alert">
          <StudioIcon name="alert" size={15} />
          {e.saveFailed}
        </p>
      )}

      <div className="se-toolbar">
        <label className="se-find">
          <StudioIcon name="search" size={15} />
          <span className="visually-hidden">{b.find}</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                cycle(matches)
              }
            }}
            placeholder={b.find}
            type="search"
            value={query}
          />
          {needle !== '' && <span className="se-find-count mono">{b.matches(matches.length)}</span>}
          <button aria-label={b.nextMatch} className="se-icon-button" disabled={matches.length === 0} onClick={() => cycle(matches)} type="button">
            <StudioIcon name="chevronDown" size={15} />
          </button>
        </label>
        {picking && (
          <div className="se-picked" role="group" aria-label={b.selectedCount(pickedNow.length)}>
            <strong>{b.selectedCount(pickedNow.length)}</strong>
            <button className="se-picked-delete" onClick={removePicked} type="button">
              <StudioIcon name="trash" size={14} />
              {b.deleteSelected}
            </button>
            <button className="se-picked-clear" onClick={clearPicked} type="button">{b.clearSelection}</button>
          </div>
        )}
        <span className="se-spacer" />
        {gaps.length > 0 && (
          <button className="se-gap-jump" onClick={() => cycle(gaps)} type="button">
            <StudioIcon name="alert" size={14} />
            {b.gapJump(gaps.length)}
          </button>
        )}
        <div className="se-seg" role="group">
          <button aria-pressed={!expanded} className={expanded ? '' : 'is-on'} onClick={() => setExpanded(false)} type="button">{b.compact}</button>
          <button aria-pressed={expanded} className={expanded ? 'is-on' : ''} onClick={() => setExpanded(true)} type="button">{b.expanded}</button>
        </div>
        {/* 고른 단계가 있으면 그 아래에, 없으면 끝에 넣는다. 원하는 자리는 행 사이의 + 가 맡는다. */}
        <button className="se-add" onClick={() => insertAt(current === null ? steps.length : current + 1)} type="button">
          <StudioIcon name="plus" size={14} />
          {current === null ? e.addStep : b.addBelow}
        </button>
      </div>

      <div className="se-columns">
        <span className="se-columns-order">
          <input
            aria-label={b.selectAll}
            checked={allPicked}
            className="se-pick"
            disabled={steps.length === 0}
            onChange={() => {
              if (allPicked) clearPicked()
              else setPicked(new Set(steps.map((_, index) => index)))
            }}
            title={b.selectAll}
            type="checkbox"
          />
          <span className="se-columns-order-label">{b.columnOrder}</span>
        </span>
        <span>{b.columnAction}</span>
        <span>{b.columnCase}</span>
        <span>{b.columnScene}</span>
        <span className="se-columns-verdict">
          {b.columnVerdict}
          <InfoHint label={b.columnVerdict}>
            <span className="se-legend">
              <span>{b.verdictHelp}</span>
              {VERDICTS.map((status) => (
                <span className="se-legend-row" key={status}>
                  <span aria-hidden="true" className={`se-dot se-dot--${status}`} />
                  {statusLabel[status]}
                </span>
              ))}
            </span>
          </InfoHint>
        </span>
      </div>

      <div className="se-list-frame">
        <div className={`se-list${expanded ? ' is-expanded' : ''}`} ref={setScroller}>
          {steps.length === 0 ? (
            <div className="se-empty">
              <StepsSketch />
              <b>{b.emptyTitle}</b>
              <span>{b.emptyBody}</span>
              <button className="button button--primary button--compact" onClick={() => insertAt(0)} type="button">{e.addStep}</button>
            </div>
          ) : (
            <ol className="se-rows">
              {steps.map((step, index) => {
                const gap = isGapStep(step)
                const testCase = step.case_id === null ? undefined : cases.get(String(step.case_id))
                const tcNo = numbering.tcNo.get(index)
                const continued = tcNo !== undefined && numbering.tcNo.get(index - 1) === tcNo
                const mark = stepMarks?.[index]
                const over = overIndex === index && dragIndex !== null && dragIndex !== index
                const classes = [
                  'se-row',
                  index === current ? 'is-selected' : '',
                  picked.has(index) ? 'is-picked' : '',
                  gap ? 'is-gap' : '',
                  tcNo !== undefined ? 'is-tc' : '',
                  mark === 'changed' ? 'is-changed' : mark === 'added' ? 'is-added' : '',
                  needle !== '' && matches.includes(index) ? 'is-match' : '',
                  dragIndex === index ? 'is-lifted' : '',
                  over ? (dragIndex < index ? 'is-over-after' : 'is-over-before') : '',
                  dropped === index ? 'is-dropped' : '',
                ].filter(Boolean).join(' ')
                return (
                  <li
                    className={classes}
                    draggable={!gap}
                    key={index}
                    onAnimationEnd={() => setDropped(null)}
                    onDragEnd={endDrag}
                    onDragOver={(event) => {
                      if (dragIndex === null) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      if (overIndex !== index) setOverIndex(index)
                    }}
                    onDragStart={(event) => onDragStart(event, index)}
                    onDrop={(event) => {
                      event.preventDefault()
                      onDrop(index)
                    }}
                  >
                    <button aria-label={b.insertHere} className="se-insert" onClick={() => insertAt(index)} title={b.insertHere} type="button">
                      <StudioIcon name="plus" size={12} />
                    </button>
                    {!gap && (
                      <span aria-hidden="true" className="se-grip" title={e.drag}>
                        <StudioIcon name="grip" size={14} />
                      </span>
                    )}
                    <div
                      aria-pressed={index === current}
                      className="se-row-main"
                      onClick={(event) => onRowClick(event, index)}
                      onKeyDown={(event) => onRowKey(event, index)}
                      ref={(node) => {
                        if (node === null) rowRefs.current.delete(index)
                        else rowRefs.current.set(index, node)
                      }}
                      role="button"
                      tabIndex={0}
                      title={step.action}
                    >
                      <span className="se-row-no mono">
                        <input
                          aria-label={b.selectStep(numbering.actionNo[index] ?? index + 1)}
                          checked={picked.has(index)}
                          className="se-pick"
                          onChange={() => undefined}
                          onClick={(event) => {
                            event.stopPropagation()
                            pick(index, event.shiftKey)
                          }}
                          type="checkbox"
                        />
                        <span className="se-row-no-label">
                          {gap ? <StudioIcon name="alert" size={14} /> : String(numbering.actionNo[index]).padStart(2, '0')}
                        </span>
                      </span>
                      <span className="se-row-action">
                        {step.step_source === 'HUMAN' && <span className="se-human" title={e.humanStepHelp}>{e.humanStep}</span>}
                        {(mark === 'changed' || mark === 'added') && (
                          <span className={`se-mark se-mark--${mark}`}>{mark === 'changed' ? b.changed : b.added}</span>
                        )}
                        {gap ? (
                          step.step_unknown_reason === null ? b.gapRowPlain : b.gapRow(step.step_unknown_reason)
                        ) : (
                          <RichText text={step.action.length > 0 ? step.action : e.actionPlaceholder} />
                        )}
                        {expanded && (gap || testCase !== undefined) && (
                          <span className="se-row-expected">
                            {gap ? <RichText text={step.action} /> : <><b>{b.expected}</b> <RichText text={testCase?.expectedValue ?? ''} /></>}
                          </span>
                        )}
                      </span>
                      <span className={`se-row-case${continued ? ' is-continued' : ''}`}>
                        {gap ? (
                          <span className="se-muted">—</span>
                        ) : tcNo === undefined || step.case_id === null ? (
                          <span className="se-general" title={b.generalStepHelp}>{b.generalStep}</span>
                        ) : (
                          <button
                            className="se-tc"
                            onClick={(event) => {
                              event.stopPropagation()
                              setTcView({ caseId: step.case_id as number, label: b.caseOrdinal(tcNo) })
                            }}
                            title={b.openCase(b.caseOrdinal(tcNo))}
                            type="button"
                          >
                            {b.caseOrdinal(tcNo)}
                          </button>
                        )}
                      </span>
                      <span className="se-row-scene">
                        {testCase?.scene ? <span className="se-scene" title={testCase.scene}>{testCase.scene}</span> : <span className="se-muted">—</span>}
                      </span>
                      <span className="se-row-verdict">
                        {gap ? (
                          <span className="se-needs">{b.needsInput}</span>
                        ) : testCase !== undefined ? (
                          <span className="se-verdict">
                            <span aria-hidden="true" className={`se-dot se-dot--${testCase.verificationStatus}`} />
                            {statusLabel[testCase.verificationStatus] ?? testCase.verificationStatus}
                          </span>
                        ) : (
                          <span className="se-muted">—</span>
                        )}
                      </span>
                    </div>
                  </li>
                )
              })}
              <li className="se-row-end">
                <button className="se-add-row" onClick={() => insertAt(steps.length)} type="button">
                  <StudioIcon name="plus" size={14} />
                  {e.addStep}
                </button>
              </li>
            </ol>
          )}
        </div>
        <ScrollFade scroller={scroller} />
      </div>

      <footer className="se-foot">
        <span>{steps.length > 0 ? b.position(numbering.actions) : b.emptyPosition}</span>
        {steps.length > JUMP_SIZE && (
          <div className="se-jumps">
            {Array.from({ length: Math.ceil(steps.length / JUMP_SIZE) }, (_, block) => {
              const from = block * JUMP_SIZE
              const on = current !== null && current >= from && current < from + JUMP_SIZE
              return (
                <button className={on ? 'is-on' : ''} key={block} onClick={() => select(from, detail)} type="button">
                  {b.jump(from + 1, Math.min(steps.length, from + JUMP_SIZE))}
                </button>
              )
            })}
          </div>
        )}
        <button className="se-detail-toggle" disabled={steps.length === 0} onClick={() => {
          if (current === null && steps.length > 0) setSelected(0)
          setDetail((value) => !value)
        }} type="button">
          <StudioIcon name="panelBottom" size={14} />
          {detail ? b.closeDetail : b.openDetail}
        </button>
      </footer>

      {detail && openStep !== undefined && current !== null && (
        <>
          <SplitHandle
            label={b.resizeDetail}
            max={DETAIL_HEIGHT_MAX}
            min={DETAIL_HEIGHT_MIN}
            onChange={setDetailHeight}
            orientation="horizontal"
            sign={-1}
            value={detailHeight}
          />
          <StepInspector
            autoFocus={fresh === current}
            caseOrdinal={numbering.tcNo.get(current) ?? null}
            editor={editor}
            height={detailHeight}
            index={current}
            number={numbering.actionNo[current]}
            onAddBelow={() => insertAt(current + 1)}
            onClose={() => setDetail(false)}
            onFillGap={() => setGapFill({ index: current, blockedBy: openStep.step_unknown_reason, detail: openStep.action })}
            onMove={(to) => moveStep(current, to)}
            onRemove={() => removeStep(current)}
            onSelect={(to) => select(to)}
            onViewCase={(caseId, label) => setTcView({ caseId, label })}
            step={openStep}
            stepCount={steps.length}
            testCase={openStep.case_id === null ? undefined : cases.get(String(openStep.case_id))}
          />
        </>
      )}

      {gapFill !== null && (
        <GapFillModal
          blockedBy={gapFill.blockedBy}
          detail={gapFill.detail}
          onCancel={() => setGapFill(null)}
          onConfirm={(filled) => {
            editor.replaceStep(gapFill.index, filled)
            setGapFill(null)
          }}
        />
      )}
      {tcView !== null && (
        <TestCaseModal caseId={tcView.caseId} label={tcView.label} onClose={() => setTcView(null)} projectId={projectId} />
      )}
    </div>
    </SceneContext.Provider>
  )
}

/** 고른 단계 하나. 왼쪽은 고치는 칸, 오른쪽은 연결된 TC 명세(읽기 전용). */
function StepInspector({
  autoFocus,
  height,
  onAddBelow,
  step,
  index,
  number,
  caseOrdinal,
  stepCount,
  testCase,
  editor,
  onSelect,
  onMove,
  onRemove,
  onClose,
  onFillGap,
  onViewCase,
}: {
  /** 방금 넣은 빈 단계라면 바로 쓸 수 있게 글 칸에 초점을 준다. */
  autoFocus: boolean
  height: number
  onAddBelow: () => void
  step: ScenarioStep
  index: number
  number: number | null
  caseOrdinal: number | null
  stepCount: number
  testCase: TestCase | undefined
  editor: StepEditor
  onSelect: (index: number) => void
  onMove: (to: number) => void
  onRemove: () => void
  onClose: () => void
  onFillGap: () => void
  onViewCase: (caseId: number, label: string) => void
}) {
  const { t } = useI18n()
  const e = t.scenarios.stepsEditor
  const b = e.board
  const gap = isGapStep(step)
  const [editScroller, setEditScroller] = useState<HTMLDivElement | null>(null)
  const [caseScroller, setCaseScroller] = useState<HTMLDivElement | null>(null)
  const chip = gap
    ? b.gapChip
    : caseOrdinal === null
      ? b.noTcAction
      : b.caseChip(caseOrdinal, testCase?.scene ?? '')

  return (
    <section aria-label={gap ? b.gapRowPlain : b.stepLabel(number ?? index + 1)} className="se-detail" style={{ height }}>
      <header className="se-detail-head">
        <span aria-hidden="true" className="se-detail-marker" />
        <strong>{gap ? b.gapRowPlain : b.stepLabel(number ?? index + 1)}</strong>
        <span className="se-chip mono">{chip}</span>
        <span className="se-spacer" />
        <button aria-label={b.previous} className="se-icon-button" disabled={index === 0} onClick={() => onSelect(index - 1)} type="button">
          <StudioIcon name="chevronUp" />
        </button>
        <button aria-label={b.next} className="se-icon-button" disabled={index === stepCount - 1} onClick={() => onSelect(index + 1)} type="button">
          <StudioIcon name="chevronDown" />
        </button>
        <button aria-label={b.closeDetail} className="se-icon-button" onClick={onClose} type="button">
          <StudioIcon name="close" />
        </button>
      </header>
      <div className="se-detail-body">
        {/* 두 칸이 각자 스크롤한다. 가운데 칸이라 막대 대신 위아래 화살표다(`ScrollFade`). */}
        <div className="se-detail-pane">
        <div className="se-detail-edit" ref={setEditScroller}>
          <div className="se-field-title">
            <label htmlFor="se-action">{e.actionLabel}</label>
            {step.step_source === 'HUMAN' && <span className="se-muted">{e.humanStep}</span>}
            {gap && <span className="se-muted">{b.gapSource}</span>}
          </div>
          {gap ? (
            <p className="se-gap-text"><RichText text={step.action} /></p>
          ) : (
            <StepAction
              autoFocus={autoFocus}
              id="se-action"
              label={e.actionLabel}
              onChange={(action) => editor.updateStep(index, { action })}
              placeholder={e.actionPlaceholder}
              value={step.action}
            />
          )}
          {!gap && (
            <>
              <div className="se-field-title">
                <label htmlFor="se-hint">{e.hintLabel}</label>
              </div>
              <input
                className="se-hint"
                id="se-hint"
                onChange={(event) => editor.updateStep(index, { hint: event.target.value || null })}
                placeholder={e.hintPlaceholder}
                value={step.hint ?? ''}
              />
            </>
          )}
          <div className="se-detail-actions">
            {gap ? (
              <button className="button button--primary button--compact" onClick={onFillGap} type="button">
                <StudioIcon name="plus" size={14} />
                {e.gapAddStep}
              </button>
            ) : (
              <>
                <button className="button button--secondary button--compact" disabled={index === 0} onClick={() => onMove(index - 1)} type="button">
                  <StudioIcon name="arrowUp" size={14} />
                  {e.moveUp}
                </button>
                <button className="button button--secondary button--compact" disabled={index === stepCount - 1} onClick={() => onMove(index + 1)} type="button">
                  <StudioIcon name="arrowDown" size={14} />
                  {e.moveDown}
                </button>
                <button className="button button--secondary button--compact" onClick={onAddBelow} type="button">
                  <StudioIcon name="plus" size={14} />
                  {b.addBelow}
                </button>
              </>
            )}
            <button className="button button--danger-quiet button--compact" onClick={onRemove} type="button">
              <StudioIcon name="trash" size={14} />
              {e.remove}
            </button>
            <span className="se-spacer" />
            {!gap && <span className="se-muted">{b.autosaveNote}</span>}
          </div>
        </div>
        <ScrollFade scroller={editScroller} />
        </div>
        <div className="se-detail-pane se-detail-pane--case">
        <div className="se-detail-case" ref={setCaseScroller}>
          <div className="se-field-title">
            <strong>{b.linkedCase}</strong>
            <span className="se-muted">{b.readOnly}</span>
            <span className="se-spacer" />
            {step.case_id !== null && caseOrdinal !== null && (
              <button className="se-link" onClick={() => onViewCase(step.case_id as number, `TC ${caseOrdinal}`)} title={e.viewCase} type="button">
                {b.fullSpec}
                <StudioIcon name="external" size={13} />
              </button>
            )}
          </div>
          {gap ? (
            <>
              {step.step_unknown_reason !== null && <p className="mono se-case-where">{step.step_unknown_reason}</p>}
              <p className="se-muted">{b.gapExplain}</p>
            </>
          ) : testCase === undefined ? (
            <p className="se-muted">{b.notLinked}</p>
          ) : (
            <dl className="se-case">
              <dt>{b.precondition}</dt>
              <dd><RichText text={testCase.precondition ?? b.noPrecondition} /></dd>
              <dt>{b.expected}</dt>
              <dd><Expected text={testCase.expectedValue.length > 0 ? testCase.expectedValue : b.noExpected} /></dd>
            </dl>
          )}
          {step.input !== null && (
            <p className="se-input-note">
              {b.inputNote} · <code>{step.input}</code>
            </p>
          )}
        </div>
        <ScrollFade scroller={caseScroller} />
        </div>
      </div>
    </section>
  )
}

/** 기대 결과는 ` / ` 로 이어진 여러 줄이다. 둘 이상이면 목록으로 편다. */
function Expected({ text }: { text: string }) {
  const parts = text.split(' / ')
  if (parts.length < 2) return <RichText text={text} />
  return (
    <ul>
      {parts.map((part, index) => (
        <li key={index}><RichText text={part} /></li>
      ))}
    </ul>
  )
}

/**
 * 백틱으로 감싼 이름(`Canvas/Stage`)은 오브젝트 상자로, 프로젝트 TC 에 나오는 씬 이름은 씬 색으로 세운다.
 * 둘 다 단계를 훑을 때 눈이 먼저 찾는 것이다. 나머지는 글 그대로다.
 */
function RichText({ text }: { text: string }) {
  const scenes = useContext(SceneContext)
  const parts = text.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          const name = part.slice(1, -1)
          return <code className={scenes !== null && wholeMatch(scenes, name) ? 'se-scene-ref' : undefined} key={index}>{name}</code>
        }
        if (scenes === null) return part
        return part.split(scenes).map((piece, inner) =>
          inner % 2 === 1 ? <span className="se-scene-ref" key={`${index}-${inner}`}>{piece}</span> : piece,
        )
      })}
    </>
  )
}

function wholeMatch(pattern: RegExp, text: string): boolean {
  const parts = text.split(pattern)
  return parts.length === 3 && parts[0] === '' && parts[2] === ''
}

/**
 * 프로젝트 TC 의 씬 이름으로 만든 찾기 식. 긴 이름부터 맞춰 `Map_scene` 이 `Map` 에 먹히지 않게 하고,
 * 앞뒤가 영숫자이면 이름의 일부로 보고 건너뛴다. 세 글자보다 짧은 이름은 흔한 낱말과 겹쳐 뺀다.
 */
function scenePattern(cases: ReadonlyMap<string, TestCase>): RegExp | null {
  const names = [...new Set([...cases.values()].map((testCase) => testCase.scene).filter((scene): scene is string => typeof scene === 'string' && scene.length >= 3))]
  if (names.length === 0) return null
  names.sort((left, right) => right.length - left.length)
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(?<![A-Za-z0-9_])(${escaped.join('|')})(?![A-Za-z0-9_])`)
}

/**
 * 가운데 칸의 스크롤 표시. 스튜디오는 좌·우 칸에만 막대(`EdgeScrollbar`)를 두고 가운데는 위아래 끝의
 * 옅은 가림과 화살표로 "더 있다"를 말한다 — 막대 셋이 나란히 서면 어느 것이 무엇인지 안 읽힌다.
 * 끝에 닿은 쪽은 사라진다. 스크롤하는 칸의 위치 잡힌 부모 안에 둔다.
 */
function ScrollFade({ scroller }: { scroller: HTMLElement | null }) {
  const [edge, setEdge] = useState({ top: true, bottom: true })
  useEffect(() => {
    if (scroller === null) return undefined
    const element = scroller
    function read() {
      setEdge({
        top: element.scrollTop <= 2,
        bottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 2,
      })
    }
    read()
    // 단계를 넣고 빼거나 창 크기가 바뀌어도 스크롤할 거리가 달라진다 — 내용까지 함께 본다.
    const observer = new ResizeObserver(read)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    element.addEventListener('scroll', read, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', read)
    }
  }, [scroller])
  return (
    <>
      <span aria-hidden="true" className={`se-fade se-fade--top${edge.top ? ' is-end' : ''}`}>
        <StudioIcon name="chevronUp" size={14} />
      </span>
      <span aria-hidden="true" className={`se-fade se-fade--bottom${edge.bottom ? ' is-end' : ''}`}>
        <StudioIcon name="chevronDown" size={14} />
      </span>
    </>
  )
}

/** 아래 칸 높이. 사람마다 읽는 양이 달라 끌어서 바꾸고, 다음에 열 때도 그 높이로 연다. */
function useDetailHeight(): [number, (next: number) => void] {
  const [height, setHeight] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(DETAIL_HEIGHT_KEY))
      return Number.isFinite(saved) && saved > 0 ? Math.min(DETAIL_HEIGHT_MAX, Math.max(DETAIL_HEIGHT_MIN, saved)) : DETAIL_HEIGHT_DEFAULT
    } catch {
      return DETAIL_HEIGHT_DEFAULT
    }
  })
  const update = useCallback((next: number) => {
    setHeight(next)
    try {
      window.localStorage.setItem(DETAIL_HEIGHT_KEY, String(next))
    } catch {
      // 저장소를 못 쓰면 이번 화면에서만 그 높이다.
    }
  }, [])
  return [height, update]
}

/** 검색이 보는 글: 단계의 내용 · 힌트 · 입력 · 공백 사유와, 연결된 TC 의 씬 · 사전조건 · 기대 결과. */
function stepText(step: ScenarioStep, cases: ReadonlyMap<string, TestCase>): string {
  const testCase = step.case_id === null ? undefined : cases.get(String(step.case_id))
  return [step.action, step.hint, step.input, step.step_unknown_reason, testCase?.scene, testCase?.precondition, testCase?.expectedValue]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase()
}

/**
 * STEP 의 글 칸. 높이가 내용을 따라간다.
 *
 * 높이를 `onChange` 안에서만 맞추면 **타이핑할 때만** 맞는다. 서버에서 불러와 처음 그릴
 * 때, undo/redo 로 값이 되돌아올 때, 대화의 제안이 적용돼 `rebase` 될 때는 아무도 다시
 * 재지 않아 한 줄로 잘린 채 남는다. 그래서 값이 어디서 바뀌든 다시 재는 자리를 `value` 에 둔다.
 *
 * 폭이 바뀌어도 같은 글자가 다르게 접히므로 `ResizeObserver` 도 함께 본다 — 다만 **가로만** 본다.
 * 세로까지 보면 높이를 고치는 것이 다시 관찰을 부르는 되먹임이 된다.
 */
function StepAction({
  autoFocus,
  id,
  value,
  placeholder,
  label,
  onChange,
}: {
  autoFocus: boolean
  id: string
  value: string
  placeholder: string
  label: string
  onChange: (value: string) => void
}) {
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const [node, setNode] = useState<HTMLTextAreaElement | null>(null)
  const setField = useCallback((element: HTMLTextAreaElement | null) => {
    fieldRef.current = element
    setNode(element)
  }, [])

  const fit = useCallback(() => {
    const element = fieldRef.current
    if (element === null) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [])

  useLayoutEffect(() => { fit() }, [fit, node, value])
  useEffect(() => {
    if (autoFocus) node?.focus()
  }, [autoFocus, node])

  const lastWidth = useRef(0)
  useEffect(() => {
    if (node === null) return undefined
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width
      if (width === lastWidth.current) return
      lastWidth.current = width
      fit()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, fit])

  return (
    <textarea
      aria-label={label}
      className="se-action"
      id={id}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      ref={setField}
      rows={2}
      value={value}
    />
  )
}

/**
 * 프로젝트 TC 의 id → TC. 화면이 열릴 때 한 번 읽는다 — 스텝마다 따로 부르면 TC 수만큼 요청이 나간다.
 * 목록의 씬 · 판정 칸과 아래 칸의 사전조건 · 기대 결과가 모두 이것을 읽는다. 못 읽으면 칸이 비어 있다.
 */
function useCaseIndex(projectId: string): ReadonlyMap<string, TestCase> {
  const [cases, setCases] = useState<ReadonlyMap<string, TestCase>>(new Map())
  useEffect(() => {
    const controller = new AbortController()
    listTestCases(projectId, controller.signal)
      .then((list) => setCases(new Map(list.map((testCase) => [testCase.id, testCase]))))
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId])
  return cases
}
