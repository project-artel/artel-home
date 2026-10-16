import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import type { StepMark } from './draftChanges'
import { TestCaseModal } from '../testCases/TestCaseModal'
import { listTestCases } from '../testCases/testCaseApi'
import type { TestCase, VerificationStatus } from '../testCases/testCaseTypes'
import { GapFillModal } from './GapFillModal'
import { groupStepsByCase, isGapStep, type ScenarioStep } from './scenarioTypes'
import { StudioIcon, type StudioIconName } from './studioIcons'
import type { StepEditor } from './useStepEditor'

/** 이보다 단계가 많으면 바닥에 구간 점프를 단다. */
const JUMP_SIZE = 20

const STATUS_ICON: Record<VerificationStatus, StudioIconName> = {
  VERIFIED: 'check',
  FAILED: 'close',
  REGRESSION: 'refresh',
  DRAFT: 'circle',
  BROKEN: 'minus',
}

/**
 * Editable steps of a scenario (ARTEL-289, 배치는 ARTEL-1107).
 *
 * **목록은 훑고, 고른 단계는 깊게 읽는다.** 단계마다 입력 테두리 · 힌트 · 이동 · 삭제를 늘어놓으면
 * 단계가 수십 개가 될 때 정작 순서와 내용이 묻힌다. 그래서 목록은 한 줄(순서 · 실행할 내용 · 연결 TC ·
 * 씬 · TC 판정)로 두고, 고친 것은 고른 단계의 아래 칸에서 한다 — 상세가 열려도 목록의 행 높이는
 * 그대로다.
 *
 * 하는 일은 예전 그대로다: 제목 · 내용 · 힌트를 고치고, 단계를 더하고 지우고, 위아래로 옮기거나 끌어
 * 옮긴다. TC 는 내부 id 대신 등장 순번으로 부르고 전체 명세를 연다. 경로 공백은 번호 없이 서고 그 자리를
 * 채우는 단계를 받는다(`GapFillModal`). 사람이 쓴 단계는 표시한다. draft 는 바뀐 줄을 칠한다.
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
  const { working } = editor
  const steps = working.steps
  const cases = useCaseIndex(projectId)

  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [tcView, setTcView] = useState<{ caseId: number; label: string } | null>(null)
  const [gapFill, setGapFill] = useState<{ index: number; blockedBy: string | null; detail: string } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const rowRefs = useRef(new Map<number, HTMLButtonElement>())

  // 고른 자리가 목록 밖으로 밀리면(단계를 지우거나 다른 시나리오로 바뀌면) 놓는다.
  const current = selected !== null && selected < steps.length ? selected : null

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

  function addStep() {
    editor.addStep()
    select(steps.length)
  }

  function removeStep(index: number) {
    editor.removeStep(index)
    setSelected(steps.length <= 1 ? null : Math.min(index, steps.length - 2))
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return
    editor.moveStep(from, to)
    setSelected(to)
  }

  function onDrop(target: number) {
    if (dragIndex !== null && dragIndex !== target) moveStep(dragIndex, target)
    setDragIndex(null)
    setOverIndex(null)
  }

  function onRowKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = index + (event.key === 'ArrowDown' ? 1 : -1)
      if (next < 0 || next >= steps.length) return
      select(next, detail)
      rowRefs.current.get(next)?.focus({ preventScroll: true })
    } else if (event.key === 'Escape') {
      setDetail(false)
    }
  }

  const openStep = current === null ? undefined : steps[current]

  return (
    <div className={`se${detail && openStep !== undefined ? ' has-detail' : ''}`}>
      <section className="se-head">
        {banner}
        <div className="se-eyebrow">
          <span aria-hidden="true" className="se-mode-dot" />
          {b.modeOrdered}
          <span aria-hidden="true">/</span>
          {b.kicker}
        </div>
        <input
          aria-label={e.titleLabel}
          className="se-title"
          onChange={(event) => editor.setTitle(event.target.value)}
          placeholder={t.scenarios.page.untitled}
          value={working.title}
        />
        <div className="se-summary">
          <span>{b.stepCount(numbering.actions)}</span>
          <span aria-hidden="true">·</span>
          <span>{b.caseRegions(numbering.regions)}</span>
          <span aria-hidden="true">·</span>
          <span className="se-muted">{b.selectHint}</span>
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
        <button className="se-add" onClick={addStep} type="button">
          <StudioIcon name="plus" size={14} />
          {e.addStep}
        </button>
      </div>

      <div className="se-columns">
        <span>{b.columnOrder}</span>
        <span>{b.columnAction}</span>
        <span>{b.columnCase}</span>
        <span>{b.columnScene}</span>
        <span className="se-columns-verdict">
          {b.columnVerdict}
          <InfoHint>{b.verdictHelp}</InfoHint>
        </span>
      </div>

      <div className="se-list-frame">
        <div className={`se-list${expanded ? ' is-expanded' : ''}`} ref={setScroller}>
          {steps.length === 0 ? (
            <div className="se-empty">
              <b>{b.emptyTitle}</b>
              <span>{b.emptyBody}</span>
              <button className="button button--primary button--compact" onClick={addStep} type="button">{e.addStep}</button>
            </div>
          ) : (
            <ol className="se-rows">
              {steps.map((step, index) => {
                const gap = isGapStep(step)
                const testCase = step.case_id === null ? undefined : cases.get(String(step.case_id))
                const tcNo = numbering.tcNo.get(index)
                const continued = tcNo !== undefined && numbering.tcNo.get(index - 1) === tcNo
                const mark = stepMarks?.[index]
                const classes = [
                  'se-row',
                  index === current ? 'is-selected' : '',
                  gap ? 'is-gap' : '',
                  mark === 'changed' ? 'is-changed' : mark === 'added' ? 'is-added' : '',
                  needle !== '' && matches.includes(index) ? 'is-match' : '',
                  overIndex === index && dragIndex !== null ? 'is-over' : '',
                ].filter(Boolean).join(' ')
                return (
                  <li
                    className={classes}
                    key={index}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setOverIndex(index)
                    }}
                    onDrop={() => onDrop(index)}
                  >
                    {!gap && (
                      <span
                        aria-label={e.drag}
                        className="se-grip"
                        draggable
                        onDragEnd={() => {
                          setDragIndex(null)
                          setOverIndex(null)
                        }}
                        onDragStart={() => setDragIndex(index)}
                        role="img"
                        title={e.drag}
                      >
                        <StudioIcon name="grip" size={14} />
                      </span>
                    )}
                    <button
                      aria-pressed={index === current}
                      className="se-row-main"
                      onClick={() => select(index)}
                      onKeyDown={(event) => onRowKey(event, index)}
                      ref={(node) => {
                        if (node === null) rowRefs.current.delete(index)
                        else rowRefs.current.set(index, node)
                      }}
                      title={step.action}
                      type="button"
                    >
                      <span className="se-row-no mono">
                        {gap ? <StudioIcon name="alert" size={14} /> : String(numbering.actionNo[index]).padStart(2, '0')}
                      </span>
                      <span className="se-row-action">
                        {step.step_source === 'HUMAN' && <span className="se-human" title={e.humanStepHelp}>{e.humanStep}</span>}
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
                      <span className={`se-row-case mono${continued ? ' is-continued' : ''}`}>
                        {tcNo === undefined ? '—' : b.caseOrdinal(tcNo)}
                      </span>
                      <span className="se-row-scene" title={testCase?.scene}>{testCase?.scene ?? '—'}</span>
                      <span className="se-row-verdict">
                        {gap ? (
                          <span className="se-needs">{b.needsInput}</span>
                        ) : mark === 'changed' || mark === 'added' ? (
                          <span className={`se-mark se-mark--${mark}`}>{mark === 'changed' ? b.changed : b.added}</span>
                        ) : testCase !== undefined ? (
                          <span className={`se-verdict se-verdict--${testCase.verificationStatus}`}>
                            <StudioIcon name={STATUS_ICON[testCase.verificationStatus] ?? 'circle'} size={13} />
                            {t.scenarios.composition.status[testCase.verificationStatus] ?? testCase.verificationStatus}
                          </span>
                        ) : (
                          <span className="se-muted">{b.noCase}</span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
        <EdgeScrollbar label={b.columnAction} scroller={scroller} side="right" />
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
        <StepInspector
          caseOrdinal={numbering.tcNo.get(current) ?? null}
          editor={editor}
          index={current}
          number={numbering.actionNo[current]}
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
  )
}

/** 고른 단계 하나. 왼쪽은 고치는 칸, 오른쪽은 연결된 TC 명세(읽기 전용). */
function StepInspector({
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
  const chip = gap
    ? b.gapChip
    : caseOrdinal === null
      ? b.noTcAction
      : b.caseChip(caseOrdinal, testCase?.scene ?? '')

  return (
    <section aria-label={gap ? b.gapRowPlain : b.stepLabel(number ?? index + 1)} className="se-detail">
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
        <div className="se-detail-edit">
          <div className="se-field-title">
            <label htmlFor="se-action">{e.actionLabel}</label>
            {step.step_source === 'HUMAN' && <span className="se-muted">{e.humanStep}</span>}
            {gap && <span className="se-muted">{b.gapSource}</span>}
          </div>
          {gap ? (
            <p className="se-gap-text"><RichText text={step.action} /></p>
          ) : (
            <StepAction
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
        <div className="se-detail-case">
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

/** 백틱으로 감싼 이름(`Canvas/Stage`)을 코드 글꼴로. 나머지는 글 그대로다. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={index}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  )
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
  id,
  value,
  placeholder,
  label,
  onChange,
}: {
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
