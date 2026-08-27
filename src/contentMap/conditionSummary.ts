import type { Messages } from '../i18n/messages'
import type { ConditionNode } from './contentMapTypes'

/*
 * 조건 트리를 그래프 위 한 줄로.
 *
 * 인스펙터는 트리를 통째로 편다. 그림은 그럴 자리가 없어서 한 줄로 접어야
 * 하는데, 접는 방식이 곧 이 파일의 위험이다: 접다가 뜻이 뒤집히면 그 라벨을
 * 읽은 사람은 반대로 된 조건을 믿는다.
 *
 * 그래서 규칙 셋을 지킨다.
 *
 *   1. `either` 와 `every` 를 절대 같은 말로 접지 않는다. "둘 중 하나"가
 *      "둘 다"가 되면 그 전이는 아예 다른 전이다.
 *   2. `always` 와 `unknown` 을 섞지 않는다. 앞은 "아무 때나 된다"는 사실이고
 *      뒤는 "우리가 못 읽었다"는 사실이다.
 *   3. 모르는 `kind` 를 아는 모양으로 접지 않는다. 서버가 쓴 이름을 그대로
 *      보여 준다.
 *
 * 순수 함수다. 자르는 것은 부르는 쪽이 한다 — 폭 예산은 그림이 알고 이 파일은
 * 모른다.
 */

/** 한 줄에 늘어놓을 하위 조건 수. 넘으면 나머지는 세어서 말한다. */
const PARTS_SHOWN = 2

export function conditionSummary(t: Messages, node: ConditionNode): string {
  const copy = t.contentMap.graph

  switch (node.kind) {
    case 'always':
      return copy.conditionAlways

    case 'test':
      // 연산자를 사람 말로 옮기지 않는다. 그 번역은 서버 몫이고, 여기서 지어내면
      // `>=` 를 "크다"로 잘못 읽는 라벨이 나온다.
      return `${node.left} ${node.operator} ${node.right}`

    case 'gesture':
      return copy.conditionGesture(node.input)

    case 'every':
    case 'either':
      return joinParts(t, node.kind, node.parts)

    case 'unknown':
      return copy.conditionUnknown

    case 'unrecognisedKind':
      return copy.conditionUnrecognised(node.reportedKind)
  }
}

function joinParts(
  t: Messages,
  kind: 'every' | 'either',
  parts: readonly ConditionNode[],
): string {
  const copy = t.contentMap.graph

  if (parts.length === 0) {
    // 마디는 있는데 안이 비었다. "아무 때나 된다"로 접으면 없는 사실을 만든다.
    return copy.conditionEmpty
  }

  const shown = parts.slice(0, PARTS_SHOWN).map((part) => conditionSummary(t, part))
  const joined = shown.join(kind === 'every' ? copy.conditionEveryJoin : copy.conditionEitherJoin)
  const hidden = parts.length - shown.length

  return hidden > 0 ? copy.conditionMore(joined, hidden) : joined
}
