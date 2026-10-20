import type { ReactNode } from 'react'

/**
 * 그림이 있는 빈 화면(ARTEL-1162). 그림 · 제목 · 설명 · 할 일 단추를 남은 자리의 가운데에 둔다. 글 한 줄만 두면
 * 화면이 비어 보이고 무엇을 해야 할지 모른다. [surface] 는 칸 바탕이 `--color-bg-surface` 인 자리다 — 그림의
 * 앞면을 그 색으로 칠해야 뒤 판이 비치지 않는다.
 */
export function SketchEmpty({
  sketch,
  title,
  body,
  actions,
  surface = false,
  compact = false,
}: {
  sketch: ReactNode
  title: string
  body?: string
  actions?: ReactNode
  surface?: boolean
  /** 한 칸 안의 작은 빈 자리(예: 최근 실행 목록). */
  compact?: boolean
}) {
  return (
    <div className={`sketch-empty${surface ? ' sketch-empty--surface' : ''}${compact ? ' sketch-empty--compact' : ''}`}>
      {sketch}
      <b className="sketch-empty-title">{title}</b>
      {body && <span className="sketch-empty-body">{body}</span>}
      {actions && <span className="sketch-empty-actions">{actions}</span>}
    </div>
  )
}
