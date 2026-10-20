// registry/index 는 provider 와 강조 표시 component(CSS 포함)까지 내보낸다. 페이지가 이 파일을
// 불러올 때 그것까지 끌려오지 않도록 hook 파일을 직접 부른다. node:test 는 CSS 를 읽지 못한다.
import { useAgentAction, useAgentField } from './registry/useAgentBindings'
import type { ActionBinding, ActionSpec, FieldBinding, FieldSpec } from './registry/types'

/*
 * 페이지가 binding 을 등록하는 hook. spec 과 구현을 합쳐 registry hook 에 넘기기만 한다. 매 렌더의
 * 최신 closure 를 읽는 일은 `useAgentAction` 과 `useAgentField` 가 한다.
 */

type ActionImplementation = Pick<ActionBinding, 'target' | 'blocked' | 'run'>
type FieldImplementation = Omit<FieldBinding, 'spec'>

export function useActionBinding(spec: ActionSpec, implementation: ActionImplementation): void {
  useAgentAction({ spec, ...implementation })
}

export function useFieldBinding(spec: FieldSpec, implementation: FieldImplementation): void {
  useAgentField({ spec, ...implementation })
}
