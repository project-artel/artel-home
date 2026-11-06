import { useEffect, useReducer, useState } from 'react'
import type { ActionOutcome } from './types'
import { useActionRegistry } from './registryContext'

/**
 * 개발 빌드에서만 그려지는 수동 호출 panel. snapshot 에 올라온 action 과 field 를 손으로 불러
 * 강조 표시와 승인 흐름을 확인한다. 문구는 개발자용이라 번역하지 않는다.
 */
export function AgentRegistryDevPanel() {
  const registry = useActionRegistry()
  const [, refresh] = useReducer((count: number) => count + 1, 0)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [lastOutcome, setLastOutcome] = useState('')

  useEffect(() => registry.subscribe(refresh), [registry])

  const snapshot = registry.snapshot()

  async function report(call: () => Promise<ActionOutcome>) {
    setLastOutcome('running...')
    setLastOutcome(JSON.stringify(await call(), null, 1) ?? '')
  }

  function parseInput(key: string, fallback: string): unknown {
    const text = inputs[key] ?? fallback
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  return (
    <details className="agent-dev-panel">
      <summary>Agent registry (dev)</summary>
      <p>
        page: {snapshot.page ?? 'none'} {JSON.stringify(snapshot.params)}
      </p>
      <h2>Actions</h2>
      <ul>
        {snapshot.actions.map((action) => (
          <li key={action.id}>
            <code>{action.id}</code>
            {action.blocked !== null && <em> blocked: {action.blocked}</em>}
            <input
              aria-label={`${action.id} args`}
              onChange={(event) => setInputs({ ...inputs, [action.id]: event.target.value })}
              placeholder="{}"
              value={inputs[action.id] ?? ''}
            />
            <button
              onClick={() => void report(() => registry.callAction(action.id, parseInput(action.id, '{}') as Record<string, unknown>))}
              type="button"
            >
              Call
            </button>
          </li>
        ))}
      </ul>
      <h2>Fields</h2>
      <ul>
        {Object.entries(snapshot.fields).map(([name, field]) => (
          <li key={name}>
            <code>{name}</code> = {JSON.stringify(field.value)}
            <input
              aria-label={`${name} value`}
              onChange={(event) => setInputs({ ...inputs, [name]: event.target.value })}
              value={inputs[name] ?? ''}
            />
            <button onClick={() => void report(() => registry.setField(name, parseInput(name, '')))} type="button">
              Set
            </button>
          </li>
        ))}
      </ul>
      {lastOutcome !== '' && <pre>{lastOutcome}</pre>}
    </details>
  )
}
