import { Fragment, useContext, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { parseChatMarkdown, parseInline, type Inline } from './chatMarkdown'
import { ChatRefChip } from './ChatRefChip'
import { ChatLinkContext, ChatRefsContext } from './chatRefContext'
import type { ChatRef, ChatReply, ScenarioChange } from './runChatApi'

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
export function ChatReplyBody({ reply, refs = [] }: { reply: ChatReply; refs?: ChatRef[] }) {
  return (
    <ChatRefsContext.Provider value={refs}>
    <div className="chat-reply">
      <div className="chat-reply-result">
        {reply.result.split('\n').map((line, index) => (
          <p className="chat-reply-result-line" key={index}><InlineRun parts={parseInline(line)} /></p>
        ))}
        {reply.changes.length > 0 && <ChangeList changes={reply.changes} />}
      </div>
      {reply.detail.trim().length > 0 && <ChatMessageBody body={reply.detail} refs={refs} />}
    </div>
    </ChatRefsContext.Provider>
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

export function ChatMessageBody({ body, refs = [] }: { body: string; refs?: ChatRef[] }) {
  const blocks = parseChatMarkdown(body)

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
        if (block.kind === 'table') {
          // 좁은 대화 칸에서 넘치면 가로로 밀린다 — 칸을 줄이면 글자가 세로로 쌓여 못 읽는다.
          return (
            <div className="chat-md-table-wrap" key={index}>
              <table className="chat-md-table">
                <thead>
                  <tr>
                    {block.header.map((cell, cellIndex) => (
                      <th key={cellIndex}><InlineRun parts={cell} /></th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}><InlineRun parts={cell} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
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

function InlineRun({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'bold') return <strong key={index}>{part.text}</strong>
        if (part.kind === 'code') return <code className="chat-md-code" key={index}>{part.text}</code>
        if (part.kind === 'ref') return <ChatRefChip key={index} refKind={part.refKind} id={part.id} />
        return <Fragment key={index}>{part.text}</Fragment>
      })}
    </>
  )
}
