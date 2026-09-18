import { useCallback, useState, type CSSProperties } from 'react'

/**
 * 대화 칸 폭. 사람마다 읽는 폭이 다르고 화면 크기도 다르니 값을 들고 있는다.
 * 접근 못 하는 저장소(사생활 보호 모드)에서는 그냥 기본값으로 연다.
 */
const CHAT_WIDTH_KEY = 'artel.studio.chatWidth'
const CHAT_WIDTH_DEFAULT = 360
const CHAT_WIDTH_MIN = 300
const CHAT_WIDTH_MAX = 720
/** 대화가 아무리 넓어져도 가운데 STEP 은 이만큼 남는다. */
const STEPS_MIN_PX = 420
const RAIL_PX = 280
const SPLIT_PX = 6

function readChatWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(CHAT_WIDTH_KEY))
    if (!Number.isFinite(saved) || saved <= 0) return CHAT_WIDTH_DEFAULT
    return Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, saved))
  } catch {
    return CHAT_WIDTH_DEFAULT
  }
}

/** 창이 좁으면 저장된 폭을 그대로 못 쓴다 — STEP 이 설 자리부터 뺀다. */
function chatWidthCeiling(): number {
  const room = window.innerWidth - RAIL_PX - SPLIT_PX - STEPS_MIN_PX
  return Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_MAX, room))
}

/**
 * 시나리오 저작 화면(`.scenario-studio`)의 대화 칸 폭.
 *
 * 화면이 둘이라서 여기에 있다. 런 편집(`RunEditPage`)과 시나리오 상세
 * (`TestScenarioPage`)는 같은 `.st-edit` 4칸 grid 를 쓰고, 세 번째 칸은
 * `SplitHandle` 자리다. 한쪽만 손잡이를 안 그리면 `aside` 가 그 6px 칸으로
 * 밀려 들어가 대화가 안 보인다 — 폭도, 손잡이도 두 화면이 같이 가져간다.
 */
export function useChatWidth() {
  // 끄는 동안에도 이 수 하나만 바뀌고, 나머지는 CSS 변수가 받는다.
  const [chatWidth, setChatWidth] = useState(readChatWidth)
  const [splitting, setSplitting] = useState(false)
  const onChatWidth = useCallback((next: number) => {
    setChatWidth(next)
    try {
      window.localStorage.setItem(CHAT_WIDTH_KEY, String(next))
    } catch {
      // 저장이 막혀도 이번 판에서는 넓어진 채로 쓴다.
    }
  }, [])

  const max = chatWidthCeiling()
  return {
    /** 바깥 `.scenario-studio` 에 그대로 얹는다. */
    studio: {
      className: 'scenario-studio' + (splitting ? ' is-splitting' : ''),
      style: { '--st-chat-w': `${Math.min(chatWidth, max)}px` } as CSSProperties,
    },
    /**
     * `SplitHandle` 에 그대로 펼쳐 넣는다. `label` 만 화면이 고른다.
     * 경계는 가운데와 대화 사이다. 왼쪽으로 끌면 대화가 넓어지므로 부호가 뒤집힌다.
     */
    handle: {
      value: chatWidth,
      min: CHAT_WIDTH_MIN,
      max,
      onChange: onChatWidth,
      onDragState: setSplitting,
      sign: -1 as const,
    },
  }
}
