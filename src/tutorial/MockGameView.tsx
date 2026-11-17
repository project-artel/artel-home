import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n/useI18n'
import { watchLiveLogs, type MockLog } from './mock/tutorialPlayback'

type Scene = 'title' | 'lobby' | 'garden' | 'shop' | 'settings'
type Spot = { x: number; y: number }

/** 장면 안에서 Agent 가 누르는 자리. 화면 크기에 대한 백분율이다. */
const SPOTS: Record<string, Spot> = {
  start: { x: 50, y: 70 },
  gardenButton: { x: 30, y: 58 },
  continue: { x: 50, y: 78 },
  plot: { x: 50, y: 48 },
  water: { x: 56, y: 40 },
  flower: { x: 28, y: 48 },
  pack: { x: 35, y: 50 },
  toggle: { x: 66, y: 42 },
  center: { x: 50, y: 50 },
}

/**
 * 튜토리얼 QA 실행 장면의 예시 게임 화면(ARTEL-1461). 실제 게임 화면 자리(`.qa-stage-top`)에 겹쳐 그린다. 튜토리얼
 * 각본이 흘려보내는 로그를 따라 장면이 바뀌고, Agent 가 누를 때마다 커서가 그 자리로 가 누른다.
 *
 * 튜토리얼 덮개 아래에 놓여 다른 화면처럼 함께 어두워지고, 클릭은 받지 않는다.
 */
export function MockGameView() {
  const { t } = useI18n()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [state, setState] = useState<{ scene: Scene; spot: Spot; taps: number; action: string; sprout: boolean; verdict: 'pass' | 'fail' | null }>({
    scene: 'title',
    spot: SPOTS.center,
    taps: 0,
    action: '',
    sprout: false,
    verdict: null,
  })

  // 게임 화면 자리를 따라간다. 실행 화면이 크기를 바꾸면 같이 바뀐다.
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const next = document.querySelector('.qa-stage-top')?.getBoundingClientRect() ?? null
      setRect((now) => (now !== null && next !== null && now.left === next.left && now.top === next.top && now.width === next.width && now.height === next.height ? now : next))
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => watchLiveLogs((log: MockLog) => {
    const payload = (log.payload ?? {}) as Record<string, unknown>
    const scene = sceneOf(typeof payload.scene === 'string' ? payload.scene : '')
    setState((now) => {
      if (log.type === 'LOG') return { ...now, scene: scene ?? now.scene, verdict: null }
      if (log.type === 'ACTION') {
        const key = spotOf(log.message)
        return { ...now, scene: scene ?? now.scene, spot: SPOTS[key], taps: now.taps + 1, action: log.message }
      }
      if (log.type === 'STATUS' && typeof payload.status === 'string' && payload.step !== undefined) {
        const passed = payload.status === 'COMPLETED'
        return { ...now, scene: scene ?? now.scene, verdict: passed ? 'pass' : 'fail', sprout: now.sprout || (passed && /씨앗|seed/i.test(now.action)) }
      }
      return now
    })
  }), [])

  if (rect === null || rect.width === 0) return null
  const m = t.tutorial.game
  return createPortal(
    <div
      aria-hidden="true"
      className={`tut-game tut-game--${state.scene}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <div className="tut-game-hud">
        <span>STARLIGHT GARDEN</span>
        <span>🪙 40 · 🌱 3</span>
      </div>
      {state.scene === 'title' && (
        <div className="tut-game-title">
          <b>STARLIGHT GARDEN</b>
          <span className="tut-game-btn" style={pos(SPOTS.start)}>{m.start}</span>
        </div>
      )}
      {state.scene === 'lobby' && (
        <>
          <span className="tut-game-btn" style={pos(SPOTS.gardenButton)}>{m.garden}</span>
          <span className="tut-game-btn" style={pos({ x: 50, y: 58 })}>{m.shop}</span>
          <span className="tut-game-btn" style={pos({ x: 70, y: 58 })}>{m.settings}</span>
          <span className="tut-game-btn tut-game-btn--ghost" style={pos(SPOTS.continue)}>{m.continue}</span>
        </>
      )}
      {state.scene === 'garden' && (
        <div className="tut-game-plots">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <span className="tut-game-plot" key={index}>
              {index === 0 ? '🌸' : index === 1 && state.sprout ? '🌱' : ''}
              {index === 1 && state.sprout && <i className="tut-game-water">💧</i>}
            </span>
          ))}
          <div className="tut-game-gauge"><span style={{ width: '0%' }} /></div>
        </div>
      )}
      {state.scene === 'shop' && (
        <span className="tut-game-card" style={pos(SPOTS.pack)}>{m.pack}</span>
      )}
      {state.scene === 'settings' && (
        <span className="tut-game-toggle" style={pos(SPOTS.toggle)}>{m.sound}</span>
      )}

      <span className="tut-game-cursor" style={pos(state.spot)}>
        <i className="tut-game-tap" key={state.taps} />
      </span>
      {state.verdict !== null && (
        <span className={`tut-game-verdict tut-game-verdict--${state.verdict}`}>{state.verdict === 'pass' ? m.pass : m.fail}</span>
      )}
      {state.action !== '' && <span className="tut-game-caption">Agent · {state.action}</span>}
      <span className="tut-game-label">{m.label}</span>
    </div>,
    document.body,
  )
}

function pos(spot: Spot): React.CSSProperties {
  return { left: `${spot.x}%`, top: `${spot.y}%` }
}

function sceneOf(name: string): Scene | null {
  if (/타이틀|title/i.test(name)) return 'title'
  if (/로비|lobby/i.test(name)) return 'lobby'
  if (/정원|garden/i.test(name)) return 'garden'
  if (/상점|shop/i.test(name)) return 'shop'
  if (/설정|settings/i.test(name)) return 'settings'
  return null
}

function spotOf(action: string): keyof typeof SPOTS {
  if (/시작|start/i.test(action)) return 'start'
  if (/이어하기|continue/i.test(action)) return 'continue'
  if (/정원 버튼|garden/i.test(action)) return 'gardenButton'
  if (/물 주기|water/i.test(action)) return 'water'
  if (/꽃|flower/i.test(action)) return 'flower'
  if (/묶음|pack/i.test(action)) return 'pack'
  if (/씨앗|seed/i.test(action)) return 'plot'
  if (/효과음|배경음|sound|music/i.test(action)) return 'toggle'
  return 'center'
}
