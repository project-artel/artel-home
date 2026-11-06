import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { LLM_KEY_SERVICES, llmKeyApiName, llmKeyServiceName } from '../account/llmKeyTypes'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import {
  groupQaModels,
  qaKeyServiceOf,
  qaModelDisplayLabel,
  selectableQaModelKeys,
} from './qaModelGroups'
import {
  CheckIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  CircleXIcon,
  GiftIcon,
  KeyIcon,
  LockIcon,
  SearchIcon,
} from './qaModelIcons'
import { ProviderLogo } from './launch/ProviderLogo'
import { qaModelOptionKey, type QaModel } from './qaTypes'

/** The platform tab; every other tab is a key service (`LLM_KEY_SERVICES`). */
const PLATFORM_TAB = 'platform'

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
 * The sections are tabs — the platform key, then one per key service the user
 * can register (Claude, GPT, OpenRouter) — rather than one long list or a
 * scrolling pane per section. The platform section alone runs past a dozen
 * rows, so stacked it buried the user's own keys below the fold; a pane per
 * section put a scroller inside a scroller, where the wheel catches on the
 * first. And an OpenRouter key reaches Claude and GPT models through rows of its
 * own, so one "your keys" list repeated them. Tabs keep one list and one
 * scrollbar, and their counts still say what the others hold. A search ignores
 * the tabs and shows every section, because "is this model on my key too?" is
 * exactly the question a search asks.
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
  popoverWidth,
}: {
  /**
   * 주면 목록을 트리거 폭이 아니라 이 폭으로, 트리거 오른쪽 끝에 맞춰 화면에 고정해 연다(ARTEL-1084).
   * 좁은 패널 안에서 쓰면 트리거 폭으로는 탭(특히 OpenRouter)과 이름이 잘린다. 패널이 스크롤 영역이라
   * CSS 로 넓히면 패널 밖이 잘리므로, 열 때 트리거 자리를 재서 `position: fixed` 로 띄운다.
   */
  popoverWidth?: number
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
  const [popoverBox, setPopoverBox] = useState<CSSProperties | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState('')
  const [tab, setTab] = useState<string>(PLATFORM_TAB)
  // 노드를 state 로 든다 — {@link EdgeScrollbar} 가 붙는 시점을 알아야 한다.
  const [listNode, setListNode] = useState<HTMLUListElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const all = useMemo(() => groupQaModels(models), [models])
  const tabs = [
    ...(all.platform.length > 0
      ? [{ id: PLATFORM_TAB, count: all.platform.length, registered: true, keyHint: null }]
      : []),
    // 키를 넣을 수 있는 서비스는 서버가 그 모델을 하나도 보내지 않아도 탭으로 둔다. 키가 없다는 것과
    // 어디서 넣는지를 말하는 자리가 이 탭이다 — 감추면 사용자는 키를 넣을 수 있다는 것부터 모른다.
    ...[
      ...LLM_KEY_SERVICES,
      ...all.user
        .map((group) => group.provider)
        .filter((service) => !(LLM_KEY_SERVICES as readonly string[]).includes(service)),
    ].map((service) => {
      const group = all.user.find((entry) => entry.provider === service)
      return {
        id: service,
        count: group?.models.length ?? 0,
        registered: group?.registered ?? false,
        keyHint: group?.keyHint ?? null,
      }
    }),
  ]
  const tabbed = query.trim() === ''
  const shownTab = tabs.find((entry) => entry.id === tab) ?? tabs[0]
  const matched = useMemo(() => groupQaModels(models, query), [models, query])
  const groups = useMemo(
    () =>
      tabbed
        ? {
            platform: tab === PLATFORM_TAB ? matched.platform : [],
            user: matched.user.filter((group) => group.provider === tab),
          }
        : matched,
    [tabbed, tab, matched],
  )
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
    setTab(
      selected === null || selected.keySource === 'platform'
        ? PLATFORM_TAB
        : qaKeyServiceOf(selected),
    )
    setActive(value)
    const rect = triggerRef.current?.getBoundingClientRect()
    setPopoverBox(
      popoverWidth === undefined || rect === undefined
        ? undefined
        : {
            position: 'fixed',
            top: rect.bottom + 4,
            left: Math.max(8, Math.min(rect.right, window.innerWidth - 8) - popoverWidth),
            right: 'auto',
            width: Math.min(popoverWidth, window.innerWidth - 24),
            maxHeight: `calc(100vh - ${Math.round(rect.bottom) + 16}px)`,
          },
    )
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
    } else if (tabbed && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      // 탭은 검색어가 비어 있을 때만 보이므로, 좌우 화살표가 커서 이동을 빼앗지 않는다.
      event.preventDefault()
      const at = tabs.findIndex((entry) => entry.id === shownTab?.id)
      const step = event.key === 'ArrowRight' ? 1 : -1
      setTab(tabs[(at + step + tabs.length) % tabs.length].id)
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

  /** Whether a key service has a key. An icon and the words, never the color alone. */
  function keyStatus(registered: boolean, keyHint: string | null) {
    return registered ? (
      <span className="qa-model-key-status qa-model-key-status--ok">
        <CircleCheckIcon size={13} />
        {p.keyVerified(keyHint ?? '')}
      </span>
    ) : (
      <span className="qa-model-key-status qa-model-key-status--missing">
        <CircleXIcon size={13} />
        {p.keyMissing}
      </span>
    )
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
        title={locked ? p.keyMissingHint(llmKeyServiceName(service)) : undefined}
      >
        <span className="qa-model-option-mark">
          {key === value ? <CheckIcon /> : locked ? <LockIcon size={14} /> : null}
        </span>
        <ProviderLogo provider={model.provider} size={16} />
        <span className="qa-model-option-label">{qaModelDisplayLabel(model)}</span>
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
                {llmKeyApiName(qaKeyServiceOf(selected))}
              </span>
            )}
            <ProviderLogo provider={selected.provider} size={18} />
            <span className="qa-model-trigger-label">{qaModelDisplayLabel(selected)}</span>
            <span className="qa-model-trigger-provider">{selected.provider}</span>
          </>
        )}
        <ChevronDownIcon className="qa-model-trigger-chevron" size={18} />
      </button>

      {open && (
        <div className="qa-model-popover" style={popoverBox}>
          {tabbed && (
            <div aria-label={p.modelLabel} className="qa-model-tabs" role="tablist">
              {tabs.map((entry) => (
                <button
                  aria-controls={listId}
                  aria-selected={entry.id === shownTab?.id}
                  className={'qa-model-tab' + (entry.id === shownTab?.id ? ' is-active' : '')}
                  key={entry.id}
                  onClick={() => {
                    setTab(entry.id)
                    searchRef.current?.focus()
                  }}
                  // 누르는 동안 검색칸이 포커스를 잃지 않게 한다 — 화살표와 Enter 가 거기서 받는다.
                  onMouseDown={(event) => event.preventDefault()}
                  role="tab"
                  tabIndex={-1}
                  type="button"
                >
                  {entry.id === PLATFORM_TAB ? (
                    <GiftIcon size={14} />
                  ) : entry.registered ? (
                    <KeyIcon size={14} />
                  ) : (
                    <LockIcon size={14} />
                  )}
                  {entry.id === PLATFORM_TAB ? p.platformSection : llmKeyServiceName(entry.id)}
                  <span className="qa-model-tab-count">{entry.count}</span>
                </button>
              ))}
            </div>
          )}
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
              ref={searchRef}
              role="combobox"
              type="text"
              value={query}
            />
          </label>

          {tabbed && shownTab !== undefined && (
            <p className="qa-model-tab-hint">
              {shownTab.id === PLATFORM_TAB
                ? p.platformSectionHint
                : (
                  <>
                    {keyStatus(shownTab.registered, shownTab.keyHint)}
                    {!shownTab.registered && (
                      <Link className="qa-model-register-link" to="/account">
                        {p.registerKey}
                      </Link>
                    )}
                  </>
                )}
            </p>
          )}
          <ul aria-label={p.modelLabel} className="qa-model-list" id={listId} ref={setListNode} role="listbox">
            {groups.platform.length > 0 && (
              <li className="qa-model-group" role="presentation">
                <div className="qa-model-section" hidden={tabbed}>
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
                <div className="qa-model-section" hidden={tabbed}>
                  <KeyIcon size={15} />
                  <span className="qa-model-section-title">{p.userSection}</span>
                  <span>· {p.userSectionHint}</span>
                </div>
                {groups.user.map((group) => (
                  <ul
                    aria-label={`${p.userSection} · ${llmKeyServiceName(group.provider)}`}
                    key={group.provider}
                    role="group"
                  >
                    {/* 탭 아래 안내 줄이 같은 것을 말하므로, 탭으로 볼 때는 감춘다. */}
                    <li className="qa-model-provider" hidden={tabbed} role="presentation">
                      <span>{llmKeyServiceName(group.provider)}</span>
                      {keyStatus(group.registered, group.keyHint)}
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
              <li className="qa-model-empty" role="presentation">
                {tabbed && shownTab !== undefined && shownTab.id !== PLATFORM_TAB
                  ? p.keyTabEmpty(llmKeyServiceName(shownTab.id))
                  : p.modelNoMatch}
              </li>
            )}
          </ul>
          <EdgeScrollbar label={p.modelLabel} scroller={listNode} side="right" />

          {priced && <p className="qa-model-footnote">{p.pricingNote}</p>}
        </div>
      )}
    </div>
  )
}
