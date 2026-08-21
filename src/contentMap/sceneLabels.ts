import type { Messages } from '../i18n/messages'
import type { SceneNode } from './sceneGraphLayout'

/*
 * 노드 하나를 사람이 읽는 형태로.
 *
 * 규칙은 파서 쪽과 같다: 이 빌드가 모르는 값도 감추지 않고, 대신 모른다는
 * 사실을 정직하게 붙여서 보여 준다.
 */

/** 씬의 성격. 마크의 모양과 범례 한 줄이 여기서 나온다. */
export type SceneKind = 'walked' | 'notWalked' | 'unmapped'

export function sceneKind(node: SceneNode): SceneKind {
  if (node.scene === null) return 'unmapped'
  return node.scene.walked ? 'walked' : 'notWalked'
}

/** 색만으로는 아무것도 말하지 않는다. 모양이 성격을 함께 말한다. */
export type SceneShape = 'circle' | 'square' | 'diamond'

export function sceneShape(node: SceneNode): SceneShape {
  const kind = sceneKind(node)
  if (kind === 'walked') return 'circle'
  if (kind === 'notWalked') return 'square'
  return 'diamond'
}

/**
 * 목록과 마크에 쓰는 이름.
 *
 * 이름이 없는 경우가 두 가지다. 콘텐츠 맵에 있는데 이름이 비어 있는 씬과,
 * 서버가 목적지 이름조차 주지 않은 전이. 두 문장을 나누는 이유는 사용자가
 * 확인해야 할 곳이 다르기 때문이다 — 앞은 씬 정의, 뒤는 전이 기록이다.
 */
export function sceneTitle(t: Messages, node: SceneNode): string {
  const name = node.name.trim()
  if (name.length > 0) return name
  return node.scene === null ? t.contentMap.list.unnamedDestination : t.contentMap.list.untitled
}
