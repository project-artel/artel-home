import { Fragment } from 'react'
import { parseChatMarkdown, type Inline } from './chatMarkdown'

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
export function ChatMessageBody({ body }: { body: string }) {
  const blocks = parseChatMarkdown(body)

  return (
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
  )
}

function InlineRun({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'bold') return <strong key={index}>{part.text}</strong>
        if (part.kind === 'code') return <code className="chat-md-code" key={index}>{part.text}</code>
        return <Fragment key={index}>{part.text}</Fragment>
      })}
    </>
  )
}
