import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'
import { QaChatPanel } from './QaChatPanel'
import { QaContextGauge } from './QaContextGauge'
import { QaRunChangesPanel } from './QaRunChangesPanel'
import { toolCallOf } from './qaLogGrouping'
import type { QaContextUsage, QaProgress, QaStepProgress } from './qaProgress'
import type { QaLog, QaRun } from './qaTypes'
import { useQaRunChanges } from './useQaRunChanges'

/** The chat's height when the viewer has never resized it. */
const DEFAULT_CHAT_HEIGHT_PIXELS = 240
const MINIMUM_CHAT_HEIGHT_PIXELS = 140
/** The game keeps at least this much height, however far the chat is dragged. */
const MINIMUM_GAME_HEIGHT_PIXELS = 160
/** One arrow-key press on the resize handle. */
const KEYBOARD_STEP_PIXELS = 24
const CHAT_HEIGHT_STORAGE_KEY = 'artel.qaConsole.chatHeightPixels'

function readStoredChatHeight(): number {
  try {
    const stored = Number(window.localStorage.getItem(CHAT_HEIGHT_STORAGE_KEY))
    return Number.isFinite(stored) && stored >= MINIMUM_CHAT_HEIGHT_PIXELS ? stored : DEFAULT_CHAT_HEIGHT_PIXELS
  } catch {
    return DEFAULT_CHAT_HEIGHT_PIXELS
  }
}

function storeChatHeight(heightPixels: number) {
  try {
    window.localStorage.setItem(CHAT_HEIGHT_STORAGE_KEY, String(Math.round(heightPixels)))
  } catch {
    // A blocked storage only means the next visit starts at the default height.
  }
}

/**
 * The centre of the console: the game on top, the operator chat below, and a
 * handle between them that trades height from one to the other.
 *
 * The game keeps its 16:9 shape, so taking height from it also takes width, and
 * it shrinks toward the top-left corner. The width it gives up goes to the
 * "Now" panel on its right, which therefore grows exactly when the game is too
 * small to read the run from.
 *
 * The dock under the game switches between the chat and the knowledge and macro
 * changes this run made, the same way the log column switches between flow, raw
 * and issues. The chat stays mounted while hidden so a half-typed message and
 * its scroll position survive the switch.
 */
export function QaFocusStage({
  chatDisabled,
  contextUsage,
  game,
  logs,
  progress,
  qaRun,
  qaTryId,
}: {
  chatDisabled: boolean
  contextUsage: QaContextUsage | null
  game: ReactNode
  logs: QaLog[]
  progress: QaProgress
  qaRun: QaRun
  qaTryId: string
}) {
  const { t } = useI18n()
  const stageRef = useRef<HTMLDivElement>(null)
  const [dockView, setDockView] = useState<'chat' | 'changes'>('chat')
  const changes = useQaRunChanges(qaRun)
  const [chatHeight, setChatHeight] = useState(readStoredChatHeight)
  const [maximumChatHeight, setMaximumChatHeight] = useState<number | null>(null)

  // The ceiling depends on the stage's own height, which changes with the
  // window, so it is measured rather than computed from the viewport.
  useEffect(() => {
    const stage = stageRef.current
    if (stage === null) return undefined
    const observer = new ResizeObserver(([entry]) => {
      setMaximumChatHeight(Math.max(MINIMUM_CHAT_HEIGHT_PIXELS, entry.contentRect.height - MINIMUM_GAME_HEIGHT_PIXELS))
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const clampChatHeight = useCallback(
    (heightPixels: number) =>
      Math.min(maximumChatHeight ?? Number.POSITIVE_INFINITY, Math.max(MINIMUM_CHAT_HEIGHT_PIXELS, heightPixels)),
    [maximumChatHeight],
  )
  const shownChatHeight = clampChatHeight(chatHeight)

  const resizeTo = useCallback(
    (heightPixels: number) => {
      const next = clampChatHeight(heightPixels)
      setChatHeight(next)
      storeChatHeight(next)
    },
    [clampChatHeight],
  )

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current
    if (stage === null) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const stageBottom = stage.getBoundingClientRect().bottom
    const onMove = (moveEvent: globalThis.PointerEvent) => resizeTo(stageBottom - moveEvent.clientY)
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onEnd)
      handle.removeEventListener('pointercancel', onEnd)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onEnd)
    handle.addEventListener('pointercancel', onEnd)
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowUp') resizeTo(shownChatHeight + KEYBOARD_STEP_PIXELS)
    else if (event.key === 'ArrowDown') resizeTo(shownChatHeight - KEYBOARD_STEP_PIXELS)
    else if (event.key === 'Home') resizeTo(MINIMUM_CHAT_HEIGHT_PIXELS)
    else if (event.key === 'End') resizeTo(maximumChatHeight ?? shownChatHeight)
    else return
    event.preventDefault()
  }

  return (
    <div className="qa-stage" ref={stageRef}>
      <div className="qa-stage-top">
        {game}
        <QaNowPanel contextUsage={contextUsage} logs={logs} progress={progress} />
      </div>
      <div
        aria-label={t.qa.run.resizeChat}
        aria-orientation="horizontal"
        aria-valuemax={Math.round(maximumChatHeight ?? shownChatHeight)}
        aria-valuemin={MINIMUM_CHAT_HEIGHT_PIXELS}
        aria-valuenow={Math.round(shownChatHeight)}
        className="qa-stage-resize"
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startDrag}
        role="separator"
        tabIndex={0}
      />
      <div className="qa-stage-chat" style={{ height: shownChatHeight }}>
        <div className="qa-log-tabs qa-stage-dock-tabs" role="tablist">
          <button aria-selected={dockView === 'chat'} className={dockView === 'chat' ? 'on' : ''} onClick={() => setDockView('chat')} role="tab" type="button">{t.qa.run.chat}</button>
          <button aria-selected={dockView === 'changes'} className={dockView === 'changes' ? 'on' : ''} onClick={() => setDockView('changes')} role="tab" type="button">
            {t.qa.changes.tab}
            {changes.state === 'ready' && changes.items.length > 0 && <span className="qa-stage-dock-count mono">{changes.items.length}</span>}
          </button>
        </div>
        <div className="qa-stage-dock-body" hidden={dockView !== 'chat'} role="tabpanel">
          <QaChatPanel disabled={chatDisabled} logs={logs} qaTryId={qaTryId} />
        </div>
        {dockView === 'changes' && (
          <div className="qa-stage-dock-body qa-stage-dock-body--scroll" role="tabpanel">
            <QaRunChangesPanel changes={changes} qaRunId={qaRun.id} />
          </div>
        )}
      </div>
    </div>
  )
}

/** The step the run is on: the one it is about to judge, or else the last one it judged. */
function currentStepOf(progress: QaProgress): QaStepProgress | null {
  const running = progress.steps.find((step) => step.state === 'running')
  if (running !== undefined) return running
  const judged = progress.steps.filter((step) => step.state === 'passed' || step.state === 'failed')
  return judged.at(-1) ?? null
}

function latestToolCallOf(logs: QaLog[]) {
  let log: QaLog | undefined
  for (let index = logs.length - 1; index >= 0 && log === undefined; index -= 1) {
    if (logs[index].type === 'TOOL') log = logs[index]
  }
  if (log === undefined) return null
  const call = toolCallOf(log)
  return call === null ? null : { call, createdAt: log.createdAt }
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/**
 * What the run is doing right now, for when the game is too small to tell:
 * the step it is on, how full the agent's context window is, the tool it last
 * called and why, and the verdicts so far.
 */
function QaNowPanel({
  contextUsage,
  logs,
  progress,
}: {
  contextUsage: QaContextUsage | null
  logs: QaLog[]
  progress: QaProgress
}) {
  const { t } = useI18n()
  const now = t.qa.run.now
  const s = t.qa.steps
  const step = currentStepOf(progress)
  const latest = latestToolCallOf(logs)

  return (
    <section className="qa-now" aria-labelledby="qa-now-title">
      <div className="qa-now-body">
        <h2 className="qa-now-title" id="qa-now-title">{now.title}</h2>
        <dl className="qa-now-list">
          <div className="qa-now-item">
            <dt>{now.currentStep}</dt>
            <dd aria-live="polite">
              {step === null ? (
                <span className="qa-now-empty">{now.noStep}</span>
              ) : (
                <>
                  <span className={`qa-now-state qa-now-state--${step.state}`}>{s.stateLabels[step.state]}</span>
                  <span className="qa-now-step">
                    <span className="mono">{step.step}.</span> {step.title.length > 0 ? step.title : s.untitled(step.step)}
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>
        {/* Above the tool call: it is one line, and the reading that matters most
            when the panel is short, because a full context window stalls the run. */}
        <QaContextGauge usage={contextUsage} />
        <dl className="qa-now-list">
          <div className="qa-now-item">
            <dt>{now.lastTool}</dt>
            <dd>
              {latest === null ? (
                <span className="qa-now-empty">{now.noTool}</span>
              ) : (
                <>
                  <span className="qa-now-tool">
                    <span className="mono" translate="no">{latest.call.tool}</span>
                    <time className="qa-now-time mono" dateTime={latest.createdAt}>
                      {timeFormat.format(new Date(latest.createdAt))}
                    </time>
                  </span>
                  {latest.call.thought !== null && <span className="qa-now-thought">{latest.call.thought}</span>}
                </>
              )}
            </dd>
          </div>

          {progress.total > 0 && (
            <div className="qa-now-item">
              <dt>{now.verdicts}</dt>
              <dd className="mono">
                {s.summary(progress.reported, progress.total, progress.passed, progress.failed)}
                {progress.labeled > 0 && (
                  <span className="qa-now-grade" title={s.gradeNote}>
                    {s.gradeSummary(progress.correct, progress.wrong, progress.labeled)}
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  )
}
