import { useCallback, useState, type CSSProperties } from 'react'
import { PROJECT_RAIL_PX } from '../../projects/workspace/sections'

/**
 * QA 실행 기록 오른쪽 상세 칸의 폭과 접힘(ARTEL-1381).
 *
 * 저작 화면 대화 칸(`useChatWidth`)과 같은 방식이다 — 폭 하나를 들고 CSS 변수로 넘기고, 경계 손잡이(`SplitHandle`)에
 * 펼쳐 넣을 값을 함께 준다. 저장소를 못 쓰는 환경(사생활 보호 모드)이면 기본값으로 연다.
 */
const WIDTH_KEY = 'artel.qaHistory.inspectorWidth'
const COLLAPSED_KEY = 'artel.qaHistory.inspectorCollapsed'
export const INSPECTOR_WIDTH_DEFAULT = 340
const INSPECTOR_WIDTH_MIN = 320
const INSPECTOR_WIDTH_MAX = 900
/** 접으면 남는 막대 폭. */
export const INSPECTOR_RAIL_PX = 44
/** 왼쪽 버전 칸. `.qh` 격자의 첫 칸과 같다. */
const VERSIONS_PX = 236
/** 상세가 아무리 넓어져도 가운데 실행 목록은 이만큼 남는다. */
const BOARD_MIN_PX = 420

function readWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY))
    if (!Number.isFinite(saved) || saved <= 0) return INSPECTOR_WIDTH_DEFAULT
    return Math.min(INSPECTOR_WIDTH_MAX, Math.max(INSPECTOR_WIDTH_MIN, saved))
  } catch {
    return INSPECTOR_WIDTH_DEFAULT
  }
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 저장이 막혀도 이번 판에서는 바꾼 대로 쓴다.
  }
}

/** 창이 좁으면 저장된 폭을 그대로 못 쓴다 — 가운데 목록이 설 자리부터 뺀다. */
function widthCeiling(): number {
  const room = window.innerWidth - PROJECT_RAIL_PX - VERSIONS_PX - BOARD_MIN_PX
  return Math.max(INSPECTOR_WIDTH_MIN, Math.min(INSPECTOR_WIDTH_MAX, room))
}

export function useInspectorWidth() {
  const [width, setWidth] = useState(readWidth)
  const [collapsed, setCollapsedState] = useState(readCollapsed)
  const [splitting, setSplitting] = useState(false)

  const onWidth = useCallback((next: number) => {
    setWidth(next)
    store(WIDTH_KEY, String(next))
  }, [])
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next)
    store(COLLAPSED_KEY, next ? '1' : '0')
  }, [])
  const reset = useCallback(() => onWidth(INSPECTOR_WIDTH_DEFAULT), [onWidth])

  const max = widthCeiling()
  return {
    /** 바깥 `.qh` 에 그대로 얹는다. */
    board: {
      className: 'qh' + (splitting ? ' is-splitting' : '') + (collapsed ? ' is-inspector-collapsed' : ''),
      style: { '--qh-inspector-w': `${collapsed ? INSPECTOR_RAIL_PX : Math.min(width, max)}px` } as CSSProperties,
    },
    collapsed,
    setCollapsed,
    /** 경계를 두 번 누르면 기본 폭으로 돌아간다. */
    reset,
    /**
     * `SplitHandle` 에 그대로 펼쳐 넣는다. 경계는 가운데 목록과 상세 사이라, 왼쪽으로 끌면 상세가 넓어진다 — 부호가
     * 뒤집힌다.
     */
    handle: {
      value: Math.min(width, max),
      min: INSPECTOR_WIDTH_MIN,
      max,
      onChange: onWidth,
      onDragState: setSplitting,
      sign: -1 as const,
    },
  }
}
