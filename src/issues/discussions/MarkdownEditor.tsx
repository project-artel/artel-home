import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { TestCaseSpecModal } from '../../testCases/TestCaseSpecModal'
import { caseRef, useCaseRefs } from './caseRefs'
import type { ProjectMember } from '../../projects/memberTypes'
import { DiscussionIcon, type DiscussionIconName } from './discussionIcons'
import { applyFormat, type Format } from './markdownFormat'
import { MarkdownView } from './MarkdownView'
import { MentionTextarea } from './MentionTextarea'

/** 도구. 글자 서식은 아이콘 대신 그 서식을 입힌 글자로 보인다 — 무엇이 되는지가 버튼에 그대로 보인다. */
type Tool = { format: Format; glyph?: string; icon?: DiscussionIconName }
const TOOLS: Tool[][] = [
  [
    { format: 'heading', glyph: 'H' },
    { format: 'bold', glyph: 'B' },
    { format: 'italic', glyph: 'I' },
    { format: 'strike', glyph: 'S' },
  ],
  [
    { format: 'quote', icon: 'quote' },
    { format: 'code', icon: 'code' },
    { format: 'link', icon: 'link' },
  ],
  [
    { format: 'bullet', icon: 'list' },
    { format: 'number', icon: 'listNumbers' },
    { format: 'task', icon: 'listCheck' },
    { format: 'mention', icon: 'at' },
  ],
]

type View = 'write' | 'split' | 'preview'

const SHORTCUTS: Record<string, Format> = { b: 'bold', i: 'italic', e: 'code', k: 'link' }

/**
 * 마크다운으로 쓰는 입력칸(ARTEL-1114). 위에 서식 도구와 보기 전환(편집 · 나란히 · 미리보기), 아래에 안내와 [footer]
 * (사진 첨부 등)를 둔다. 서식 도구는 고른 글을 감싸거나 줄 앞에 표시를 붙인다. ⌘B · ⌘I · ⌘E · ⌘K 단축키도 같다.
 * `@` 멘션은 [MentionTextarea] 가 맡는다. [split] 이면 넓은 자리에서 "나란히" 보기를 쓸 수 있다.
 *
 * 글의 TC 범위([CaseRefsContext])가 있으면 TC 도구가 보인다. 누르면 ⌘K 의 TC 명세 창이 고르기 모드로 열리고, 고른
 * TC 가 글자 자리에 `[[tc:id]]` 로 들어간다. 창이 보이는 TC 는 글의 빌드 버전에 든 것뿐이다.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  mentions,
  onMentionsChange,
  members,
  placeholder,
  rows,
  maxLength,
  disabled = false,
  required = false,
  autoFocus = false,
  footer,
  compact = false,
  split = false,
  invalid = false,
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
  required?: boolean
  autoFocus?: boolean
  footer?: ReactNode
  /** 댓글 · 답글처럼 좁은 자리. */
  compact?: boolean
  /** 쓰면서 옆에서 미리 보는 "나란히" 보기를 둔다. */
  split?: boolean
  invalid?: boolean
}) {
  const { t } = useI18n()
  const text = t.discussions
  const [view, setView] = useState<View>('write')
  const input = useRef<HTMLTextAreaElement | null>(null)
  const refs = useCaseRefs()
  const [picking, setPicking] = useState(false)
  // 창이 열린 사이 글자 자리를 잃으므로 연 순간의 자리를 둔다.
  const caretAtPick = useRef(0)

  function openCasePicker() {
    caretAtPick.current = input.current?.selectionEnd ?? value.length
    setPicking(true)
  }
  function insertCase(caseId: string) {
    const at = Math.min(caretAtPick.current, value.length)
    const before = value.slice(0, at)
    const pad = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
    const token = `${pad}${caseRef(caseId)} `
    onChange(before + token + value.slice(at))
    setPicking(false)
    requestAnimationFrame(() => {
      const element = input.current
      element?.focus()
      element?.setSelectionRange(at + token.length, at + token.length)
    })
  }

  function apply(format: Format) {
    const element = input.current
    if (element === null || disabled) return
    const result = applyFormat(value, element.selectionStart, element.selectionEnd, format)
    onChange(result.next)
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(result.start, result.end)
    })
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return
    const format = SHORTCUTS[event.key.toLowerCase()]
    if (format === undefined || (format === 'bold' && event.shiftKey)) return
    event.preventDefault()
    apply(format)
  }

  const names = members.filter((member) => mentions.includes(member.userId)).map((member) => member.nickname)
  const views: { value: View; icon: DiscussionIconName; label: string }[] = [
    { value: 'write', icon: 'pencil', label: text.write },
    ...(split ? [{ value: 'split' as const, icon: 'columns' as const, label: text.split }] : []),
    { value: 'preview', icon: 'eye', label: text.preview },
  ]
  const writing = view !== 'preview'
  const previewing = view !== 'write'
  const preview = (
    <div className="md-preview">
      {value.trim() ? <MarkdownView mentions={names} source={value} /> : <p className="dc-quiet">{text.nothingToPreview}</p>}
    </div>
  )

  return (
    <div
      className={`md-editor${compact ? ' md-editor--compact' : ''}${disabled ? ' is-disabled' : ''}${invalid ? ' is-invalid' : ''} md-editor--${view}`}
    >
      <div className="md-editor-head">
        <div aria-label={text.formatting} className={`md-tools${writing ? '' : ' is-hidden'}`} role="toolbar">
          {TOOLS.map((group, groupIndex) => (
            <span className="md-tool-group" key={groupIndex}>
              {group.map((tool) => (
                <button
                  aria-label={text.tools[tool.format]}
                  className={`md-tool${tool.glyph ? ` md-tool--glyph md-tool--${tool.format}` : ''}`}
                  disabled={disabled || !writing}
                  key={tool.format}
                  onClick={() => apply(tool.format)}
                  onMouseDown={(event) => event.preventDefault()}
                  title={text.tools[tool.format]}
                  type="button"
                >
                  {tool.glyph ?? <DiscussionIcon name={tool.icon!} size={15} />}
                </button>
              ))}
            </span>
          ))}
          {refs !== null && (
            <span className="md-tool-group">
              <button
                aria-label={text.tools.testCase}
                className="md-tool md-tool--glyph md-tool--tc"
                disabled={disabled || !writing}
                onClick={openCasePicker}
                onMouseDown={(event) => event.preventDefault()}
                title={text.tools.testCase}
                type="button"
              >
                TC
              </button>
            </span>
          )}
        </div>
        <div aria-label={text.formatting} className="dc-segments md-views" role="tablist">
          {views.map((option) => (
            <button
              aria-label={option.label}
              aria-selected={view === option.value}
              className="dc-segment md-view"
              key={option.value}
              onClick={() => setView(option.value)}
              role="tab"
              title={option.label}
              type="button"
            >
              <DiscussionIcon name={option.icon} size={14} />
              {!compact && <span>{option.label}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="md-editor-body">
        {writing && (
          <MentionTextarea
            autoFocus={autoFocus}
            className="md-input"
            disabled={disabled}
            id={id}
            inputRef={input}
            maxLength={maxLength}
            members={members}
            mentions={mentions}
            onChange={onChange}
            onKeyDownExtra={onKey}
            onMentionsChange={onMentionsChange}
            placeholder={placeholder}
            required={required}
            rows={rows}
            value={value}
          />
        )}
        {previewing && preview}
      </div>
      <div className="md-editor-foot">
        <span className="md-hint">
          <span className="md-badge">MD</span>
          {text.markdownSupported}
        </span>
        {footer}
      </div>
      {picking && refs !== null && (
        // ⌘K 창의 규칙은 `.cp-scope` 아래에서만 읽힌다.
        <div className="cp-scope">
        <TestCaseSpecModal
          cases={[...refs.cases.values()]}
          onClose={() => setPicking(false)}
          onPick={(testCase) => insertCase(testCase.id)}
          projectId={refs.projectId}
          scope={refs.scope}
        />
        </div>
      )}
    </div>
  )
}
