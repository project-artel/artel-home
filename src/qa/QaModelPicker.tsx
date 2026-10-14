import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import { groupQaModels, selectableQaModelKeys } from './qaModelGroups'
import { CheckIcon, ChevronDownIcon, GiftIcon, KeyIcon, LockIcon, SearchIcon } from './qaModelIcons'
import { qaModelOptionKey, type QaModel } from './qaTypes'

const PRICE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/**
 * The model a QA run uses, picked from two sections: models offered on the
 * platform key and models on the user's own keys.
 *
 * It replaces a native `select` because a native one cannot say who pays for a
 * run: its popup is drawn by the OS, ignores the theme, and has no section
 * headers, badges or locked rows. What the picker must make plain is that, so
 * the closed trigger carries the same badge as the section the model came from.
 *
 * A model on a provider with no key is still listed, locked, rather than hidden —
 * a user deciding whether to register a key needs to see what it would unlock.
 *
 * `value` is an option key (`qaModelOptionKey`), not a model id: the same model
 * can be offered on both keys and those are two different choices.
 */
export function QaModelPicker({
  disabled,
  id,
  models,
  onChange,
  value,
}: {
  disabled: boolean
  /** Given to the trigger, so the field's `<label htmlFor>` names it. */
  id: string
  models: QaModel[]
  onChange: (optionKey: string) => void
  value: string
}) {
  const { t } = useI18n()
  const p = t.qa.panel
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState('')
  // 노드를 state 로 든다 — {@link EdgeScrollbar} 가 붙는 시점을 알아야 한다.
  const [listNode, setListNode] = useState<HTMLUListElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  const groups = useMemo(() => groupQaModels(models, query), [models, query])
  const keys = useMemo(() => selectableQaModelKeys(groups), [groups])
  const selected = models.find((model) => qaModelOptionKey(model) === value) ?? null
  // 검색이 바뀌면 가리키던 행이 목록에서 빠질 수 있다. effect 로 고치면 한 프레임 동안 아무것도
  // 안 가리키므로, 그릴 때 첫 행으로 돌린다.
  const current = keys.includes(active) ? active : (keys[0] ?? '')
  const optionId = (key: string) => `${listId}-${key}`
  const priced = groups.user.some((group) => group.models.some((model) => model.pricing !== null))

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open && current !== '') {
      document.getElementById(optionId(current))?.scrollIntoView({ block: 'nearest' })
    }
    // optionId 는 listId 로만 정해진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current])

  function show() {
    setQuery('')
    setActive(value)
    setOpen(true)
  }

  function choose(key: string) {
    onChange(key)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const at = keys.indexOf(current)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (keys.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive(keys[(at + step + keys.length) % keys.length])
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (current !== '') choose(current)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  function option(model: QaModel, trailing: string, service = model.provider) {
    const key = qaModelOptionKey(model)
    const locked = !model.keyRegistered
    return (
      <li
        aria-disabled={locked || undefined}
        aria-selected={key === value}
        className={
          'qa-model-option'
          + (key === current ? ' is-active' : '')
          + (key === value ? ' is-selected' : '')
          + (locked ? ' is-locked' : '')
        }
        id={optionId(key)}
        key={key}
        onClick={locked ? undefined : () => choose(key)}
        onMouseEnter={locked ? undefined : () => setActive(key)}
        role="option"
        title={locked ? p.keyMissingHint(service) : undefined}
      >
        <span className="qa-model-option-mark">
          {key === value ? <CheckIcon /> : locked ? <LockIcon size={14} /> : null}
        </span>
        <span className="qa-model-option-label">{model.label}</span>
        {model.multimodal && <span className="qa-model-tag">{p.multimodal}</span>}
        {model.reasoning !== null && <span className="qa-model-tag">{p.reasoningTag}</span>}
        <span className="qa-model-option-trailing">{trailing}</span>
      </li>
    )
  }

  return (
    <div className="qa-model-picker" ref={rootRef}>
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="qa-model-trigger"
        disabled={disabled}
        id={id}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            show()
          }
        }}
        ref={triggerRef}
        type="button"
      >
        {selected === null ? (
          <span className="qa-model-trigger-placeholder">{p.modelPlaceholder}</span>
        ) : (
          <>
            {selected.keySource === 'platform' ? (
              <span className="qa-model-badge qa-model-badge--platform">
                <GiftIcon size={14} />
                {p.platformBadge}
              </span>
            ) : (
              <span className="qa-model-badge qa-model-badge--user">
                <KeyIcon size={14} />
                {p.userBadge}
              </span>
            )}
            <span className="qa-model-trigger-label">{selected.label}</span>
            <span className="qa-model-trigger-provider">{selected.provider}</span>
          </>
        )}
        <ChevronDownIcon className="qa-model-trigger-chevron" size={18} />
      </button>

      {open && (
        <div className="qa-model-popover">
          <label className="qa-model-search">
            <SearchIcon size={15} />
            <input
              aria-activedescendant={current === '' ? undefined : optionId(current)}
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded
              aria-label={p.modelSearch}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={p.modelSearch}
              role="combobox"
              type="text"
              value={query}
            />
          </label>

          <ul aria-label={p.modelLabel} className="qa-model-list" id={listId} ref={setListNode} role="listbox">
            {groups.platform.length > 0 && (
              <li className="qa-model-group" role="presentation">
                <div className="qa-model-section">
                  <GiftIcon className="qa-model-section-icon--platform" size={15} />
                  <span className="qa-model-section-title">{p.platformSection}</span>
                  <span>· {p.platformSectionHint}</span>
                </div>
                <ul aria-label={p.platformSection} role="group">
                  {groups.platform.map((model) => option(model, model.provider))}
                </ul>
              </li>
            )}

            {groups.user.length > 0 && (
              <li className="qa-model-group" role="presentation">
                <div className="qa-model-section">
                  <KeyIcon size={15} />
                  <span className="qa-model-section-title">{p.userSection}</span>
                  <span>· {p.userSectionHint}</span>
                </div>
                {groups.user.map((group) => (
                  <ul aria-label={`${p.userSection} · ${group.provider}`} key={group.provider} role="group">
                    <li className="qa-model-provider" role="presentation">
                      <span>{group.provider}</span>
                      {group.registered ? (
                        <span className="qa-model-key-hint">{group.keyHint}</span>
                      ) : (
                        <span className="qa-model-key-missing">{p.keyMissing}</span>
                      )}
                    </li>
                    {group.models.map((model) =>
                      option(
                        model,
                        model.pricing === null
                          ? model.provider
                          : `$${PRICE.format(model.pricing.inputPerMtok)} / $${PRICE.format(model.pricing.outputPerMtok)}`,
                        group.provider,
                      ),
                    )}
                  </ul>
                ))}
              </li>
            )}

            {groups.platform.length === 0 && groups.user.length === 0 && (
              <li className="qa-model-empty" role="presentation">{p.modelNoMatch}</li>
            )}
          </ul>
          <EdgeScrollbar label={p.modelLabel} scroller={listNode} side="right" />

          {priced && <p className="qa-model-footnote">{p.pricingNote}</p>}
        </div>
      )}
    </div>
  )
}
