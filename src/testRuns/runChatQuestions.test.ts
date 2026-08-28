import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRunStreamEvent } from './runChatApi'

/**
 * 한 턴이 못 정한 것을 **다** 읽는다(ARTEL-630).
 *
 * 서버가 하나만 보내고 나머지를 조용히 두던 때, 못 간다고 적힌 자리가 다섯인데 물은 것은
 * 하나였다. 사용자는 시나리오가 완성된 줄 알고, 나머지 넷은 스텝 안에
 * "이 구간의 경로를 확인할 수 없습니다" 로 남았다 — 아무도 답하라고 하지 않은 채로.
 */
test('함께 낸 질문을 모두 읽는다', () => {
  const parsed = parseRunStreamEvent(
    JSON.stringify({
      type: 'question',
      question: { id: 'gap:activeSelf', text: 'activeSelf 구간을 어떻게 넘어가나요?', options: [] },
      questions: [
        { id: 'gap:activeSelf', text: 'activeSelf 구간을 어떻게 넘어가나요?', options: [] },
        { id: 'gap:stagePosition', text: 'stagePosition 구간을 어떻게 넘어가나요?', options: [] },
      ],
    }),
  )

  assert.equal(parsed?.type, 'question')
  assert.equal(parsed.type === 'question' ? parsed.questions?.length : 0, 2)
})

/** 옛 서버는 목록을 안 보낸다. 그때도 하나는 물어야 한다 — 배포 순서가 어긋나도 안 멎는다. */
test('목록이 없으면 첫 질문 하나로 읽는다', () => {
  const parsed = parseRunStreamEvent(
    JSON.stringify({
      type: 'question',
      question: { id: 'scope:Map_scene', text: '덜 담긴 씬이 있습니다. 더 담을까요?', options: [] },
    }),
  )

  assert.equal(parsed?.type, 'question')
  assert.deepEqual(
    parsed.type === 'question' ? parsed.questions?.map((q) => q.id) : [],
    ['scope:Map_scene'],
  )
})
