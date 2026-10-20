import { useLayoutEffect, useMemo, useRef } from 'react'
// registry/index 는 provider 와 강조 표시 component(CSS 포함)까지 내보낸다. 페이지가 이 파일을
// 불러올 때 그것까지 끌려오지 않도록 hook 파일을 직접 부른다. node:test 는 CSS 를 읽지 못한다.
import { useAgentAction, useAgentField } from './registry/useAgentBindings'
import type { ActionBinding, ActionSpec, FieldBinding, FieldSpec } from './registry/types'

/*
 * 페이지가 binding 을 등록하는 hook. binding 객체는 mount 동안 한 번만 만들고, 안의 함수는 매
 * 렌더가 남기는 최신 구현을 부른다. 그래야 registry 가 binding 을 mount 때 한 번만 읽어도 닫힌
 * 값(state, props)이 낡지 않는다.
 */

type ActionImplementation = Pick<ActionBinding, 'target' | 'blocked' | 'run'>
type FieldImplementation = Omit<FieldBinding, 'spec'>

export function useActionBinding(spec: ActionSpec, implementation: ActionImplementation): void {
  const latest = useRef(implementation)
  useLayoutEffect(() => {
    latest.current = implementation
  })
  const binding = useMemo<ActionBinding>(
    () => ({
      spec,
      target: () => latest.current.target(),
      blocked: () => latest.current.blocked(),
      run: (args) => latest.current.run(args),
    }),
    [spec],
  )
  useAgentAction(binding)
}

export function useFieldBinding(spec: FieldSpec, implementation: FieldImplementation): void {
  const latest = useRef(implementation)
  useLayoutEffect(() => {
    latest.current = implementation
  })
  const hasOptions = implementation.options !== undefined
  const binding = useMemo<FieldBinding>(
    () => ({
      spec,
      target: () => latest.current.target(),
      read: () => latest.current.read(),
      options: hasOptions ? () => latest.current.options?.() ?? [] : undefined,
      write: (value) => latest.current.write(value),
    }),
    [spec, hasOptions],
  )
  useAgentField(binding)
}
