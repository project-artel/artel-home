import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { updateScenario } from './scenarioApi'
import type { ScenarioDraft } from './scenarioTypes'

/**
 * The scenario's title as a click-to-rename crumb (재설계 2026-08-08, ARTEL-285),
 * mirroring {@link RunNameCrumb}. Renaming writes the title into the scenario's
 * `payload` via {@link updateScenario} (the whole draft is sent, last-write-wins),
 * so the caller passes the current draft and adopts the returned one.
 *
 * Uncontrolled input read at blur: Enter and click-away commit, Esc cancels. A
 * blank or unchanged value is a no-op.
 */
export function ScenarioNameCrumb({
  testScenarioId,
  draft,
  onRenamed,
}: {
  testScenarioId: number
  draft: ScenarioDraft
  onRenamed?: (draft: ScenarioDraft) => void
}) {
  const { t } = useI18n()
  const e = t.scenarios.stepsView
  const [renaming, setRenaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const cancel = useRef(false)

  const current = draft.title
  const shown = current.length > 0 ? current : t.scenarios.page.untitled

  useEffect(() => { if (!renaming) setSaving(false) }, [renaming])

  async function commit(raw: string) {
    setRenaming(false)
    if (cancel.current) { cancel.current = false; return }
    const next = raw.trim()
    if (next.length === 0 || next === current) return
    setSaving(true)
    try {
      const updated = await updateScenario(testScenarioId, { ...draft, title: next })
      onRenamed?.(updated.payload)
    } catch {
      // Keep the old title on failure; the field reverts on the next render.
    } finally {
      setSaving(false)
    }
  }

  if (renaming) {
    // A borderless, full-width textarea that soft-wraps to the page rather than a
    // fixed box that clips a long title — edited like text on the page. Enter
    // commits (no hard newlines in a title), Esc cancels, blur commits. Auto-grows
    // to fit its content.
    return (
      <textarea
        className="st-title-edit"
        autoFocus
        rows={1}
        defaultValue={current}
        disabled={saving}
        aria-label={e.renameLabel}
        ref={(el) => {
          if (el === null) return
          el.style.height = 'auto'
          el.style.height = `${el.scrollHeight}px`
          el.setSelectionRange(el.value.length, el.value.length)
        }}
        onInput={(ev) => {
          const el = ev.currentTarget
          el.style.height = 'auto'
          el.style.height = `${el.scrollHeight}px`
        }}
        onBlur={(ev) => void commit(ev.currentTarget.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); ev.currentTarget.blur() }
          else if (ev.key === 'Escape') { cancel.current = true; ev.currentTarget.blur() }
        }}
      />
    )
  }
  return (
    <button className="scn scn--editable" type="button" title={e.renameHint} onClick={() => setRenaming(true)}>
      <span className="scn-text">{shown}</span>
      <span className="scn-pencil" aria-hidden="true">✎</span>
    </button>
  )
}
