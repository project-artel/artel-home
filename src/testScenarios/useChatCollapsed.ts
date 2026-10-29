import { useCallback, useState } from 'react'

/** 대화 칸을 접었나. 런 편집 · TS 편집 · 런 맵이 같은 값을 쓴다 — 한 곳에서 접으면 다른 곳도 접힌 채 열린다. */
const CHAT_COLLAPSED_KEY = 'artel.studio.chatCollapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(CHAT_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function useChatCollapsed() {
  const [collapsed, setCollapsedState] = useState(readCollapsed)
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next)
    try {
      window.localStorage.setItem(CHAT_COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      // 기억하지 못해도 이번 판에서는 접힌 채로 쓴다.
    }
  }, [])
  return { collapsed, setCollapsed }
}

/** 접힌 대화 칸(막대)의 폭. */
export const CHAT_RAIL_PX = 44
