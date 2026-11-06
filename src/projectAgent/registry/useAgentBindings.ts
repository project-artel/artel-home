import { useEffect, useLayoutEffect, useRef } from 'react'
import { useActionRegistry } from './registryContext'
import type { ActionBinding, FieldBinding } from './types'

/**
 * mount 할 때 등록하고 unmount 할 때 푼다. 매 render 마다 새 closure 가 오므로 registry 에는 최신
 * binding 을 읽는 얇은 대리자를 한 번만 등록한다. 다시 등록하는 때는 action id 가 바뀔 때뿐이다.
 */
export function useAgentAction(binding: ActionBinding): void {
  const registry = useActionRegistry()
  const latest = useRef(binding)
  useLayoutEffect(() => {
    latest.current = binding
  })
  const actionId = binding.spec.id
  useEffect(() => {
    const proxy: ActionBinding = {
      get spec() {
        return latest.current.spec
      },
      target: () => latest.current.target(),
      blocked: () => latest.current.blocked(),
      run: (args) => latest.current.run(args),
    }
    return registry.registerAction(proxy)
  }, [registry, actionId])
}

export function useAgentField(binding: FieldBinding): void {
  const registry = useActionRegistry()
  const latest = useRef(binding)
  useLayoutEffect(() => {
    latest.current = binding
  })
  const fieldName = binding.spec.name
  useEffect(() => {
    const proxy: FieldBinding = {
      get spec() {
        return latest.current.spec
      },
      target: () => latest.current.target(),
      read: () => latest.current.read(),
      options: binding.options === undefined ? undefined : () => latest.current.options?.() ?? [],
      write: (value) => latest.current.write(value),
    }
    return registry.registerField(proxy)
    // options 의 유무는 binding 의 모양이라 이름이 같으면 바뀌지 않는다고 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, fieldName])
}
