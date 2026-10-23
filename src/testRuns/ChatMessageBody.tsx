import { Fragment, useContext, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from '../design-system/primitives/Dialog'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import { StudioIcon } from '../testScenarios/studioIcons'
import { parseChatMarkdown, parseInline, type ChatMarkdownOptions, type Inline } from './chatMarkdown'
import { ChatCodeBlock } from './ChatCodeBlock'
import { ChatRefChip } from './ChatRefChip'
import { ChatLinkContext, ChatRefsContext } from './chatRefContext'
import type { ChatRef, ChatReply, RunChatQuestion, ScenarioChange } from './runChatApi'

/**
 * An agent message, with the structure it wrote left standing.
 *
 * The thread used to print `message.content` as one string, so a reply that said
 * `**Blocking:**` and listed four causes arrived as 443 characters of asterisks
 * and hyphens in a 300px column. {@link parseChatMarkdown} reads the four things
 * the agent actually writes; this turns them into elements.
 *
 * React elements, never `dangerouslySetInnerHTML`: the body is a string a model
 * produced, and nothing in it should be able to become markup.
 */
/**
 * An agent answer split into its result and its explanation (ARTEL-929).
 *
 * The result is what the agent's code counted — one or two lines, so it goes in a box
 * where it is the first thing read. The explanation is the model's, and it chooses its
 * own shape (sentences, a list, a table) for whatever it has to say. Questions are not
 * here: they hang off the same line and open the question modal.
 */
export function ChatReplyBody({ reply, refs = [], onPickAsk }: {
  reply: ChatReply
  refs?: ChatRef[]
  /** 이 답의 질문에 보기 칩을 단다(ARTEL-1118) — 질문이 적어 선택 박스를 세우지 않을 때. */
  onPickAsk?: (question: RunChatQuestion, option: RunChatQuestion['options'][number]) => void
}) {
  return (
    <ChatRefsContext.Provider value={refs}>
    <div className="chat-reply">
      {/* 결과 칸이 빈 답도 있다 — 예전에 질문만 따로 저장된 줄(ARTEL-1118)을 이 모양으로 그릴 때다. */}
      {(reply.result.length > 0 || reply.changes.length > 0) && (
        <div className="chat-reply-result">
          {reply.result.split('\n').map((line, index) => (
            <p className="chat-reply-result-line" key={index}><InlineRun parts={parseInline(line)} /></p>
          ))}
          {reply.changes.length > 0 && <ChangeList changes={reply.changes} />}
        </div>
      )}
      {reply.detail.trim().length > 0 && <ChatMessageBody body={reply.detail} refs={refs} />}
      {reply.asks.length > 0 && <ChatAsks asks={reply.asks} onPick={onPickAsk} />}
    </div>
    </ChatRefsContext.Provider>
  )
}

/**
 * 저작이 사용자에게 묻는 것(ARTEL-1118) — 답 맨 아래, 전구 하나 아래에 질문 글만.
 *
 * 예전에는 답과 따로 질문 메시지로 와서 "펼치기" 모달로 답했다. 저작이 대화를 기억하게 되어 평범한
 * 대화로 답하면 된다. 질문이 여럿이면 여기 다 펼치면 읽히지 않으므로 **글만** 남기고, 고르는 것은 입력 칸
 * 위의 선택 박스([AskDock])가 하나씩 맡는다.
 */
export function ChatAsks({ asks, onPick }: {
  asks: RunChatQuestion[]
  /** 있으면 보기를 누를 수 있는 칩으로 단다 — 질문이 하나 · 둘이라 선택 박스를 세우지 않을 때(ARTEL-1118). */
  onPick?: (question: RunChatQuestion, option: RunChatQuestion['options'][number]) => void
}) {
  const { t } = useI18n()
  const c = t.scenarios.chat
  return (
    <section aria-label={c.asksLabel} className="chat-asks">
      <StudioIcon className="chat-asks-icon" name="bulb" size={16} />
      <ol className={`chat-asks-list${asks.length > 1 ? ' is-numbered' : ''}`}>
        {asks.map((ask) => (
          <li className="chat-ask" key={ask.id}>
            <p className="chat-ask-text"><InlineRun parts={parseInline(ask.text)} /></p>
            {ask.why !== null && <p className="chat-ask-why"><InlineRun parts={parseInline(ask.why)} /></p>}
            {onPick !== undefined && ask.options.length > 0 && (
              <div className="chat-ask-options">
                {ask.options.map((option) => (
                  <button className="chat-ask-option" key={option.id} onClick={() => onPick(ask, option)} type="button">
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * What the turn changed, one scenario per line, coloured by what happened to it
 * (ARTEL-938). A long list folds: the box is the first thing read, and twelve
 * titles push the explanation off the screen.
 */
function ChangeList({ changes }: { changes: ScenarioChange[] }) {
  const { t } = useI18n()
  const m = t.scenarios.chat.changes
  const link = useContext(ChatLinkContext)
  const [open, setOpen] = useState(false)
  const shown = open ? changes : changes.slice(0, FOLDED_CHANGES)
  const hidden = changes.length - shown.length

  return (
    <>
      <ul className="chat-reply-changes">
        {shown.map((change, index) => {
          const tag = <span className="chat-reply-change-tag">{m[change.action]}</span>
          const opensTo =
            link !== null && change.scenarioId !== null && change.action !== 'removed'
              ? `/projects/${encodeURIComponent(link.projectId)}/test-scenarios/${change.scenarioId}` +
                (link.runId !== null ? `?run=${encodeURIComponent(link.runId)}` : '')
              : null
          return (
            <li className={`chat-reply-change chat-reply-change--${change.action}`} key={index}>
              {tag}
              {opensTo !== null ? <Link to={opensTo}>{change.title}</Link> : <span>{change.title}</span>}
            </li>
          )
        })}
      </ul>
      {(hidden > 0 || open) && changes.length > FOLDED_CHANGES && (
        <button className="chat-reply-changes-toggle" onClick={() => setOpen((was) => !was)} type="button">
          {open ? m.collapse : m.expand.replace('{count}', String(hidden))}
        </button>
      )}
    </>
  )
}

/** How many changed scenarios the box shows before folding the rest. */
const FOLDED_CHANGES = 3

/** One line of model text with its markers drawn as chips — for the question modal. */
export function ChatInline({ text, refs = [] }: { text: string; refs?: ChatRef[] }) {
  return (
    <ChatRefsContext.Provider value={refs}>
      <InlineRun parts={parseInline(text)} />
    </ChatRefsContext.Provider>
  )
}

/**
 * `markdown` turns on syntax RunChat does not get (links, fenced code). Left out, the
 * body is parsed and drawn exactly as before; only the project agent thread passes it.
 */
export function ChatMessageBody({
  body,
  refs = [],
  markdown,
}: {
  body: string
  refs?: ChatRef[]
  markdown?: ChatMarkdownOptions
}) {
  const blocks = parseChatMarkdown(body, markdown)

  return (
    <ChatRefsContext.Provider value={refs}>
    <div className="chat-body chat-body--rich">
      {blocks.map((block, index) => {
        if (block.kind === 'paragraph') {
          return (
            <p className="chat-md-p" key={index}>
              {block.lines.map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  <InlineRun parts={line} />
                </Fragment>
              ))}
            </p>
          )
        }
        if (block.kind === 'fence') return <ChatCodeBlock key={index} text={block.text} />
        if (block.kind === 'table') {
          return <ChatTable header={block.header} key={index} rows={block.rows} />
        }
        const List = block.ordered ? 'ol' : 'ul'
        return (
          <List className="chat-md-list" key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <InlineRun parts={item.content} />
                {item.children.length > 0 && (
                  <ul className="chat-md-list chat-md-list--nested">
                    {item.children.map((child, childIndex) => (
                      <li key={childIndex}><InlineRun parts={child} /></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </List>
        )
      })}
    </div>
    </ChatRefsContext.Provider>
  )
}

/**
 * 대화 속 표(ARTEL-1107). 칸마다 최소 폭을 두어 글자가 한두 자씩 세로로 쌓이지 않게 하고, 그래서 대화 칸보다
 * 넓어지면 가로로 밀린다. 밀리는 쪽은 네이티브 막대 대신 끝의 가림과 화살표로 알리고, 넓게 읽고 싶으면
 * "표 크게 보기" 로 같은 표를 창 크기로 연다.
 */
function ChatTable({ header, rows }: { header: Inline[][]; rows: Inline[][][] }) {
  const { t } = useI18n()
  const c = t.scenarios.chat
  const titleId = useId()
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null)
  const [edge, setEdge] = useState({ left: true, right: true })
  const [wide, setWide] = useState(false)
  const [dialogScroller, setDialogScroller] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (wrap === null) return undefined
    const element = wrap
    function read() {
      setEdge({
        left: element.scrollLeft <= 2,
        right: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
      })
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    if (element.firstElementChild !== null) observer.observe(element.firstElementChild)
    element.addEventListener('scroll', read, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', read)
    }
  }, [wrap])

  const overflowing = !(edge.left && edge.right)
  const table = (
    <table className="chat-md-table">
      <thead>
        <tr>
          {header.map((cell, cellIndex) => (
            <th key={cellIndex}><InlineRun parts={cell} /></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}><InlineRun parts={cell} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className={`chat-md-table-frame${overflowing ? ' is-overflowing' : ''}`}>
      <div className="chat-md-table-wrap" ref={setWrap}>{table}</div>
      <span aria-hidden="true" className={`chat-md-table-fade chat-md-table-fade--left${edge.left ? ' is-end' : ''}`}>
        <StudioIcon name="chevronLeft" size={14} />
      </span>
      <span aria-hidden="true" className={`chat-md-table-fade chat-md-table-fade--right${edge.right ? ' is-end' : ''}`}>
        <StudioIcon name="chevronRight" size={14} />
      </span>
      {overflowing && (
        <button className="chat-md-table-expand" onClick={() => setWide(true)} type="button">
          <StudioIcon name="maximize" size={13} />
          {c.tableExpand}
        </button>
      )}
      {wide && (
        <Dialog labelledBy={titleId} onClose={() => setWide(false)} title={c.tableTitle}>
          {/* 창은 body 로 뜬다. 칩 · 코드 모양이 대화 칸과 같게, 대화 칸의 범위 이름을 함께 단다. */}
          <div className="scenario-studio chat-table-scope">
            <div className="st-chat chat-table-dialog">
              <div className="chat-table-dialog-scroll" ref={setDialogScroller}>{table}</div>
              <EdgeScrollbar label={c.tableTitle} scroller={dialogScroller} side="right" />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function InlineRun({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'bold') return <strong key={index}>{part.text}</strong>
        if (part.kind === 'code') return <code className="chat-md-code" key={index}>{part.text}</code>
        if (part.kind === 'link') {
          return part.target === 'internal'
            ? <Link className="chat-md-link" key={index} to={part.href}>{part.text}</Link>
            : <a className="chat-md-link" href={part.href} key={index} rel="noreferrer" target="_blank">{part.text}</a>
        }
        if (part.kind === 'ref') return <ChatRefChip key={index} refKind={part.refKind} id={part.id} />
        if (part.kind === 'label') return <span className={`chat-label chat-label--${part.tone}`} key={index}>{part.text}</span>
        return <Fragment key={index}>{part.text}</Fragment>
      })}
    </>
  )
}
