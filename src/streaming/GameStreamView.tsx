import { useEffect, useRef, type ReactNode } from 'react'
import { useGameStream } from './useGameStream'
import type { GameStreamFailure, GameStreamStatus } from './streamTypes'

/**
 * How a non-live status is worded and how strongly it is coloured.
 *
 * `retryLabel` is `null` where the button would be dead UI: a permission
 * refusal answers the same way every time, and the wait for a game already
 * polls at a steady 5s, so a button next to it saves nothing. A reconnect backs
 * off up to 10s, which is long enough to be worth skipping by hand.
 */
type StatusNotice = {
  tone: 'pending' | 'warning' | 'critical'
  label: string
  detail: string
  retryLabel: string | null
}

/**
 * Every notice carries its meaning in words. The tone is a second signal only,
 * so the overlay still reads correctly with colour removed.
 */
function describeStatus(
  status: GameStreamStatus,
  failure: GameStreamFailure | null,
): StatusNotice | null {
  if (status === 'live') return null

  if (status === 'connecting') {
    return {
      tone: 'pending',
      label: '연결 중',
      detail: '게임 화면을 여는 중입니다.',
      retryLabel: null,
    }
  }

  if (status === 'reconnecting') {
    return {
      tone: 'warning',
      label: '다시 연결하는 중',
      detail: '연결이 끊겼습니다. 아래 화면은 마지막으로 받은 장면이며 지금 화면이 아닙니다.',
      retryLabel: '지금 다시 시도',
    }
  }

  if (status === 'offline') {
    return {
      tone: 'pending',
      label: '게임 대기 중',
      detail: '이 인스턴스에서 실행 중인 게임이 없습니다. 게임이 연결되면 자동으로 이어집니다.',
      retryLabel: null,
    }
  }

  // Terminal on purpose: an automatic reconnect here would take the stream back
  // from whoever just opened it, and the two windows would evict each other
  // indefinitely. Recovery has to be something a person asked for.
  if (status === 'takenOver') {
    return {
      tone: 'warning',
      label: '다른 창이 이어받음',
      detail: '같은 게임을 다른 창에서 보기 시작해 이 연결이 끝났습니다. 다시 보면 그쪽 연결이 끊깁니다.',
      retryLabel: '다시 보기',
    }
  }

  if (failure === 'notPermitted') {
    return {
      tone: 'critical',
      label: '볼 수 없음',
      detail: '이 게임이 속한 프로젝트의 멤버만 화면을 볼 수 있습니다.',
      retryLabel: null,
    }
  }

  // Named as a network failure rather than a broken stream. Without TURN a game
  // and a browser on different networks negotiate successfully and then carry
  // no media, and calling that an error gets a network limitation filed as a bug.
  if (failure === 'unreachable') {
    return {
      tone: 'critical',
      label: '연결 실패',
      detail:
        '게임에 네트워크로 닿지 못했습니다. 게임과 브라우저가 서로 다른 네트워크에 있으면 연결되지 않을 수 있습니다.',
      retryLabel: '다시 시도',
    }
  }

  return {
    tone: 'critical',
    label: '연결 실패',
    detail: '스트림 신호 연결이 끊어졌습니다.',
    retryLabel: '다시 시도',
  }
}

/**
 * One game instance's live screen.
 *
 * Knows nothing about routes, projects, or the page around it: it is given an
 * instance id and renders that instance's video, so the QA screen can mount it
 * beside a timeline without changing anything here. `overlay` is where a caller
 * draws on top of the video — agent cursors, bounding boxes — and it is layered
 * under the status notice so a disconnect is never hidden by an annotation.
 *
 * The last received frame is left on screen while reconnecting, because it is
 * evidence. What must never happen is presenting it as live, which is why the
 * notice is opaque enough to read over any frame.
 */
export function GameStreamView({
  className,
  instanceId,
  overlay,
}: {
  className?: string
  instanceId: string
  overlay?: ReactNode
}) {
  const { failure, retry, status, stream } = useGameStream(instanceId)
  const videoRef = useRef<HTMLVideoElement>(null)

  // `srcObject` is not an attribute, so it cannot be set through JSX.
  useEffect(() => {
    const video = videoRef.current
    if (video === null) return
    video.srcObject = stream
  }, [stream])

  const notice = describeStatus(status, failure)

  return (
    <div className={className === undefined ? 'game-stream' : `game-stream ${className}`}>
      {/* Muted and inline because there is no audio to play and autoplay is
          refused otherwise; no controls because there is nothing to seek. */}
      <video
        aria-label="게임 화면"
        autoPlay
        className="game-stream-video"
        muted
        playsInline
        ref={videoRef}
      />

      {overlay !== undefined && <div className="game-stream-annotations">{overlay}</div>}

      {notice !== null && (
        /* One polite region for the whole notice: the label and the detail are
           a single summarised state change, not a log to read out line by line. */
        <div className={`game-stream-notice game-stream-notice--${notice.tone}`} role="status">
          {notice.tone === 'pending' ? (
            <span aria-hidden="true" className="loading-mark" />
          ) : (
            <span aria-hidden="true" className="game-stream-mark">!</span>
          )}
          <p className="game-stream-notice-label">{notice.label}</p>
          <p className="game-stream-notice-detail">{notice.detail}</p>
          {notice.retryLabel !== null && (
            <button className="button button--secondary" onClick={retry} type="button">
              {notice.retryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
