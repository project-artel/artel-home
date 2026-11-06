import { useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react'
import { useI18n } from '../../i18n/useI18n'
import type { ProjectMember } from '../../projects/memberTypes'
import { caretPosition } from './caretPosition'
import { Avatar } from './discussionParts'

/** 글자 바로 앞의 `@검색어`. 공백이나 다른 `@` 가 끼면 멘션을 쓰는 중이 아니다. */
const MENTION_AT_CARET = /(^|\s)@([^\s@]{0,30})$/

/**
 * `@` 를 치면 아래에 프로젝트 멤버가 뜨고, 이어 치는 글자로 좁혀지는 입력칸(ARTEL-1114). ↑↓ 로 고르고 Enter · Tab 으로
 * 넣는다. 넣으면 글에 `@이름 ` 이 들어가고 그 멤버가 멘션 목록에 더해진다. 글에서 `@이름` 을 지우면 멘션에서도 빠진다.
 */
export function MentionTextarea({
  id,
  value,
  onChange,
  mentions,
  onMentionsChange,
  members,
  placeholder,
  rows = 4,
  maxLength,
  disabled = false,
  className,
  required = false,
  autoFocus = false,
  inputRef,
  onKeyDownExtra,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  mentions: readonly string[]
  onMentionsChange: (ids: string[]) => void
  members: readonly ProjectMember[]
  placeholder?: string
  rows?: number
  maxLength?: number
  disabled?: boolean
  className?: string
  required?: boolean
  autoFocus?: boolean
  /** 바깥(도구 줄)이 글 선택을 다룰 때 쓰는 같은 입력칸. */
  inputRef?: MutableRefObject<HTMLTextAreaElement | null>
  /** 멘션 목록이 키를 쓰지 않았을 때 부른다. 단축키(⌘B 등)가 쓴다. */
  onKeyDownExtra?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  // 목록은 `@` 를 친 바로 그 자리 아래에 뜬다.
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  const matches = useMemo(() => {
    if (query === null) return []
    const needle = query.toLowerCase()
    return members
      .filter((member) => member.nickname.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [members, query])

  function readQuery(text: string, caret: number) {
    const match = MENTION_AT_CARET.exec(text.slice(0, caret))
    setQuery(match ? match[2] : null)
    setHighlight(0)
    const element = ref.current
    if (match && element) {
      const at = caret - match[2].length - 1
      const point = caretPosition(element, at)
      setAnchor({
        top: element.offsetTop + point.top + point.height + 4,
        left: Math.min(element.offsetLeft + point.left, Math.max(0, element.offsetLeft + element.clientWidth - 280)),
      })
    }
  }

  function change(next: string, caret: number) {
    onChange(next)
    readQuery(next, caret)
    // 글에서 `@이름` 이 사라진 멤버는 멘션에서도 뺀다.
    const kept = mentions.filter((memberId) => {
      const member = members.find((one) => one.userId === memberId)
      return member !== undefined && next.includes(`@${member.nickname}`)
    })
    if (kept.length !== mentions.length) onMentionsChange(kept)
  }

  function insert(member: ProjectMember) {
    const element = ref.current
    const caret = element?.selectionStart ?? value.length
    const before = value.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${member.nickname} `)
    const next = before + value.slice(caret)
    onChange(next)
    if (!mentions.includes(member.userId)) onMentionsChange([...mentions, member.userId])
    setQuery(null)
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(before.length, before.length)
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || event.nativeEvent.isComposing) {
      onKeyDownExtra?.(event)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setQuery(null)
      return
    }
    if (matches.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      insert(matches[highlight])
    }
  }

  return (
    <div className="mention-field">
      <textarea
        aria-autocomplete="list"
        aria-expanded={query !== null}
        autoFocus={autoFocus}
        className={className}
        disabled={disabled}
        id={id}
        maxLength={maxLength}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        onChange={(event) => change(event.target.value, event.target.selectionStart)}
        onClick={(event) => readQuery(value, event.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        ref={(node) => {
          ref.current = node
          if (inputRef) inputRef.current = node
        }}
        required={required}
        rows={rows}
        value={value}
      />
      {query !== null && (
        <ul className="mention-list" role="listbox" style={anchor ? { top: anchor.top, left: anchor.left } : undefined}>
          {matches.length === 0 && <li className="mention-empty">{t.discussions.mentionEmpty}</li>}
          {matches.map((member, index) => (
            <li key={member.userId}>
              <button
                aria-selected={index === highlight}
                className={`mention-option${index === highlight ? ' is-on' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  insert(member)
                }}
                onMouseEnter={() => setHighlight(index)}
                role="option"
                type="button"
              >
                <Avatar person={{ id: member.userId, displayName: member.nickname }} size="sm" />
                <span className="mention-name">{member.nickname}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
