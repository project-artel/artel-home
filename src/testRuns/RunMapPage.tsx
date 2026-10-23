import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { useActionBinding, useFieldBinding } from '../projectAgent/bindings'
import { resolveEntry, scenarioLookups } from '../projectAgent/specs/lookup'
import { listedOptions, readOnlyListWrite } from '../projectAgent/specs/listedOptions'
import {
  TEST_RUN_OPEN_EDITOR_ACTION,
  TEST_RUN_OPEN_SCENARIO_ACTION,
  TEST_RUN_SCENARIOS_FIELD,
  TEST_RUN_SELECT_SCENARIO_ACTION,
  TEST_RUN_START_QA_ACTION,
} from '../projectAgent/specs/testRun'
import { sectionHref } from '../projects/workspace/sections'
import { ContextMenu, type ContextMenuItem } from '../testCases/ContextMenu'
import { CaseImportDialog } from '../testScenarios/CaseImportDialog'
import { createTestScenario, updateScenario } from '../testScenarios/scenarioApi'
import { createEmptyStep, createHumanStep, type ScenarioDraft } from '../testScenarios/scenarioTypes'
import { setRunScenarios } from './testRunApi'
import { boxOf, contains, controlFor, dragBox, hasText, moved, resized, type Box, type BoxHandle } from './runMap/annotationGeometry'
import { autoLayout, dropSlot, FRAME_W, frameHeight, HEAD_H } from './runMap/frameGeometry'
import { moveRange } from './runMap/stepOrder'
import { emptyHistory, record, redo as redoHistory, undo as undoHistory, type History } from './runMap/runMapHistory'
import { getRunMap, saveRunMap, SHAPE_COLORS, StaleRunMapError, type NoteColor, type RunMap, type RunMapAnnotation, type RunMapFrame, type ShapeColor } from './runMap/runMapApi'
import { RunMapAnnotations, RunMapSections, SelectionBox } from './runMap/RunMapAnnotations'
import { RunMapDrawer } from './runMap/RunMapDrawer'
import { RunMapToolbar } from './runMap/RunMapToolbar'
import { letterOf, TOOL_KEYS, type RunMapTool } from './runMap/runMapTools'
import { StepHoverCard } from './runMap/StepHoverCard'
import { TsFrame } from './runMap/TsFrame'
import { useRunMapData } from './runMap/useRunMapData'
import { ArtelBotLock } from './runLock/ArtelBotLock'
import { isRunLocked } from './runLock/runLockApi'
import { useRunLock } from './runLock/useRunLock'
import { previewScenario } from './runMap/runMapModel'
import './runMap/runMap.css'

/**
 * 테스트 런 맵(ARTEL-1245). TS 하나가 끌어 옮기는 프레임 하나인 캔버스다. 프레임 안에서 스텝은 화살표로 잇고 씬별
 * 구간(이름 + 번갈아 명암)으로 묶는다. 스텝에 마우스를 올리면 카드, 누르면 서랍.
 *
 * 맵에서 바로 고친다. TS 의 스텝 · TC 는 편집 화면과 같은 TS 데이터(`PUT /api/test-scenario/{id}`)에, 런 구성은
 * `PUT .../scenarios` 에, 프레임 자리 · 접힘과 메모 · 글 · 도형 · 그림은 런 맵(`PUT .../map`)에 저장한다.
 * 모든 편집은 되돌리기 · 다시 하기가 된다.
 */
export function RunMapRoute() {
  const { projectId = '', runId = '' } = useParams()
  return <RunMapPage key={runId} projectId={projectId} runId={runId} />
}

type Board = Pick<RunMap, 'layout' | 'annotations'>
type Change =
  | { kind: 'board'; board: Board }
  | { kind: 'scenario'; id: string; draft: ScenarioDraft }
  | { kind: 'order'; ids: string[] }
  // 한 동작이 여러 저장소를 바꿀 때(예: 주석과 TS 를 함께 지우기). 되돌리기 한 번에 함께 돌아간다.
  | { kind: 'many'; changes: Change[] }
type View = { x: number; y: number; k: number }
type Interaction =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  // [rename]: 이름을 눌렀다. 끌지 않고 떼면 이름을 고친다.
  | { kind: 'frame'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; before: Board; rename: boolean }
  // 영역 끌기. [section] 은 묶음 상자 안에서 시작했을 때의 그 상자(끌지 않고 떼면 상자를 고른다).
  // [box] 는 끄는 동안의 영역. 화면 상태(marquee)는 빠르게 끌면 뗄 때까지 갱신되지 않아 여기서 따로 든다.
  | { kind: 'marquee'; ox: number; oy: number; additive: boolean; section: string | null; box: Box }
  // 묶음 상자를 옮기면 [carry] 에 든 프레임 · 주석도 함께 옮긴다.
  | { kind: 'item'; id: string; lastX: number; lastY: number; moved: boolean; before: Board; carry: { frames: string[]; items: string[] } }
  | { kind: 'draw'; id: string; ox: number; oy: number; before: Board; repeat: boolean }
  | { kind: 'resize'; id: string; handle: BoxHandle; from: Box; original: RunMapAnnotation; moved: boolean; before: Board }
  | { kind: 'bend'; id: string; handle: 'p1' | 'p2' | 'c'; moved: boolean; before: Board }
  // 스텝 끌기. ⌥ 를 누르고 시작하면 그 스텝이 든 TC 전체([start]..[end])를 끈다. 끌지 않고 떼면 서랍을 연다.
  // [target] 은 놓을 자리. 화면 상태(stepDrag)는 빠르게 끌면 뗄 때까지 갱신되지 않아 여기서 따로 든다.
  | { kind: 'step'; id: string; index: number; start: number; end: number; sx: number; sy: number; moved: boolean; label: string; target: { id: string; before: number; x: number; y: number } | null }

const MIN_K = 0.12
const MAX_K = 1.8
const SAVE_DELAY_MS = 600
const NOTE_COLORS: NoteColor[] = ['y', 'p', 'b', 'g']
let annotationSeq = 0
const newAnnotationId = () => `a${Date.now().toString(36)}${(annotationSeq++).toString(36)}`
/** 복사한 것. 페이지를 옮겨도 남아 있어 다른 런 맵에도 붙여넣을 수 있다. */
let clipboard: { kind: 'annotations'; items: RunMapAnnotation[] } | { kind: 'ts'; id: string } | null = null
const PASTE_OFFSET = 24
/** 이 칸이 TS(스텝 · 런 구성)를 고치나. 맵 배치 · 주석만 고치는 칸이 아니다. */
const touchesTs = (change: Change): boolean =>
  change.kind === 'many' ? change.changes.some(touchesTs) : change.kind !== 'board'
/** 고른 것. 하나면 손잡이를 띄우고, 여럿이면(영역 끌기 · Shift 누르기) 함께 옮기고 지우고 복사한다. */
type Chosen = { items: string[]; frames: string[] }
const NOTHING: Chosen = { items: [], frames: [] }
const NO_MARKS: ReadonlySet<string> = new Set()
/**
 * 영역 끌기로 고를 만큼 겹쳤는가. 끄는 영역이 [item] 넓이의 30% 이상을 덮으면 고른다. 통째로 넣어야 하면 큰 프레임 ·
 * 묶음 상자를 고르기 힘들고, 조금만 걸쳐도 고르면 옆의 것까지 딸려 온다.
 */
const MARQUEE_COVER = 0.3
function coveredEnough(marquee: Box, raw: Box): boolean {
  // 곧은 화살표처럼 높이 · 너비가 0 인 것은 선 굵기만큼 두께를 준다. 0 이면 겹친 넓이가 늘 0 이다.
  const item = { x: raw.x - (raw.w < 8 ? 4 : 0), y: raw.y - (raw.h < 8 ? 4 : 0), w: Math.max(raw.w, 8), h: Math.max(raw.h, 8) }
  const w = Math.min(marquee.x + marquee.w, item.x + item.w) - Math.max(marquee.x, item.x)
  const h = Math.min(marquee.y + marquee.h, item.y + item.h) - Math.max(marquee.y, item.y)
  if (w <= 0 || h <= 0) return false
  // 넓이가 거의 없는 것(곧은 화살표 · 가로줄 그림)은 걸치기만 해도 고른다.
  const area = Math.max(item.w, 1) * Math.max(item.h, 1)
  return area < 400 || (w * h) / area >= MARQUEE_COVER
}
/** 묶음 상자의 가장 작은 크기. 누르기만 해도 이 크기로 생긴다. */
const SECTION_MIN = { w: 320, h: 200 }
const unionOf = (boxes: Box[]): Box | null => {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
}
const inside = (box: Box, p: { x: number; y: number }) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h

function RunMapPage({ projectId, runId }: { projectId: string; runId: string }) {
  const { t } = useI18n()
  const m = t.scenarios.map
  const lockCopy = t.scenarios.botLock
  const navigate = useNavigate()

  // 맵 저장은 모아서 한다. 저장이 걸려 있는 동안은 서버에서 다시 읽은 맵으로 내 화면을 덮지 않는다.
  const saveTimer = useRef<number | null>(null)
  const saving = useRef(false)
  const data = useRunMapData(projectId, runId, () => saveTimer.current !== null || saving.current)
  const { scenarios, map, setMap, drafts, setDrafts, order, setOrder } = data

  // Artel Bot 이 이 런을 고치는 동안은 TS 를 고치지 못한다(ARTEL-1265). 맵 배치 · 메모 · 도형은 그대로 쓴다.
  const lock = useRunLock(projectId, runId)
  const botLocked = lock.locked
  const botLockedRef = useRef(botLocked)
  useEffect(() => {
    botLockedRef.current = botLocked
  })
  // 풀리면 AI 가 고친 것을 다시 읽는다. 저장 알림(TEST_RUNS)도 오지만, 결과가 없던 턴은 알림이 없다.
  const wasLocked = useRef(false)
  useEffect(() => {
    if (wasLocked.current && !botLocked) void data.reload(undefined, true)
    wasLocked.current = botLocked
  }, [botLocked, data])

  const [view, setView] = useState<View>({ x: 10, y: 64, k: 0.9 })
  const [tool, setTool] = useState<RunMapTool>('select')
  // 스페이스를 누르고 있는 동안만 손 도구. 떼면 원래 도구로 돌아간다.
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const activeTool: RunMapTool = spaceHeld ? 'hand' : tool
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const [picked, setPicked] = useState<{ id: string; step: number | null } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [hover, setHover] = useState<{ id: string; index: number; rect: DOMRect } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: ContextMenuItem[] } | null>(null)
  const [importFor, setImportFor] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Chosen>(NOTHING)
  const selectedItem = chosen.items.length === 1 && chosen.frames.length === 0 ? chosen.items[0] : null
  const setSelectedItem = useCallback((id: string | null) => setChosen(id === null ? NOTHING : { items: [id], frames: [] }), [])
  const marks = useMemo(
    () => (chosen.items.length + chosen.frames.length > 1 ? new Set([...chosen.items, ...chosen.frames]) : NO_MARKS),
    [chosen],
  )
  const [marquee, setMarquee] = useState<Box | null>(null)
  /** 끄는 스텝의 표(화면 좌표)와 놓을 자리(캔버스 좌표). */
  const [stepDrag, setStepDrag] = useState<{
    cx: number
    cy: number
    label: string
    source: { id: string; start: number; end: number }
    target: { id: string; before: number; x: number; y: number } | null
  } | null>(null)
  /** 방금 내려놓은 스텝. 내려앉는 애니메이션이 끝나면 지운다. */
  const [landed, setLanded] = useState<{ id: string; from: number; to: number } | null>(null)
  useEffect(() => {
    if (landed === null) return undefined
    const timer = window.setTimeout(() => setLanded(null), 500)
    return () => window.clearTimeout(timer)
  }, [landed])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [scene, setScene] = useState<string | null>(null)
  const [z, setZ] = useState<Record<string, number>>({})
  const [history, setHistory] = useState<History<Change>>(emptyHistory)
  const [toast, setToast] = useState<{ text: string; undo: boolean } | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const interaction = useRef<Interaction | null>(null)
  const mapRef = useRef(map)
  useEffect(() => {
    mapRef.current = map
  })

  // ── 자리: 저장된 자리가 없으면 런 순서대로 자동 배치 ──
  const autoPlaced = useMemo(
    () => autoLayout(scenarios.map((s) => ({ id: s.id, height: frameHeight(s.steps.length, map.layout[s.id]?.folded ?? false) }))),
    [scenarios, map.layout],
  )
  const frameOf = useCallback(
    (id: string): RunMapFrame => map.layout[id] ?? { ...(autoPlaced.get(id) ?? { x: 20, y: 20 }), folded: false },
    [map.layout, autoPlaced],
  )
  const position = useCallback((id: string) => order.indexOf(id) + 1, [order])

  // ── 알림 ──
  const toastTimer = useRef<number | null>(null)
  const say = useCallback((text: string, undo = false) => {
    setToast({ text, undo })
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  // ── 맵 저장(배치 · 주석) ──
  const flushRef = useRef<() => Promise<void>>(async () => {})
  const flush = useCallback(async () => {
    saveTimer.current = null
    if (saving.current) {
      // 앞 저장이 끝나면 그 버전 위에 다시 보낸다.
      saveTimer.current = window.setTimeout(() => void flushRef.current(), SAVE_DELAY_MS)
      return
    }
    saving.current = true
    const sent = mapRef.current
    try {
      const saved = await saveRunMap(projectId, runId, sent)
      // 보내는 사이 고친 것은 남기고 버전과 이름만 받는다.
      setMap((current) => ({ ...current, version: saved.version, authors: saved.authors }))
      mapRef.current = { ...mapRef.current, version: saved.version, authors: saved.authors }
    } catch (error) {
      if (error instanceof StaleRunMapError) {
        const latest = await getRunMap(projectId, runId).catch(() => null)
        if (latest !== null) {
          setMap(latest)
          mapRef.current = latest
        }
        say(m.toast.stale)
      } else say(m.toast.saveFailed)
    } finally {
      saving.current = false
    }
  }, [projectId, runId, setMap, say, m.toast.stale, m.toast.saveFailed])
  useEffect(() => {
    flushRef.current = flush
  })
  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
  }, [flush])
  // 떠날 때 모아 둔 저장이 있으면 바로 보낸다.
  useEffect(() => () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      void saveRunMap(projectId, runId, mapRef.current).catch(() => {})
    }
  }, [projectId, runId])

  // ── 바꾸기: 세 저장소. 되돌리기 칸에 앞 · 뒤를 함께 남긴다 ──
  const reload = data.reload
  const applyBoard = useCallback((board: Board) => {
    setMap((current) => ({ ...current, ...board }))
    mapRef.current = { ...mapRef.current, ...board }
    scheduleSave()
  }, [setMap, scheduleSave])
  const applyDraft = useCallback(async (id: string, draft: ScenarioDraft) => {
    setDrafts((current) => ({ ...current, [id]: draft }))
    try {
      await updateScenario(Number(id), draft)
    } catch (error) {
      say(isRunLocked(error) ? lockCopy.blocked : m.toast.saveFailed)
      void reload(undefined, true)
    }
  }, [setDrafts, say, m.toast.saveFailed, lockCopy.blocked, reload])
  const applyOrder = useCallback(async (ids: string[]) => {
    setOrder(ids)
    try {
      await setRunScenarios(projectId, runId, ids)
    } catch (error) {
      say(isRunLocked(error) ? lockCopy.blocked : m.toast.saveFailed)
      void reload(undefined, true)
    }
  }, [projectId, runId, setOrder, say, m.toast.saveFailed, lockCopy.blocked, reload])
  const apply = useCallback(function applyChange(change: Change) {
    if (change.kind === 'many') change.changes.forEach(applyChange)
    else if (change.kind === 'board') applyBoard(change.board)
    else if (change.kind === 'scenario') void applyDraft(change.id, change.draft)
    else void applyOrder(change.ids)
  }, [applyBoard, applyDraft, applyOrder])

  const currentBoard = (): Board => ({ layout: mapRef.current.layout, annotations: mapRef.current.annotations })
  const commitBoard = useCallback((before: Board, after: Board, label: string) => {
    setHistory((h) => record(h, { label, before: { kind: 'board', board: before }, after: { kind: 'board', board: after } }))
    applyBoard(after)
    say(label, true)
  }, [applyBoard, say])
  /** Artel Bot 이 고치는 중이면 TS 를 고치지 않고 알린다. 막았으면 true. */
  const blockedByBot = useCallback(() => {
    if (!botLockedRef.current) return false
    say(lockCopy.blocked)
    return true
  }, [say, lockCopy.blocked])
  const commitDraft = useCallback((id: string, next: ScenarioDraft, label: string) => {
    const before = drafts[id]
    if (before === undefined || blockedByBot()) return
    setHistory((h) => record(h, { label, before: { kind: 'scenario', id, draft: before }, after: { kind: 'scenario', id, draft: next } }))
    void applyDraft(id, next)
    say(label, true)
  }, [drafts, applyDraft, say, blockedByBot])

  // 되돌리기 · 다시 하기도 TS 를 고치는 칸이면 잠긴 동안 막는다. 맵 배치 · 주석만 고치는 칸은 된다.
  const undo = useCallback(() => {
    const result = undoHistory(history)
    if (result === null) return
    if (touchesTs(result.entry.before) && blockedByBot()) return
    setHistory(result.history)
    apply(result.entry.before)
    say(m.toast.undone)
  }, [history, apply, say, m.toast.undone, blockedByBot])
  const redo = useCallback(() => {
    const result = redoHistory(history)
    if (result === null) return
    if (touchesTs(result.entry.after) && blockedByBot()) return
    setHistory(result.history)
    apply(result.entry.after)
    say(m.toast.redone)
  }, [history, apply, say, m.toast.redone, blockedByBot])

  // ── TS · 스텝 편집 ──
  const pick = useCallback((id: string, step: number | null = null) => {
    setPicked({ id, step })
    setDrawerOpen(true)
  }, [])
  const addStep = useCallback((id: string, at?: number) => {
    const draft = drafts[id]
    if (draft === undefined) return
    const index = at ?? draft.steps.length
    const steps = [...draft.steps]
    steps.splice(index, 0, createHumanStep())
    commitDraft(id, { ...draft, steps }, m.toast.stepAdded(position(id)))
    pick(id, index)
  }, [drafts, commitDraft, m.toast, position, pick])
  const moveStep = useCallback((id: string, index: number, delta: number) => {
    const draft = drafts[id]
    const target = index + delta
    if (draft === undefined || target < 0 || target >= draft.steps.length) return
    const steps = [...draft.steps]
    ;[steps[index], steps[target]] = [steps[target], steps[index]]
    commitDraft(id, { ...draft, steps }, m.toast.stepMoved(index + 1))
    pick(id, target)
  }, [drafts, commitDraft, m.toast, pick])
  /** 서랍에서 끈 스텝 범위를 [before] 순번 앞으로. */
  const moveSteps = useCallback((id: string, start: number, end: number, before: number) => {
    const draft = drafts[id]
    if (draft === undefined) return
    const steps = moveRange(draft.steps, start, end, before)
    if (steps === null) return
    commitDraft(id, { ...draft, steps }, m.toast.stepMoved(start + 1))
    pick(id, before > end ? before - (end - start + 1) : before)
  }, [drafts, commitDraft, m.toast, pick])
  /** [fromId] 의 [start]..[end] 스텝을 다른 TS [toId] 의 [before] 앞으로. 두 TS 가 한 번에 되돌아간다. */
  const moveStepsAcross = useCallback((fromId: string, start: number, end: number, toId: string, before: number) => {
    const from = drafts[fromId]
    const to = drafts[toId]
    if (from === undefined || to === undefined || blockedByBot()) return
    const block = from.steps.slice(start, end + 1)
    const nextFrom = { ...from, steps: [...from.steps.slice(0, start), ...from.steps.slice(end + 1)] }
    const toSteps = [...to.steps]
    toSteps.splice(before, 0, ...block)
    const nextTo = { ...to, steps: toSteps }
    const label = m.toast.stepsMovedTo(block.length, position(toId))
    setHistory((h) => record(h, {
      label,
      before: { kind: 'many', changes: [{ kind: 'scenario', id: fromId, draft: from }, { kind: 'scenario', id: toId, draft: to }] },
      after: { kind: 'many', changes: [{ kind: 'scenario', id: fromId, draft: nextFrom }, { kind: 'scenario', id: toId, draft: nextTo }] },
    }))
    void applyDraft(fromId, nextFrom)
    void applyDraft(toId, nextTo)
    say(label, true)
    pick(toId, before)
  }, [drafts, applyDraft, say, pick, position, m.toast, blockedByBot])
  const deleteStep = useCallback((id: string, index: number) => {
    const draft = drafts[id]
    if (draft === undefined) return
    commitDraft(id, { ...draft, steps: draft.steps.filter((_, i) => i !== index) }, m.toast.stepDeleted(index + 1))
    setPicked({ id, step: null })
  }, [drafts, commitDraft, m.toast])
  /** 고른 순서대로(같은 TC 가 여러 번 올 수 있다) 스텝 [at] 자리에 끼운다. */
  const importTcs = useCallback((id: string, caseIds: string[], at: number, steps: Map<string, string>) => {
    const draft = drafts[id]
    if (draft === undefined || caseIds.length === 0) return
    const added = caseIds.map((caseId) => ({ ...createEmptyStep(), action: steps.get(caseId) ?? '', case_id: Number(caseId), step_source: 'CASE' as const, step_kind: 'ACTION' as const }))
    const index = Math.max(0, Math.min(at, draft.steps.length))
    const next = [...draft.steps]
    next.splice(index, 0, ...added)
    commitDraft(id, { ...draft, steps: next }, m.toast.tcsImported(position(id), added.length))
    pick(id, index)
  }, [drafts, commitDraft, m.toast, position, pick])

  const changeOrder = useCallback((next: string[], label: string) => {
    if (blockedByBot()) return
    setHistory((h) => record(h, { label, before: { kind: 'order', ids: order }, after: { kind: 'order', ids: next } }))
    void applyOrder(next)
    say(label, true)
  }, [order, applyOrder, say, blockedByBot])
  const createTs = useCallback(async (at: { x: number; y: number }, copyOf?: string) => {
    if (blockedByBot()) return
    try {
      const source = copyOf === undefined ? undefined : drafts[copyOf]
      const draft: ScenarioDraft = source !== undefined
        ? { ...source, title: m.copyTitle(source.title) }
        : { title: m.newScenarioTitle, description: '', steps: [], execution_mode: 'ORDERED' }
      const id = String(await createTestScenario(Number(projectId)))
      await updateScenario(Number(id), draft)
      setDrafts((current) => ({ ...current, [id]: draft }))
      const next = [...order, id]
      applyBoard({ ...currentBoard(), layout: { ...mapRef.current.layout, [id]: { x: at.x, y: at.y, folded: false } } })
      changeOrder(next, copyOf === undefined ? m.toast.tsCreated(next.length) : m.toast.tsDuplicated(position(copyOf)))
      setZ((current) => ({ ...current, [id]: Math.max(1, ...Object.values(current)) + 1 }))
      if (copyOf === undefined) setImportFor(id)
      // 복제본은 원본 바로 옆에 놓고 골라 둔다. 원본에 겹쳐 놓으면 복제가 안 된 것처럼 보인다.
      else setPicked({ id, step: null })
    } catch {
      say(m.toast.saveFailed)
    }
  }, [drafts, m, projectId, setDrafts, order, applyBoard, changeOrder, position, say, blockedByBot])
  const removeTs = useCallback((id: string) => {
    if (picked?.id === id) {
      setPicked(null)
      setDrawerOpen(false)
    }
    changeOrder(order.filter((x) => x !== id), m.toast.tsRemoved(position(id)))
  }, [picked, order, changeOrder, m.toast, position])
  const toggleFold = useCallback((id: string) => {
    const before = currentBoard()
    const frame = frameOf(id)
    commitBoard(before, { ...before, layout: { ...before.layout, [id]: { ...frame, folded: !frame.folded } } }, frame.folded ? m.frame.unfold : m.frame.fold)
  }, [frameOf, commitBoard, m.frame])
  const layOut = useCallback((foldAll?: boolean) => {
    const before = currentBoard()
    const folded = (id: string) => foldAll ?? (before.layout[id]?.folded ?? false)
    const placed = autoLayout(scenarios.map((s) => ({ id: s.id, height: frameHeight(s.steps.length, folded(s.id)) })))
    const layout: Record<string, RunMapFrame> = {}
    for (const s of scenarios) layout[s.id] = { ...placed.get(s.id)!, folded: folded(s.id) }
    commitBoard(before, { ...before, layout }, foldAll === undefined ? m.toast.laidOut : foldAll ? m.foldAll : m.unfoldAll)
    setZ({})
  }, [scenarios, commitBoard, m])

  // ── 주석 ──
  const addAnnotation = useCallback((annotation: RunMapAnnotation, label: string, edit = false) => {
    const before = currentBoard()
    commitBoard(before, { ...before, annotations: [...before.annotations, annotation] }, label)
    setSelectedItem(annotation.id)
    if (edit) setEditingItem(annotation.id)
  }, [commitBoard, setSelectedItem])
  const updateAnnotation = useCallback((id: string, patch: (a: RunMapAnnotation) => RunMapAnnotation, label: string) => {
    const before = currentBoard()
    commitBoard(before, { ...before, annotations: before.annotations.map((a) => (a.id === id ? patch(a) : a)) }, label)
  }, [commitBoard])
  const deleteAnnotation = useCallback((id: string) => {
    const before = currentBoard()
    commitBoard(before, { ...before, annotations: before.annotations.filter((a) => a.id !== id) }, m.toast.annotationDeleted)
    setSelectedItem(null)
  }, [commitBoard, m.toast.annotationDeleted, setSelectedItem])
  /**
   * 고른 것을 지운다. 주석은 맵에서 지우고, TS 는 런에서 뺀다(TS 자체는 남는다). 되돌리기 한 번에 함께 돌아온다.
   * 지운 뒤에는 고른 것과 그 영역을 비운다.
   */
  const deleteChosen = useCallback((target: Chosen) => {
    const gone = new Set(target.items)
    const removed = new Set(target.frames)
    const before = currentBoard()
    const after = { ...before, annotations: before.annotations.filter((a) => !gone.has(a.id)) }
    const nextOrder = order.filter((id) => !removed.has(id))
    const label = m.toast.deletedMany(target.items.length + target.frames.length)
    const changes: { before: Change[]; after: Change[] } = { before: [], after: [] }
    if (gone.size > 0) {
      changes.before.push({ kind: 'board', board: before })
      changes.after.push({ kind: 'board', board: after })
    }
    if (removed.size > 0) {
      changes.before.push({ kind: 'order', ids: order })
      changes.after.push({ kind: 'order', ids: nextOrder })
    }
    if (changes.after.length === 0) return
    setHistory((h) => record(h, { label, before: { kind: 'many', changes: changes.before }, after: { kind: 'many', changes: changes.after } }))
    if (gone.size > 0) applyBoard(after)
    if (removed.size > 0) {
      void applyOrder(nextOrder)
      if (picked !== null && removed.has(picked.id)) {
        setPicked(null)
        setDrawerOpen(false)
      }
    }
    setChosen(NOTHING)
    setSelectedItem(null)
    say(label, true)
  }, [order, applyBoard, applyOrder, picked, say, m.toast, setSelectedItem])
  const renameTs = useCallback((id: string, title: string | null) => {
    setRenaming(null)
    const draft = drafts[id]
    if (title === null || title === '' || draft === undefined || draft.title === title) return
    commitDraft(id, { ...draft, title }, m.toast.renamed)
  }, [drafts, commitDraft, m.toast.renamed])
  const editText = useCallback((id: string, text: string) => {
    setEditingItem(null)
    const current = mapRef.current.annotations.find((a) => a.id === id)
    if (current === undefined || !hasText(current) || (current.text ?? '') === text) return
    // 메모 · 글은 비우면 찾을 수 없게 되므로 한 칸을 남긴다. 도형 안의 글 · 묶음 이름은 비워도 된다.
    const kept = text.length > 0 || current.type === 'rect' || current.type === 'ellipse' || current.type === 'section' ? text : ' '
    updateAnnotation(id, (a) => (hasText(a) ? { ...a, text: kept } : a), m.toast.annotationChanged)
  }, [updateAnnotation, m.toast.annotationChanged])

  // ── 색 ──
  /** 고른 것들에 색을 입힌다. 메모는 자기 넷 중 하나만 받고(기본 · 빨강은 건너뛴다), 나머지는 다섯 색과 기본. */
  const paint = useCallback((ids: string[], color: ShapeColor | 'none') => {
    const targets = new Set(ids)
    const before = currentBoard()
    const annotations = before.annotations.map((a): RunMapAnnotation => {
      if (!targets.has(a.id)) return a
      if (a.type === 'note') return color === 'none' || color === 'r' ? a : { ...a, color }
      if (color === 'none') {
        const plain = { ...a }
        delete plain.color
        return plain
      }
      return { ...a, color }
    })
    commitBoard(before, { ...before, annotations }, m.toast.annotationChanged)
  }, [commitBoard, m.toast.annotationChanged])

  // ── 복사 · 붙여넣기 ──
  const sectionContents = useCallback((section: RunMapAnnotation) => {
    const box = boxOf(section)
    return {
      frames: scenarios.filter((s) => {
        const f = frameOf(s.id)
        return contains(box, { x: f.x, y: f.y, w: FRAME_W, h: frameHeight(s.steps.length, f.folded) })
      }).map((s) => s.id),
      items: mapRef.current.annotations.filter((a) => a.id !== section.id && contains(box, boxOf(a))).map((a) => a.id),
    }
  }, [scenarios, frameOf])
  const copyAnnotations = useCallback((ids: string[]) => {
    const picked = mapRef.current.annotations.filter((a) => ids.includes(a.id))
    if (picked.length === 0) return
    // 묶음 상자는 안에 든 주석까지 함께 복사한다.
    const inside = new Set(picked.flatMap((a) => (a.type === 'section' ? sectionContents(a).items : [])))
    clipboard = { kind: 'annotations', items: mapRef.current.annotations.filter((a) => ids.includes(a.id) || inside.has(a.id)) }
    say(m.toast.copied)
  }, [sectionContents, say, m.toast.copied])
  const copyAnnotation = useCallback((id: string) => copyAnnotations([id]), [copyAnnotations])
  const copyTs = useCallback((id: string) => {
    clipboard = { kind: 'ts', id }
    say(m.toast.copied)
  }, [say, m.toast.copied])
  const paste = useCallback((at: { x: number; y: number } | null) => {
    const copied = clipboard
    if (copied === null) return
    if (copied.kind === 'ts') {
      if (drafts[copied.id] === undefined) return
      const f = frameOf(copied.id)
      void createTs(at ?? { x: f.x + FRAME_W + PASTE_OFFSET, y: f.y }, copied.id)
      return
    }
    const boxes = copied.items.map(boxOf)
    const left = Math.min(...boxes.map((b) => b.x))
    const top = Math.min(...boxes.map((b) => b.y))
    const dx = at === null ? PASTE_OFFSET : at.x - left
    const dy = at === null ? PASTE_OFFSET : at.y - top
    const pasted = copied.items.map((a) => {
      const copy: RunMapAnnotation = { ...moved(a, dx, dy), id: newAnnotationId() }
      delete copy.createdBy
      delete copy.createdAt
      return copy
    })
    const before = currentBoard()
    commitBoard(before, { ...before, annotations: [...before.annotations, ...pasted] }, m.toast.pasted)
    setChosen({ items: pasted.map((a) => a.id), frames: [] })
    // 같은 자리에 또 붙이면 겹치지 않게, 다음 붙여넣기는 붙인 것에서 한 칸 더 옮긴다.
    if (at === null) clipboard = { kind: 'annotations', items: pasted }
  }, [drafts, frameOf, createTs, commitBoard, m.toast.pasted])
  /** 고른 것 전체를 둘러싼 영역. 이 안을 끌면 고른 것을 옮긴다. */
  const chosenBounds = unionOf([
    ...map.annotations.filter((a) => chosen.items.includes(a.id)).map(boxOf),
    ...chosen.frames.map((id) => {
      const f = frameOf(id)
      return { x: f.x, y: f.y, w: FRAME_W, h: frameHeight(scenarios.find((sc) => sc.id === id)?.steps.length ?? 0, f.folded) }
    }),
  ])
  /** 고른 묶음 상자는 안에 든 것도 함께 옮긴다. */
  const withSectionContents = (c: Chosen): Chosen => {
    const items = new Set(c.items)
    const frames = new Set(c.frames)
    for (const a of mapRef.current.annotations) {
      if (a.type !== 'section' || !items.has(a.id)) continue
      const inner = sectionContents(a)
      inner.items.forEach((x) => items.add(x))
      inner.frames.forEach((x) => frames.add(x))
    }
    return { items: [...items], frames: [...frames] }
  }
  /** 고른 것 여럿을 함께 옮길 때 [id] 와 같이 움직일 나머지. */
  const carryOf = (id: string): Chosen => (marks.has(id)
    ? { items: chosen.items.filter((x) => x !== id), frames: chosen.frames.filter((x) => x !== id) }
    : NOTHING)

  // ── 캔버스 좌표 ──
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k }
  }, [view])
  const bounds = useMemo(() => {
    let w = 0
    let h = 0
    for (const s of scenarios) {
      const f = frameOf(s.id)
      w = Math.max(w, f.x + FRAME_W + 20)
      h = Math.max(h, f.y + frameHeight(s.steps.length, f.folded) + 20)
    }
    // 주석도 전체 보기 · 미니맵에 든다. 메모가 프레임보다 오른쪽 · 아래에 있으면 안 보이게 된다.
    for (const a of map.annotations) {
      const box = boxOf(a)
      w = Math.max(w, box.x + box.w + 20)
      h = Math.max(h, box.y + box.h + 20)
    }
    return { w: Math.max(w, 200), h: Math.max(h, 200) }
  }, [scenarios, frameOf, map.annotations])
  const fit = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    const avail = rect.width - (drawerOpen ? 580 : 0)
    const k = Math.max(MIN_K, Math.min(1, (avail - 30) / bounds.w, (rect.height - 80) / bounds.h))
    setView({ k, x: 10, y: 64 })
  }, [bounds, drawerOpen])
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor))
      return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) }
    })
  }, [])
  useEffect(() => {
    const stage = stageRef.current
    if (stage === null) return undefined
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [data.status])
  // wheel 은 page 스크롤을 막아야 해서 passive 가 아니어야 한다. React 의 onWheel 로는 못 하므로 손으로 단다.
  useEffect(() => {
    const stage = stageRef.current
    if (stage === null) return undefined
    function onWheel(event: WheelEvent) {
      if ((event.target as HTMLElement).closest('.rm-drawer')) return
      event.preventDefault()
      const rect = stage!.getBoundingClientRect()
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.1 : 1 / 1.1)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [zoomAt, data.status])

  // ── 끌기: 도구에 따라 화면 이동 · 프레임/주석 이동 · 그리기 ──
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // 가운데 단추는 어느 도구에서든 화면을 잡는다.
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target as HTMLElement
    // 단추는 제 일을 한다. 스텝 점도 단추지만 끌어 옮길 수 있어 여기서 받는다.
    if (target.closest('button:not([data-step]), .rm-toolbar, .rm-ctrls, .rm-drawer, [contenteditable="true"]')) return
    const w = toWorld(event.clientX, event.clientY)
    const capture = () => event.currentTarget.setPointerCapture(event.pointerId)
    const startPan = () => {
      interaction.current = { kind: 'pan', sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y }
      setPanning(true)
      capture()
    }
    if (activeTool === 'hand' || event.button === 1) return startPan()
    const tool = activeTool
    // 하나 만들면 선택 도구로 돌아간다. ⌘ · Alt 를 누르고 있으면 같은 도구로 이어 만든다.
    const repeat = event.metaKey || event.ctrlKey || event.altKey
    // 고른 주석의 손잡이: 상자는 크기, 화살표는 끝점 · 휘기.
    // 크기를 정하지 않은 메모 · 글은 그려진 크기에서 시작한다.
    const drawnBox = (a: RunMapAnnotation, el: HTMLElement): Box => {
      if ((a.type !== 'note' && a.type !== 'text') || a.w !== undefined) return boxOf(a)
      const rect = el.getBoundingClientRect()
      return { x: a.x, y: a.y, w: rect.width / view.k, h: rect.height / view.k }
    }
    const handle = target.closest<HTMLElement>('[data-handle]')
    const selection = handle?.closest<HTMLElement>('[data-selection]')
    const handled = selection ? mapRef.current.annotations.find((a) => a.id === selection.dataset.selection) : undefined
    if (handle && handled) {
      const name = handle.dataset.handle!
      interaction.current = name === 'p1' || name === 'p2' || name === 'c'
        ? { kind: 'bend', id: handled.id, handle: name, moved: false, before: currentBoard() }
        : { kind: 'resize', id: handled.id, handle: name as BoxHandle, from: drawnBox(handled, selection!), original: handled, moved: false, before: currentBoard() }
      capture()
      return
    }
    if (tool === 'note' || tool === 'text') {
      const id = newAnnotationId()
      addAnnotation(
        tool === 'note'
          ? { id, type: 'note', x: w.x - 90, y: w.y - 20, text: m.noteDefault, color: NOTE_COLORS[mapRef.current.annotations.length % 4] }
          : { id, type: 'text', x: w.x, y: w.y - 12, text: m.textDefault },
        m.toast.annotationAdded,
        true,
      )
      if (!repeat) setTool('select')
      return
    }
    if (tool === 'ts') {
      void createTs({ x: w.x - FRAME_W / 2, y: w.y - 20 })
      if (!repeat) setTool('select')
      return
    }
    if (tool === 'rect' || tool === 'ellipse' || tool === 'section' || tool === 'arrow' || tool === 'pen') {
      const id = newAnnotationId()
      const before = currentBoard()
      const annotation: RunMapAnnotation =
        tool === 'arrow' ? { id, type: 'arrow', x1: w.x, y1: w.y, x2: w.x, y2: w.y }
          : tool === 'pen' ? { id, type: 'pen', points: [[w.x, w.y], [w.x, w.y]] }
            : tool === 'section' ? { id, type: 'section', x: w.x, y: w.y, w: 0, h: 0, text: m.sectionDefault }
              : { id, type: tool, x: w.x, y: w.y, w: 0, h: 0 }
      // 끄는 동안 [mapRef] 위에서 크기를 바꾸므로, 시작할 때 그쪽에도 넣는다.
      mapRef.current = { ...mapRef.current, annotations: [...mapRef.current.annotations, annotation] }
      setMap((current) => ({ ...current, annotations: [...current.annotations, annotation] }))
      interaction.current = { kind: 'draw', id, ox: w.x, oy: w.y, before, repeat }
      capture()
      return
    }
    const startMarquee = (section: string | null) => {
      interaction.current = { kind: 'marquee', ox: w.x, oy: w.y, additive: event.shiftKey, section, box: { x: w.x, y: w.y, w: 0, h: 0 } }
      setMarquee({ x: w.x, y: w.y, w: 0, h: 0 })
      capture()
    }
    const item = target.closest<HTMLElement>('[data-annotation]')
    // 묶음 상자 안 빈 곳을 끌면 상자를 바로 옮긴다. ⌘ · Alt 를 누른 채 끌면 상자 안에서 영역으로 고른다.
    // 고른 것의 영역 안이면 고른 것을 옮긴다.
    const inChosen = !event.shiftKey && chosenBounds !== null && inside(chosenBounds, w)
    if (item && item.classList.contains('rma-section') && !inChosen && repeat) return startMarquee(item.dataset.annotation!)
    if (item && item.classList.contains('rma-section') && inChosen) {
      interaction.current = { kind: 'item', id: '', lastX: w.x, lastY: w.y, moved: false, before: currentBoard(), carry: withSectionContents(chosen) }
      capture()
      return
    }
    if (item) {
      const id = item.dataset.annotation!
      if (event.shiftKey) {
        setChosen((c) => (c.items.includes(id) ? { ...c, items: c.items.filter((x) => x !== id) } : { ...c, items: [...c.items, id] }))
        return
      }
      const one = mapRef.current.annotations.find((a) => a.id === id)
      const group = carryOf(id)
      if (!marks.has(id)) setSelectedItem(id)
      const inside = one?.type === 'section' ? sectionContents(one) : NOTHING
      const carry = { items: [...group.items, ...inside.items], frames: [...group.frames, ...inside.frames] }
      interaction.current = { kind: 'item', id, lastX: w.x, lastY: w.y, moved: false, before: currentBoard(), carry }
      capture()
      return
    }
    const head = target.closest<HTMLElement>('[data-drag-frame]')
    if (head) {
      const id = head.dataset.dragFrame!
      if (event.shiftKey) {
        setChosen((c) => (c.frames.includes(id) ? { ...c, frames: c.frames.filter((x) => x !== id) } : { ...c, frames: [...c.frames, id] }))
        return
      }
      if (marks.has(id)) {
        // 여럿 고른 것 가운데 하나를 끌면 모두 함께 옮긴다. 주석이 아니므로 id 는 비워 둔다.
        interaction.current = { kind: 'item', id: '', lastX: w.x, lastY: w.y, moved: false, before: currentBoard(), carry: chosen }
        capture()
        return
      }
      const frame = frameOf(id)
      setZ((current) => ({ ...current, [id]: Math.max(1, ...Object.values(current)) + 1 }))
      const rename = target.closest('[data-rename]') !== null
      interaction.current = { kind: 'frame', id, sx: event.clientX, sy: event.clientY, ox: frame.x, oy: frame.y, moved: false, before: currentBoard(), rename }
      capture()
      return
    }
    // 스텝: 끌면 순서를 바꾸고(다른 TS 로도), 끌지 않고 떼면 서랍을 연다.
    const stepEl = target.closest<HTMLElement>('.rm-world [data-step]')
    if (stepEl) {
      const [id, raw] = stepEl.dataset.step!.split('|')
      const index = Number(raw)
      const s = scenarios.find((one) => one.id === id)
      const tc = s?.steps[index]?.tc ?? null
      let start = index
      let end = index
      if (event.altKey && tc !== null && s !== undefined) {
        while (start > 0 && s.steps[start - 1].tc === tc) start -= 1
        while (end < s.steps.length - 1 && s.steps[end + 1].tc === tc) end += 1
      }
      const label = start === end ? m.drag.step(index + 1) : m.drag.tc(tc ?? 0, end - start + 1)
      interaction.current = { kind: 'step', id, index, start, end, sx: event.clientX, sy: event.clientY, moved: false, label, target: null }
      capture()
      return
    }
    // 고른 것의 영역 안 빈 곳(고른 프레임 몸통 포함)을 끌면 영역 끌기가 아니라 고른 것을 옮긴다.
    if (!event.shiftKey && chosenBounds !== null && inside(chosenBounds, w)) {
      interaction.current = { kind: 'item', id: '', lastX: w.x, lastY: w.y, moved: false, before: currentBoard(), carry: withSectionContents(chosen) }
      capture()
      return
    }
    if (target.closest('[data-scene], .rmf')) {
      setChosen(NOTHING)
      return
    }
    // 빈 곳을 끌면 영역으로 여럿 고른다. 화면 이동은 스페이스 · 손 도구 · 가운데 단추.
    startMarquee(null)
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (stageRef.current !== null) lastPointer.current = toWorld(event.clientX, event.clientY)
    const now = interaction.current
    if (now === null) return
    if (now.kind === 'pan') {
      setView((v) => ({ ...v, x: now.ox + event.clientX - now.sx, y: now.oy + event.clientY - now.sy }))
      return
    }
    const w = toWorld(event.clientX, event.clientY)
    if (now.kind === 'step') {
      if (!now.moved && Math.hypot(event.clientX - now.sx, event.clientY - now.sy) < 5) return
      now.moved = true
      // 놓을 TS: 포인터 아래의 펼친 프레임 가운데 맨 위에 있는 것.
      const under = scenarios
        .map((sc) => ({ sc, f: frameOf(sc.id) }))
        .filter(({ sc, f }) => !f.folded && w.x >= f.x && w.x <= f.x + FRAME_W && w.y >= f.y && w.y <= f.y + frameHeight(sc.steps.length, false))
        .sort((a, b) => (z[b.sc.id] ?? 1) - (z[a.sc.id] ?? 1))[0]
      // 끌려 나간 TS 는 끄는 스텝을 뺀 모양으로 그려지므로, 그 모양에서 자리를 재고 원래 순번으로 되돌린다.
      const size = now.end - now.start + 1
      const own = under?.sc.id === now.id
      const slot = under === undefined ? null : dropSlot(under.sc.steps.length - (own ? size : 0), w.x - under.f.x, w.y - under.f.y - HEAD_H - 1)
      const before = slot === null ? 0 : own && slot.before > now.start ? slot.before + size : slot.before
      const rect = stageRef.current!.getBoundingClientRect()
      now.target = under === undefined || slot === null ? null : { id: under.sc.id, before, x: under.f.x + slot.x, y: under.f.y + HEAD_H + 1 + slot.y }
      setStepDrag({ cx: event.clientX - rect.left, cy: event.clientY - rect.top, label: now.label, source: { id: now.id, start: now.start, end: now.end }, target: now.target })
      return
    }
    if (now.kind === 'marquee') {
      now.box = { x: Math.min(now.ox, w.x), y: Math.min(now.oy, w.y), w: Math.abs(w.x - now.ox), h: Math.abs(w.y - now.oy) }
      setMarquee(now.box)
      return
    }
    if (now.kind === 'frame') {
      const dx = (event.clientX - now.sx) / view.k
      const dy = (event.clientY - now.sy) / view.k
      if (Math.abs(dx) + Math.abs(dy) > 3) now.moved = true
      const frame = frameOf(now.id)
      const next = { ...frame, x: now.ox + dx, y: now.oy + dy }
      setMap((current) => ({ ...current, layout: { ...current.layout, [now.id]: next } }))
      mapRef.current = { ...mapRef.current, layout: { ...mapRef.current.layout, [now.id]: next } }
      return
    }
    if (now.kind === 'item') {
      const dx = w.x - now.lastX
      const dy = w.y - now.lastY
      now.lastX = w.x
      now.lastY = w.y
      now.moved = true
      const carried = new Set([now.id, ...now.carry.items])
      const annotations = mapRef.current.annotations.map((a) => (carried.has(a.id) ? moved(a, dx, dy) : a))
      const layout = { ...mapRef.current.layout }
      for (const frameId of now.carry.frames) {
        const f = layout[frameId] ?? frameOf(frameId)
        layout[frameId] = { ...f, x: f.x + dx, y: f.y + dy }
      }
      setMap((current) => ({ ...current, annotations, layout }))
      mapRef.current = { ...mapRef.current, annotations, layout }
      return
    }
    if (now.kind === 'resize' || now.kind === 'bend') {
      now.moved = true
      const annotations = mapRef.current.annotations.map((a): RunMapAnnotation => {
        if (a.id !== now.id) return a
        if (now.kind === 'resize') return resized(now.original, now.from, dragBox(now.from, now.handle, w.x, w.y))
        if (a.type !== 'arrow') return a
        if (now.handle === 'p1') return { ...a, x1: w.x, y1: w.y }
        if (now.handle === 'p2') return { ...a, x2: w.x, y2: w.y }
        return { ...a, ...controlFor(a, w) }
      })
      setMap((current) => ({ ...current, annotations }))
      mapRef.current = { ...mapRef.current, annotations }
      return
    }
    const annotations = mapRef.current.annotations.map((a): RunMapAnnotation => {
      if (a.id !== now.id) return a
      if (a.type === 'arrow') return { ...a, x2: w.x, y2: w.y }
      if (a.type === 'pen') return { ...a, points: [...a.points, [w.x, w.y]] }
      if (a.type === 'rect' || a.type === 'ellipse' || a.type === 'section') return { ...a, x: Math.min(now.ox, w.x), y: Math.min(now.oy, w.y), w: Math.abs(w.x - now.ox), h: Math.abs(w.y - now.oy) }
      return a
    })
    setMap((current) => ({ ...current, annotations }))
    mapRef.current = { ...mapRef.current, annotations }
  }
  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const now = interaction.current
    interaction.current = null
    setPanning(false)
    if (now === null || now.kind === 'pan') return
    if (now.kind === 'step') {
      const dropAt = now.target
      setStepDrag(null)
      if (!now.moved) return pick(now.id, now.index)
      if (dropAt === null) return
      const size = now.end - now.start + 1
      if (dropAt.id === now.id) {
        if (dropAt.before >= now.start && dropAt.before <= now.end + 1) return
        moveSteps(now.id, now.start, now.end, dropAt.before)
        const at = dropAt.before > now.end ? dropAt.before - size : dropAt.before
        setLanded({ id: now.id, from: at, to: at + size - 1 })
      } else {
        moveStepsAcross(now.id, now.start, now.end, dropAt.id, dropAt.before)
        setLanded({ id: dropAt.id, from: dropAt.before, to: dropAt.before + size - 1 })
      }
      return
    }
    if (now.kind === 'marquee') {
      // 뗀 자리까지 넣는다. 마지막 move 가 오기 전에 떼는 경우가 있다.
      const end = toWorld(event.clientX, event.clientY)
      const box: Box = { x: Math.min(now.ox, end.x), y: Math.min(now.oy, end.y), w: Math.abs(end.x - now.ox), h: Math.abs(end.y - now.oy) }
      setMarquee(null)
      if (box === null || (box.w < 4 && box.h < 4)) {
        if (!now.additive) setChosen(now.section === null ? NOTHING : { items: [now.section], frames: [] })
        return
      }
      // 30% 이상 덮은 것을 고른다. 끌기를 시작한 묶음 상자는 빼고(상자 안에서 끄는 것은 안의 것을 고르려는 것이다).
      const items = mapRef.current.annotations
        .filter((a) => a.id !== now.section && coveredEnough(box, boxOf(a)))
        .map((a) => a.id)
      const frames = scenarios.filter((sc) => {
        const f = frameOf(sc.id)
        return coveredEnough(box, { x: f.x, y: f.y, w: FRAME_W, h: frameHeight(sc.steps.length, f.folded) })
      }).map((sc) => sc.id)
      setChosen((c) => (now.additive
        ? { items: [...new Set([...c.items, ...items])], frames: [...new Set([...c.frames, ...frames])] }
        : { items, frames }))
      return
    }
    const after = currentBoard()
    if (now.kind === 'frame') {
      if (now.moved) commitBoard(now.before, after, m.toast.frameMoved(position(now.id)))
      else if (now.rename) setRenaming(now.id)
      else pick(now.id)
      return
    }
    if (now.kind === 'item') {
      if (now.moved) commitBoard(now.before, after, m.toast.moved)
      return
    }
    if (now.kind === 'resize' || now.kind === 'bend') {
      if (now.moved) commitBoard(now.before, after, now.kind === 'resize' ? m.toast.resized : m.toast.annotationChanged)
      return
    }
    if (!now.repeat) setTool('select')
    // 묶음 상자는 가장 작은 크기 아래로 만들지 않는다. 누르기만 해도 그 크기로 생긴다.
    const sized = after.annotations.find((a) => a.id === now.id)
    if (sized?.type === 'section' && (sized.w < SECTION_MIN.w || sized.h < SECTION_MIN.h)) {
      const grown: RunMapAnnotation = { ...sized, w: Math.max(sized.w, SECTION_MIN.w), h: Math.max(sized.h, SECTION_MIN.h) }
      after.annotations = after.annotations.map((a) => (a.id === now.id ? grown : a))
      setMap((current) => ({ ...current, annotations: after.annotations }))
      mapRef.current = { ...mapRef.current, annotations: after.annotations }
    }
    // 그리기: 너무 작으면 실수로 누른 것으로 보고 버린다.
    const drawn = after.annotations.find((a) => a.id === now.id)
    const tiny = drawn === undefined
      || (drawn.type === 'arrow' && Math.hypot(drawn.x2 - drawn.x1, drawn.y2 - drawn.y1) < 8)
      || (drawn.type === 'pen' && drawn.points.length < 4)
      || ((drawn.type === 'rect' || drawn.type === 'ellipse' || drawn.type === 'section') && drawn.w < 8 && drawn.h < 8)
    if (tiny) {
      const annotations = after.annotations.filter((a) => a.id !== now.id)
      setMap((current) => ({ ...current, annotations }))
      mapRef.current = { ...mapRef.current, annotations }
    } else {
      commitBoard(now.before, after, m.toast.annotationAdded)
      setSelectedItem(now.id)
      // 묶음 상자는 그리자마자 이름을 쓰게 한다.
      if (drawn.type === 'section') setEditingItem(now.id)
    }
  }

  // ── 누르기 · 마우스 올리기 ──
  function onClick(event: React.MouseEvent) {
    const target = event.target as HTMLElement
    if (!target.closest('.rm-world')) return
    const step = target.closest<HTMLElement>('[data-step]')
    if (step) {
      const [id, index] = step.dataset.step!.split('|')
      pick(id, Number(index))
      return
    }
    const fold = target.closest<HTMLElement>('[data-fold]')
    if (fold) return toggleFold(fold.dataset.fold!)
    const add = target.closest<HTMLElement>('[data-add-step]')
    if (add) return addStep(add.dataset.addStep!)
    const imp = target.closest<HTMLElement>('[data-import-tcs]')
    if (imp) return setImportFor(imp.dataset.importTcs!)
    const open = target.closest<HTMLElement>('[data-open-editor]')
    if (open) return openEdit(open.dataset.openEditor!)
  }
  function onDoubleClick(event: React.MouseEvent) {
    // 메모 · 글 · 도형 · 묶음 상자는 두 번 누르면 글을 고친다(도형은 안에 글을 넣는다).
    // 누르는 동안 캔버스가 포인터를 잡고 있어서 event.target 은 캔버스다. 실제로 누른 자리에서 찾는다.
    const under = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    const item = under?.closest<HTMLElement>('[data-annotation]')
    const one = item ? mapRef.current.annotations.find((a) => a.id === item.dataset.annotation) : undefined
    if (one !== undefined && hasText(one)) return setEditingItem(one.id)
    // TS 프레임을 두 번 누르면 TC 가져오기를 연다. 이름 · 단추 · 스텝은 각자 하는 일이 있어 뺀다.
    const frame = under?.closest<HTMLElement>('[data-scenario-id]')
    if (frame && !under?.closest('button, input, [data-rename], [data-step]')) {
      setDrawerOpen(false)
      setImportFor(frame.dataset.scenarioId!)
    }
  }
  function onMouseOver(event: React.MouseEvent) {
    const target = event.target as HTMLElement
    const sceneName = target.closest<HTMLElement>('[data-scene]')?.dataset.scene
    const nextScene = sceneName && sceneName.length > 0 ? sceneName : null
    if (nextScene !== scene) setScene(nextScene)
    const step = target.closest<HTMLElement>('.rm-world [data-step]')
    if (!step || interaction.current !== null) {
      if (hover !== null) setHover(null)
      return
    }
    const [id, index] = step.dataset.step!.split('|')
    if (hover?.id !== id || hover.index !== Number(index)) setHover({ id, index: Number(index), rect: step.getBoundingClientRect() })
  }

  // ── 우클릭: 누른 자리에 따라 다르다 ──
  function onContextMenu(event: React.MouseEvent) {
    const target = event.target as HTMLElement
    if (target.closest('.rm-drawer, .rm-toolbar, .rm-ctrls')) return
    event.preventDefault()
    const w = toWorld(event.clientX, event.clientY)
    const at = { x: event.clientX, y: event.clientY }
    const step = target.closest<HTMLElement>('.rm-world [data-step]')
    const item = target.closest<HTMLElement>('[data-annotation]')
    const frame = target.closest<HTMLElement>('[data-scenario-id]')
    if (step) {
      const [id, raw] = step.dataset.step!.split('|')
      const index = Number(raw)
      const count = drafts[id]?.steps.length ?? 0
      setMenu({ ...at, label: m.menu.step(position(id), index + 1), items: [
        { label: m.menu.insertBefore, onSelect: () => addStep(id, index) },
        { label: m.menu.insertAfter, onSelect: () => addStep(id, index + 1) },
        { label: m.menu.moveBack, onSelect: () => moveStep(id, index, -1), disabled: index === 0 },
        { label: m.menu.moveForward, onSelect: () => moveStep(id, index, 1), disabled: index >= count - 1 },
        { label: m.menu.openEditor, onSelect: () => openEdit(id) },
        { label: m.menu.deleteStep, onSelect: () => deleteStep(id, index), danger: true },
      ] })
    } else if (item) {
      const id = item.dataset.annotation!
      const annotation = mapRef.current.annotations.find((a) => a.id === id)
      setSelectedItem(id)
      const toFront = () => {
        const before = currentBoard()
        const one = before.annotations.find((a) => a.id === id)
        if (one) commitBoard(before, { ...before, annotations: [...before.annotations.filter((a) => a.id !== id), one] }, m.toast.moved)
      }
      setMenu({ ...at, label: m.menu.annotation, items: [
        ...(annotation?.type === 'note'
          ? [{ label: m.menu.changeColor, onSelect: () => updateAnnotation(id, (a) => (a.type === 'note' ? { ...a, color: NOTE_COLORS[(NOTE_COLORS.indexOf(a.color) + 1) % 4] } : a), m.toast.annotationChanged) }]
          : annotation !== undefined
            ? [{ label: m.menu.changeColor, onSelect: () => {
                // 기본 → 다섯 색 → 기본 순서로 돈다.
                const order: (ShapeColor | 'none')[] = ['none', ...SHAPE_COLORS]
                const now = 'color' in annotation && annotation.color !== undefined ? annotation.color : 'none'
                paint(marks.has(id) ? chosen.items : [id], order[(order.indexOf(now) + 1) % order.length])
              } }]
            : []),
        ...(annotation?.type === 'note' || annotation?.type === 'text' ? [{ label: m.menu.editText, onSelect: () => setEditingItem(id) }] : []),
        ...(annotation?.type === 'rect' || annotation?.type === 'ellipse'
          ? [{ label: (annotation.text ?? '') === '' ? m.menu.addText : m.menu.editText, onSelect: () => setEditingItem(id) }]
          : []),
        ...(annotation?.type === 'section' ? [{ label: m.menu.editLabel, onSelect: () => setEditingItem(id) }] : []),
        ...(annotation?.type === 'arrow' && annotation.cx !== undefined
          ? [{ label: m.menu.straighten, onSelect: () => updateAnnotation(id, (a) => {
              if (a.type !== 'arrow') return a
              const straight = { ...a }
              delete straight.cx
              delete straight.cy
              return straight
            }, m.toast.annotationChanged) }]
          : []),
        { label: m.menu.copy, onSelect: () => copyAnnotation(id) },
        { label: m.menu.bringFront, onSelect: toFront },
        { label: m.menu.delete, onSelect: () => deleteAnnotation(id), danger: true },
      ] })
    } else if (frame) {
      const id = frame.dataset.scenarioId!
      const f = frameOf(id)
      setMenu({ ...at, label: m.menu.frame(position(id)), items: [
        { label: m.menu.importTcs, onSelect: () => setImportFor(id) },
        { label: m.menu.addStepEnd, onSelect: () => addStep(id) },
        { label: m.menu.openEditor, onSelect: () => openEdit(id) },
        { label: f.folded ? m.frame.unfold : m.frame.fold, onSelect: () => toggleFold(id) },
        { label: m.menu.duplicate, onSelect: () => void createTs({ x: f.x + FRAME_W + PASTE_OFFSET, y: f.y }, id) },
        { label: m.menu.copy, onSelect: () => copyTs(id) },
        { label: m.menu.noteBeside, onSelect: () => addAnnotation({ id: newAnnotationId(), type: 'note', x: f.x + FRAME_W + 16, y: f.y, text: m.noteDefault, color: 'y' }, m.toast.annotationAdded, true) },
        { label: m.menu.removeFromRun, onSelect: () => removeTs(id), danger: true },
      ] })
    } else {
      setMenu({ ...at, label: m.menu.canvas, items: [
        { label: m.menu.newTsHere, onSelect: () => void createTs({ x: w.x - FRAME_W / 2, y: w.y - 20 }) },
        { label: m.menu.noteHere, onSelect: () => addAnnotation({ id: newAnnotationId(), type: 'note', x: w.x - 90, y: w.y - 20, text: m.noteDefault, color: 'y' }, m.toast.annotationAdded, true) },
        { label: m.menu.textHere, onSelect: () => addAnnotation({ id: newAnnotationId(), type: 'text', x: w.x, y: w.y, text: m.textDefault }, m.toast.annotationAdded, true) },
        { label: m.menu.paste, onSelect: () => paste(w), disabled: clipboard === null },
        { label: m.autoLayout, onSelect: () => layOut() },
        { label: m.menu.fit, onSelect: fit },
        { label: allFolded ? m.unfoldAll : m.foldAll, onSelect: () => layOut(!allFolded) },
      ] })
    }
  }

  // ── 단축키(글을 고치는 중 · 입력칸 · 대화창이 열려 있으면 받지 않는다) ──
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || importFor !== null || menu !== null) return
      const mod = event.metaKey || event.ctrlKey
      const letter = letterOf(event)
      if (event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat) setSpaceHeld(true)
        return
      }
      // 글을 골라 둔 채 ⌘C 를 누르면 그 글을 복사하게 둔다.
      if (mod && letter === 'c' && (window.getSelection()?.toString() ?? '') !== '') return
      if (mod && letter === 'c') {
        if (chosen.items.length > 0) copyAnnotations(chosen.items)
        else if (picked !== null) copyTs(picked.id)
        else return
        event.preventDefault()
        return
      }
      if (mod && letter === 'v') {
        if (clipboard === null) return
        event.preventDefault()
        paste(clipboard.kind === 'ts' ? null : lastPointer.current)
        return
      }
      if (mod && letter === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && chosen.items.length + chosen.frames.length > 0) {
        event.preventDefault()
        if (chosen.items.length === 1 && chosen.frames.length === 0) deleteAnnotation(chosen.items[0])
        else deleteChosen(chosen)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && drawerOpen && picked !== null && picked.step !== null) {
        event.preventDefault()
        deleteStep(picked.id, picked.step)
        return
      }
      if (event.altKey && drawerOpen && picked !== null && picked.step !== null && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        moveStep(picked.id, picked.step, event.key === 'ArrowLeft' ? -1 : 1)
        return
      }
      if (!mod && !event.altKey && letter !== null && TOOL_KEYS[letter] !== undefined) {
        setTool(TOOL_KEYS[letter])
        return
      }
      if (event.key === 'Escape') {
        setTool('select')
        setChosen(NOTHING)
        setRenaming(null)
        setDrawerOpen(false)
        return
      }
      if (!drawerOpen || picked === null) return
      const s = scenarios.find((x) => x.id === picked.id)
      const at = order.indexOf(picked.id)
      if (s === undefined) return
      if (event.key === 'ArrowRight' && s.steps.length > 0) {
        event.preventDefault()
        pick(s.id, Math.min(s.steps.length - 1, (picked.step ?? -1) + 1))
      } else if (event.key === 'ArrowLeft' && s.steps.length > 0) {
        event.preventDefault()
        pick(s.id, Math.max(0, (picked.step ?? 1) - 1))
      } else if (event.key === 'ArrowDown' && at < order.length - 1) {
        event.preventDefault()
        pick(order[at + 1])
      } else if (event.key === 'ArrowUp' && at > 0) {
        event.preventDefault()
        pick(order[at - 1])
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    // 스페이스를 누른 채 창을 떠나면 keyup 이 오지 않는다.
    const release = () => setSpaceHeld(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
    }
  })

  function openEditor() {
    navigate(`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/edit`)
  }
  function openEdit(scenarioId: string) {
    navigate(`/projects/${encodeURIComponent(projectId)}/test-scenarios/${scenarioId}?run=${encodeURIComponent(runId)}`)
  }

  // ── agent 가 쓰는 길. 각 action 은 같은 이름의 버튼이 부르는 함수를 부른다 ──
  const editButton = useRef<HTMLButtonElement>(null)
  const pickedScenario = useRef<string | null>(null)
  const lookups = scenarioLookups(scenarios, (s) => s.id, (s) => s.title)
  const mapBlockedReason = () => (data.status === 'ready' ? null : data.status === 'loading' ? m.loading : data.status === 'missing' ? m.missing : m.loadFailed)
  const scenarioBlockedReason = () => mapBlockedReason() ?? (scenarios.length === 0 ? m.empty : null)
  const scenarioElement = (scenarioId: string) =>
    stageRef.current?.querySelector<HTMLElement>(`[data-scenario-id="${CSS.escape(scenarioId)}"]`) ?? null
  useFieldBinding(TEST_RUN_SCENARIOS_FIELD, {
    target: () => stageRef.current,
    read: () => scenarios.length,
    options: () => listedOptions(scenarios, (s) => ({ value: s.id, label: s.title })),
    write: readOnlyListWrite(TEST_RUN_SCENARIOS_FIELD.name, 'use testRun.selectScenario or testRun.openScenario.'),
  })
  useActionBinding(TEST_RUN_OPEN_EDITOR_ACTION, {
    target: () => editButton.current,
    blocked: mapBlockedReason,
    run: async () => openEditor(),
  })
  useActionBinding(TEST_RUN_SELECT_SCENARIO_ACTION, {
    target: () => (pickedScenario.current === null ? null : scenarioElement(pickedScenario.current)),
    blocked: scenarioBlockedReason,
    run: async (args) => {
      const s = resolveEntry('scenario', args.scenario, lookups)
      pickedScenario.current = s.id
      pick(s.id)
      return { id: s.id, title: s.title, steps: s.steps.map((step) => ({ action: step.action, tc: step.tc })) }
    },
  })
  useActionBinding(TEST_RUN_OPEN_SCENARIO_ACTION, {
    target: () => (pickedScenario.current === null ? null : scenarioElement(pickedScenario.current)?.querySelector<HTMLElement>('[data-open-editor]') ?? null),
    blocked: scenarioBlockedReason,
    run: async (args) => {
      const s = resolveEntry('scenario', args.scenario, lookups)
      pickedScenario.current = s.id
      openEdit(s.id)
      return { id: s.id, title: s.title }
    },
  })
  useActionBinding(TEST_RUN_START_QA_ACTION, {
    target: () => document.querySelector<HTMLElement>('.rmap-top'),
    blocked: scenarioBlockedReason,
    // QA 시작은 QA 페이지의 승인 action 이 맡는다. 이 페이지에는 QA 를 시작하는 버튼이 없다.
    run: async () => {
      navigate(sectionHref(projectId, 'qa'))
      return { runId }
    },
  })

  const allFolded = scenarios.length > 0 && scenarios.every((s) => frameOf(s.id).folded)
  const q = query.trim().toLowerCase()
  const matches = (s: (typeof scenarios)[number]) =>
    q === '' || s.title.toLowerCase().includes(q) || s.steps.some((step) => step.action.toLowerCase().includes(q) || (step.scene ?? '').toLowerCase().includes(q))
  const totals = useMemo(() => ({
    steps: scenarios.reduce((n, s) => n + s.steps.length, 0),
    gaps: scenarios.reduce((n, s) => n + s.gapCount, 0),
    scenes: new Set(scenarios.flatMap((s) => s.steps.map((step) => step.scene).filter((x): x is string => x !== null))).size,
  }), [scenarios])

  if (data.status === 'loading') {
    return <div className="rmap-shell"><p className="empty-note">{m.loading}</p></div>
  }
  if (data.status === 'missing' || data.status === 'error') {
    return (
      <div className="rmap-shell">
        <div className="panel-message">
          <p>{data.status === 'missing' ? m.missing : m.loadFailed}</p>
          <Link className="button button--secondary" to={`/projects/${encodeURIComponent(projectId)}`}>{m.back}</Link>
        </div>
      </div>
    )
  }

  const drawerScenario = drawerOpen && picked !== null ? scenarios.find((s) => s.id === picked.id) : undefined
  const hoverStep = hover === null ? undefined : scenarios.find((s) => s.id === hover.id)?.steps[hover.index]
  const importScenario = importFor === null ? undefined : drafts[importFor]
  const stageBox = stageSize.width > 0 ? stageSize : null
  const selectedAnnotation = selectedItem === null ? undefined : map.annotations.find((a) => a.id === selectedItem)
  // 주석을 고르면 툴바 끝에 색이 붙는다.
  const chosenAnnotations = map.annotations.filter((a) => chosen.items.includes(a.id))
  const colorsOf = chosenAnnotations.map((a): ShapeColor | 'none' => ('color' in a && a.color !== undefined ? a.color : 'none'))
  const toolbarColors = chosenAnnotations.length > 0
    ? {
        current: colorsOf.every((c) => c === colorsOf[0]) ? colorsOf[0] : null,
        notesOnly: chosenAnnotations.every((a) => a.type === 'note'),
        onPick: (color: ShapeColor | 'none') => paint(chosen.items, color),
      }
    : null

  return (
    <div className={'rmap' + (botLocked ? ' is-bot-locked' : '')}>
      <header className="rmap-top">
        <Link className="rmap-back" to={`/projects/${encodeURIComponent(projectId)}`}>{m.back}</Link>
        <span className="rmap-name">{data.run?.name}</span>
        <span className="rmap-stats">
          <b>{m.stats.ts(scenarios.length)}</b>
          <span>{m.stats.steps(totals.steps)}</span>
          <span>{m.stats.scenes(totals.scenes)}</span>
          {totals.gaps > 0 && <span className="rmap-gap">{m.stats.gaps(totals.gaps)}</span>}
        </span>
        <span className="rmap-spacer" />
        <div className="rmap-seg">
          <button onClick={openEditor} ref={editButton} type="button">{m.editView}</button>
          <button className="on" type="button">{m.mapView}</button>
        </div>
      </header>
      <div className="rmap-tools">
        <label className="rmap-search">
          <span aria-hidden="true">⌕</span>
          <input aria-label={m.searchPlaceholder} onChange={(event) => setQuery(event.target.value)} placeholder={m.searchPlaceholder} type="search" value={query} />
        </label>
        <button className="button button--secondary button--compact" onClick={() => layOut()} type="button">{m.autoLayout}</button>
        <button className="button button--secondary button--compact" onClick={() => layOut(!allFolded)} type="button">{allFolded ? m.unfoldAll : m.foldAll}</button>
        <span className="rmap-legend">
          <span><i className="lg-step" />{m.legend.step}</span>
          <span><i className="lg-tc" />{m.legend.tcStep}</span>
          <span><i className="lg-unknown" />{m.legend.unknownScene}</span>
          <span><i className="lg-gap" />{m.legend.gap}</span>
        </span>
      </div>
      <div
        aria-label={m.canvasLabel}
        className={'rmap-stage tool-' + activeTool + (panning ? ' is-panning' : '')}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
        onMouseLeave={() => setHover(null)}
        onMouseOver={onMouseOver}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        ref={stageRef}
      >
        <div
          className={'rm-world' + (scene !== null ? ' is-scene-focus' : '') + (view.k < 0.45 ? ' is-far' : '')}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: bounds.w, height: bounds.h }}
        >
          <RunMapSections annotations={map.annotations} editing={editingItem} marks={marks} onEditText={editText} selected={selectedItem} />
          {scenarios.map((original) => {
            const f = frameOf(original.id)
            // 끄는 동안: 끌려 나간 TS 는 빈 자리를 닫고, 놓일 TS 는 자리를 연다. 놓을 곳이 없으면 제자리를 비워 둔다.
            let s = original
            const drag = stepDrag
            if (drag !== null) {
              const source = drag.source
              const moving = scenarios.find((one) => one.id === source.id)?.steps.slice(source.start, source.end + 1) ?? []
              const isSource = original.id === source.id
              const isTarget = drag.target?.id === original.id
              if (isSource || isTarget) {
                s = previewScenario(original, {
                  remove: isSource ? { start: source.start, end: source.end } : undefined,
                  insert: isTarget ? { before: drag.target!.before, steps: moving } : isSource && drag.target === null ? { before: source.start, steps: moving } : undefined,
                })
              }
            }
            return (
              <TsFrame
                dimmed={!matches(s)}
                folded={f.folded}
                highlightScene={scene}
                key={s.id}
                dropped={landed?.id === s.id ? landed : null}
                lifting={stepDrag !== null && (stepDrag.source.id === s.id || stepDrag.target?.id === s.id)}
                marked={marks.has(s.id)}
                onRename={renameTs}
                renaming={renaming === s.id}
                picked={picked?.id === s.id}
                pickedStep={picked?.id === s.id ? picked.step : null}
                position={position(s.id)}
                scenario={s}
                x={f.x}
                y={f.y}
                z={z[s.id] ?? 1}
              />
            )
          })}
          <RunMapAnnotations annotations={map.annotations} authors={map.authors} editing={editingItem} k={view.k} marks={marks} onEditText={editText} selected={selectedItem} />
 {marks.size > 0 && chosenBounds !== null && (
            <div className="rma-group" style={{ left: chosenBounds.x - 6, top: chosenBounds.y - 6, width: chosenBounds.w + 12, height: chosenBounds.h + 12 }} />
          )}
          {marquee !== null && <div className="rma-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
          {selectedAnnotation !== undefined && editingItem === null && <SelectionBox annotation={selectedAnnotation} k={view.k} />}
        </div>

        <RunMapToolbar colors={toolbarColors} canRedo={history.redo.length > 0} canUndo={history.undo.length > 0} onRedo={redo} onTool={setTool} onUndo={undo} tool={activeTool} />
        <div className="rm-ctrls">
          <button aria-label={m.zoomOut} className="rm-ctrl" onClick={() => stageBox && zoomAt(stageBox.width / 2, stageBox.height / 2, 1 / 1.2)} type="button">−</button>
          <span className="rm-zoom">{Math.round(view.k * 100)}%</span>
          <button aria-label={m.zoomIn} className="rm-ctrl" onClick={() => stageBox && zoomAt(stageBox.width / 2, stageBox.height / 2, 1.2)} type="button">＋</button>
          <button className="rm-ctrl" onClick={fit} type="button">{m.fit}</button>
        </div>
        {drawerScenario && (
          <RunMapDrawer
            onAddStep={() => addStep(drawerScenario.id, picked === null || picked.step === null ? undefined : picked.step + 1)}
            onClose={() => setDrawerOpen(false)}
            onImportTcs={() => setImportFor(drawerScenario.id)}
            onMoveSteps={(start, end, before) => moveSteps(drawerScenario.id, start, end, before)}
            onNext={() => pick(order[order.indexOf(drawerScenario.id) + 1])}
            onOpenEditor={() => openEdit(drawerScenario.id)}
            onPickStep={(index) => pick(drawerScenario.id, index)}
            onPrev={() => pick(order[order.indexOf(drawerScenario.id) - 1])}
            pickedStep={picked?.step ?? null}
            position={position(drawerScenario.id)}
            scenario={drawerScenario}
            total={order.length}
          />
        )}
        {stepDrag && (
          <div className={'rm-drag-ghost' + (stepDrag.target === null ? ' is-nowhere' : '')} style={{ left: stepDrag.cx - 14, top: stepDrag.cy - 56 }}>
            <span aria-hidden="true" className="rm-drag-dots">
              {Array.from({ length: Math.min(3, stepDrag.source.end - stepDrag.source.start + 1) }, (_, i) => <i key={i} />)}
            </span>
            <span className="rm-drag-text">
              {stepDrag.label}
              {stepDrag.target !== null && <span>{m.drag.into(position(stepDrag.target.id), stepDrag.target.before)}</span>}
            </span>
          </div>
        )}
        {lock.locked && <ArtelBotLock lock={lock} scope="map" />}
        {toast && (
          <div className="rm-toast" role="status">
            {toast.text}
            {toast.undo && <button onClick={undo} type="button">{m.toast.undo}</button>}
          </div>
        )}
      </div>

      {hover && hoverStep && <StepHoverCard anchor={hover.rect} index={hover.index} step={hoverStep} />}
      {menu && <ContextMenu items={menu.items} label={menu.label} onClose={() => setMenu(null)} x={menu.x} y={menu.y} />}
      {importFor !== null && importScenario && (() => {
        const count = importScenario.steps.length
        // 서랍에서 스텝을 고른 채 열었으면 그 뒤가 기본 자리다.
        const after = picked?.id === importFor && picked.step !== null && picked.step < count - 1 ? picked.step + 1 : null
        const positions = [
          { at: count, label: t.scenarios.caseImport.atEnd(count) },
          ...(after !== null ? [{ at: after, label: t.scenarios.caseImport.after(after) }] : []),
          ...(count > 0 ? [{ at: 0, label: t.scenarios.caseImport.atStart }] : []),
        ]
        return (
          <CaseImportDialog
            defaultAt={after ?? count}
            gameBuildId={data.run?.gameBuild?.gameBuildId ?? null}
            onAdd={(caseIds, at) => {
              importTcs(importFor, caseIds, at, new Map(data.cases.cases.map((c) => [c.id, c.step] as const)))
              setImportFor(null)
            }}
            onClose={() => setImportFor(null)}
            positions={positions}
            project={data.cases}
            projectId={projectId}
            steps={importScenario.steps}
            target={{ position: position(importFor), title: importScenario.title }}
          />
        )
      })()}
    </div>
  )
}

