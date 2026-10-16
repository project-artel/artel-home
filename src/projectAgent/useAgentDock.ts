import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { projectPathSegments } from '../projects/workspace/sections'
import {
  CHAT_WIDTH_MIN,
  chatWidthCeiling,
  clampChatWidth,
  effectiveOpen,
  isFoldedRoute,
  isProjectAgentEnabled,
  readAgentOpen,
  readAgentWidth,
  storeAgentOpen,
  storeAgentWidth,
} from './agentDockState'

/** 접힌 경로에서 손으로 다시 연 기록. pathname 이 바뀌면 효력을 잃는다. */
interface ReopenedOverride {
  pathname: string
}

/**
 * 프로젝트 workspace 의 agent 대화창 상태.
 * `src/testScenarios/useChatWidth.ts` 와 같은 모양이다. 손잡이가 대화창 왼쪽에 있어
 * 왼쪽으로 끌면 넓어지므로 `sign` 이 -1 이다.
 */
export function useAgentDock(projectId: string, pathname: string, railWidth: number) {
  const { t } = useI18n()
  const [storedOpen, setStoredOpen] = useState(readAgentOpen)
  const [storedWidth, setStoredWidth] = useState(readAgentWidth)
  const [reopened, setReopened] = useState<ReopenedOverride | null>(null)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [splitting, setSplitting] = useState(false)

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const enabled = isProjectAgentEnabled(import.meta.env)
  const folded = isFoldedRoute(projectId, pathname)
  const reopenedHere = reopened?.pathname === pathname
  const open = enabled && effectiveOpen({ stored: storedOpen, folded, reopenedHere })

  const openChat = useCallback(() => {
    if (folded) {
      setReopened({ pathname })
      return
    }
    setStoredOpen(true)
    storeAgentOpen(true)
  }, [folded, pathname])

  const closeChat = useCallback(() => {
    if (folded) {
      setReopened(null)
      return
    }
    setStoredOpen(false)
    storeAgentOpen(false)
  }, [folded])

  const onWidthChange = useCallback((next: number) => {
    setStoredWidth(next)
    storeAgentWidth(next)
  }, [])

  const chatWidth = clampChatWidth(storedWidth, viewportWidth, railWidth)
  const isIndex = projectPathSegments(projectId, pathname)?.length === 0

  return {
    enabled,
    open,
    openChat,
    closeChat,
    /** `SplitHandle` 에 그대로 펼쳐 넣는다. */
    handle: {
      label: t.projectAgent.resizeHandle,
      value: chatWidth,
      min: CHAT_WIDTH_MIN,
      max: chatWidthCeiling(viewportWidth, railWidth),
      onChange: onWidthChange,
      onDragState: setSplitting,
      sign: -1 as const,
    },
    chatWidth,
    /** 끄는 동안 true. 바깥 grid 에 `is-splitting` 을 붙여 글자 선택을 막는다. */
    splitting,
    isIndex,
  }
}
