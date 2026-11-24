import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import type { McpLine } from './startTutorialSteps'
import { prefersReducedMotion } from './motion'

const USER_CHAR_MS = 18
const LINE_MS = { user: 300, call: 650, out: 450, say: 450, ok: 450 } as const

/**
 * 같은 일을 코딩 에이전트에게 artel MCP 로 맡기면 어떻게 되는지 보여 주는 터미널(ARTEL-1461). 사람이 친 줄은 한 글자씩,
 * 에이전트의 줄은 한 줄씩 나온다. 다 나오기 전에 다음으로 넘어가도 된다.
 */
export function McpScene({ lines }: { lines: McpLine[] }) {
  const { t } = useI18n()
  const shown = useReveal(lines)

  return (
    <div className="tut-mcp" role="group" aria-label={t.tutorial.player.mcpTitle}>
      <div className="tut-mcp-window">
        <div className="tut-mcp-bar"><i /><i /><i /><span>{t.tutorial.player.mcpTitle}</span></div>
        <div className="tut-mcp-body" aria-live="polite">
          {lines.slice(0, shown.lines).map((line, index) => {
            const typing = index === shown.lines - 1 && line.kind === 'user' && shown.chars < line.text.length
            return (
              <p className={`tut-mcp-line tut-mcp-line--${line.kind}`} key={index}>
                {typing ? line.text.slice(0, shown.chars) : line.text}
                {typing && <span className="tut-mcp-caret" aria-hidden="true" />}
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * 한 줄씩, 사람이 친 줄은 한 글자씩 드러낸다. 장면은 동작마다 새로 그려지므로(`key`) 처음 값만 정하면 된다.
 */
function useReveal(lines: McpLine[]): { lines: number; chars: number } {
  const [state, setState] = useState(() =>
    prefersReducedMotion() ? { lines: lines.length, chars: Number.MAX_SAFE_INTEGER } : { lines: 1, chars: 0 },
  )

  useEffect(() => {
    const line = lines[state.lines - 1]
    if (line === undefined) return undefined
    let next: { lines: number; chars: number }
    let delay: number
    if (line.kind === 'user' && state.chars < line.text.length) {
      next = { lines: state.lines, chars: state.chars + 1 }
      delay = USER_CHAR_MS
    } else if (state.lines < lines.length) {
      next = { lines: state.lines + 1, chars: 0 }
      delay = LINE_MS[line.kind]
    } else {
      return undefined
    }
    const timer = window.setTimeout(() => setState(next), delay)
    return () => window.clearTimeout(timer)
  }, [lines, state])

  return state
}
