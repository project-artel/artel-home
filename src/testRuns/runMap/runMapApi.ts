import { apiFetch } from '../../auth/authApi'
import { asRecord, jsonRequest, ProjectApiError, readJson, toApiError } from '../../projects/projectApi'

/** TS 프레임 하나의 자리와 접힘(캔버스 좌표). */
export type RunMapFrame = { x: number; y: number; folded: boolean }

export type NoteColor = 'y' | 'p' | 'b' | 'g'
/** 메모 외 주석의 색. 메모의 넷에 빨강을 더했다. 없으면 기본(회색). */
export type ShapeColor = NoteColor | 'r'
export const SHAPE_COLORS: ShapeColor[] = ['y', 'p', 'b', 'g', 'r']

type Meta = { id: string; createdBy?: string | null; createdAt?: string | null }
/**
 * 맵 위 주석. 메모 · 글 · 사각형 · 원 · 묶음 상자 · 화살표 · 그림.
 *
 * 메모 · 글의 [w] [h] 는 크기를 바꿨을 때만 있다. 도형 안의 글은 [text], 묶음 상자는 그것을 왼쪽 위 라벨로 쓴다.
 * 휜 화살표는 조절점 [cx] [cy] 를 갖는다.
 */
export type RunMapAnnotation =
  | (Meta & { type: 'note'; x: number; y: number; w?: number; h?: number; text: string; color: NoteColor })
  | (Meta & { type: 'text'; x: number; y: number; w?: number; h?: number; text: string; color?: ShapeColor })
  | (Meta & { type: 'rect' | 'ellipse' | 'section'; x: number; y: number; w: number; h: number; text?: string; color?: ShapeColor })
  | (Meta & { type: 'arrow'; x1: number; y1: number; x2: number; y2: number; cx?: number; cy?: number; color?: ShapeColor })
  | (Meta & { type: 'pen'; points: [number, number][]; color?: ShapeColor })

export type RunMap = {
  version: number
  layout: Record<string, RunMapFrame>
  annotations: RunMapAnnotation[]
  /** 사용자 id → 이름. */
  authors: Record<string, string>
}

export const EMPTY_RUN_MAP: RunMap = { version: 0, layout: {}, annotations: [], authors: {} }

/** 읽은 뒤 다른 사람이 먼저 맵을 저장했다(서버 409 `run_map_stale`). */
export class StaleRunMapError extends Error {}

const mapPath = (projectId: string, runId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/map`

export async function getRunMap(projectId: string, runId: string, signal?: AbortSignal): Promise<RunMap> {
  const response = await apiFetch(mapPath(projectId, runId), { signal })
  if (!response.ok) throw await toApiError(response)
  return parseRunMap(await readJson(response))
}

export async function saveRunMap(projectId: string, runId: string, map: Pick<RunMap, 'version' | 'layout' | 'annotations'>): Promise<RunMap> {
  const response = await apiFetch(mapPath(projectId, runId), {
    method: 'PUT',
    ...jsonRequest({ version: map.version, layout: map.layout, annotations: map.annotations }),
  })
  if (!response.ok) {
    const error = await toApiError(response)
    if (error instanceof ProjectApiError && error.status === 409 && error.code === 'run_map_stale') throw new StaleRunMapError(error.message)
    throw error
  }
  return parseRunMap(await readJson(response))
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** 모르는 type 이나 칸이 빈 주석은 버린다. 맵 전체를 버리지 않는다. */
export function parseRunMap(data: unknown): RunMap {
  const record = asRecord(data)
  if (record === null) return EMPTY_RUN_MAP
  const layout: Record<string, RunMapFrame> = {}
  for (const [id, raw] of Object.entries(asRecord(record.layout) ?? {})) {
    const frame = asRecord(raw)
    const x = num(frame?.x)
    const y = num(frame?.y)
    if (x !== null && y !== null) layout[id] = { x, y, folded: frame?.folded === true }
  }
  const annotations = (Array.isArray(record.annotations) ? record.annotations : []).flatMap((raw): RunMapAnnotation[] => {
    const a = asRecord(raw)
    const id = str(a?.id)
    if (a === null || id === null) return []
    const meta = { id, createdBy: str(a.createdBy), createdAt: str(a.createdAt) }
    const x = num(a.x), y = num(a.y)
    const w = num(a.w), h = num(a.h)
    const size = w !== null && h !== null ? { w, h } : {}
    const text = str(a.text)
    const shapeColor = SHAPE_COLORS.find((c) => c === a.color)
    const tint = shapeColor !== undefined ? { color: shapeColor } : {}
    switch (a.type) {
      case 'note': {
        const color = (['y', 'p', 'b', 'g'] as const).find((c) => c === a.color) ?? 'y'
        return x !== null && y !== null && text !== null ? [{ ...meta, type: 'note', x, y, ...size, text, color }] : []
      }
      case 'text':
        return x !== null && y !== null && text !== null ? [{ ...meta, type: 'text', x, y, ...size, text, ...tint }] : []
      case 'rect':
      case 'ellipse':
      case 'section':
        return x !== null && y !== null && w !== null && h !== null ? [{ ...meta, type: a.type, x, y, w, h, ...(text !== null ? { text } : {}), ...tint }] : []
      case 'arrow': {
        const x1 = num(a.x1), y1 = num(a.y1), x2 = num(a.x2), y2 = num(a.y2)
        const cx = num(a.cx), cy = num(a.cy)
        const bend = cx !== null && cy !== null ? { cx, cy } : {}
        return x1 !== null && y1 !== null && x2 !== null && y2 !== null ? [{ ...meta, type: 'arrow', x1, y1, x2, y2, ...bend, ...tint }] : []
      }
      case 'pen': {
        const points = (Array.isArray(a.points) ? a.points : []).flatMap((p): [number, number][] => {
          if (!Array.isArray(p)) return []
          const px = num(p[0]), py = num(p[1])
          return px !== null && py !== null ? [[px, py]] : []
        })
        return points.length >= 2 ? [{ ...meta, type: 'pen', points, ...tint }] : []
      }
      default:
        return []
    }
  })
  const authors: Record<string, string> = {}
  for (const [id, name] of Object.entries(asRecord(record.authors) ?? {})) if (typeof name === 'string') authors[id] = name
  return { version: num(record.version) ?? 0, layout, annotations, authors }
}
