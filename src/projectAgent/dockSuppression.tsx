import { createContext, useContext, useEffect, type ReactNode } from 'react'

/**
 * 페이지가 프로젝트 agent 대화를 자기 칸 안에 직접 그리는 동안, workspace 의 dock 을 숨기게 하는 길.
 * 같은 대화가 두 곳에 나란히 뜨지 않게 한다. 대화 session 은 dock 밖의 provider 가 갖고 있어 숨겨도
 * 상태는 그대로다.
 */
const DockSuppressionContext = createContext<((suppressed: boolean) => void) | null>(null)

export function DockSuppressionProvider({
  onChange,
  children,
}: {
  onChange: (suppressed: boolean) => void
  children: ReactNode
}) {
  return <DockSuppressionContext.Provider value={onChange}>{children}</DockSuppressionContext.Provider>
}

/** `active` 인 동안 dock 을 숨긴다. provider 가 없으면 아무 일도 하지 않는다. */
export function useSuppressAgentDock(active: boolean): void {
  const setSuppressed = useContext(DockSuppressionContext)
  useEffect(() => {
    if (setSuppressed === null || !active) return
    setSuppressed(true)
    return () => setSuppressed(false)
  }, [setSuppressed, active])
}
