import type { Messages } from '../i18n/messages'
import type { ContentMapScreen } from './contentMapTypes'

/*
 * 화면 하나를 사람이 읽는 형태로. `sceneLabels.ts` 와 같은 규칙이고, 이름이 없는 것이 결손이
 * 아니라 보통이라는 사실이 두 함수를 가른다.
 *
 * tree 와 인스펙터가 둘 다 쓴다. 한쪽에 두고 다른 쪽이 가져다 쓰면, 이름 없는 화면을 어떻게
 * 부르느냐가 컴포넌트 사이의 의존이 된다.
 */

/** 이름이 없는 것이 보통이다. 자리를 비워 두지 않고 없다고 말한다. */
export function screenTitle(t: Messages, screen: ContentMapScreen): string {
  const name = screen.name?.trim() ?? ''
  return name.length > 0 ? name : t.contentMap.inspector.unnamedScreen
}

/**
 * 이름과, 이름이 없을 때의 id.
 *
 * 한 줄에 화면 둘이 함께 서는 자리 — 전이의 양 끝 — 에서는 이름만으로는 "이름 없는 screen →
 * 이름 없는 screen" 이 되어 어느 화면에서 어느 화면으로 가는지 아무 말도 하지 않는다.
 */
export function screenLabel(t: Messages, screen: ContentMapScreen): string {
  const name = screen.name?.trim() ?? ''
  return name.length > 0
    ? name
    : `${t.contentMap.inspector.unnamedScreen} ${t.contentMap.inspector.screenIdShort(screen.id)}`
}

/** 이 화면이 이름을 갖고 있나. 기울임과 id 꼬리표가 이 값에서 갈린다. */
export function screenIsNamed(screen: ContentMapScreen): boolean {
  return (screen.name?.trim() ?? '').length > 0
}
