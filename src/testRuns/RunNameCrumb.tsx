import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useActionBinding } from '../projectAgent/bindings'
import { TEST_RUN_EDIT_RENAME_ACTION } from '../projectAgent/specs/testRunEdit'
import { updateTestRun, type TestRun } from './testRunApi'

/**
 * The run's name as a click-to-rename crumb, shared by the run edit shell and the
 * scenario studio (both open in a run context and both want the run named at the
 * top-left). The scenario's own title is edited in the document body, so here the
 * crumb carries the TestRun.
 *
 * Uncontrolled input read at blur: Enter and click-away commit, Esc cancels (a ref
 * skips the commit that the Esc-triggered blur would otherwise fire). A blank or
 * unchanged value is a no-op. `name` is adopted when the prop changes so a late
 * fetch (studio loads the run after mount) fills in.
 */
export function RunNameCrumb({
  projectId,
  runId,
  name,
  onRenamed,
}: {
  projectId: string
  runId: string
  name: string
  onRenamed?: (run: TestRun) => void
}) {
  const { t } = useI18n()
  const e = t.scenarios.runEdit
  const [renaming, setRenaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [current, setCurrent] = useState(name)
  const cancel = useRef(false)

  useEffect(() => setCurrent(name), [name])

  /** 이름을 서버에 저장한다. 실패하면 던진다. 입력칸은 삼키고, agent 는 오류로 받는다. */
  async function save(next: string) {
    setSaving(true)
    try {
      const updated = await updateTestRun(projectId, runId, { name: next })
      setCurrent(updated.name)
      onRenamed?.(updated)
    } finally {
      setSaving(false)
    }
  }

  async function commit(raw: string) {
    setRenaming(false)
    if (cancel.current) { cancel.current = false; return }
    const next = raw.trim()
    if (next.length === 0 || next === current) return
    try {
      await save(next)
    } catch {
      // Keep the old name on failure; the field reverts on the next render.
    }
  }

  const nameControl = useRef<HTMLElement | null>(null)
  useActionBinding(TEST_RUN_EDIT_RENAME_ACTION, {
    target: () => nameControl.current,
    blocked: () => (saving ? 'The run is being renamed.' : null),
    run: async (args) => {
      const next = typeof args.name === 'string' ? args.name.trim() : ''
      if (next.length === 0) throw new Error('The run name must not be empty.')
      if (next !== current) await save(next)
      return { name: next }
    },
  })

  if (renaming) {
    return (
      <input
        className="st-crumb-edit"
        autoFocus
        ref={(node) => { nameControl.current = node }}
        defaultValue={current}
        disabled={saving}
        aria-label={e.renameLabel}
        onBlur={(ev) => void commit(ev.currentTarget.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') ev.currentTarget.blur()
          else if (ev.key === 'Escape') { cancel.current = true; ev.currentTarget.blur() }
        }}
      />
    )
  }
  return (
    <button className="scn scn--editable" type="button" title={e.renameHint} onClick={() => setRenaming(true)} ref={(node) => { nameControl.current = node }}>
      <span className="scn-text">{current || e.untitled}</span>
      <span className="scn-pencil" aria-hidden="true">✎</span>
    </button>
  )
}
