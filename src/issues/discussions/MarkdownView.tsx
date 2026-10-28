import { useTestCaseLabel } from '../../testCases/testCaseIdentifiers'
import { TestCaseHover } from '../../testCases/TestCaseHover'
import { Fragment, type ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useCaseRefs } from './caseRefs'
import { parseDiscussionMarkdown, type MdBlock, type MdInline, type MdListItem } from './discussionMarkdown'

/**
 * 팀 공유 글 · 댓글 본문을 마크다운으로 그린다(ARTEL-1114). 파서가 돌려준 데이터로만 요소를 만들어 마크업이 끼어들
 * 수 없다. [mentions] 의 이름은 `@이름` 으로 적힌 자리를 강조한다.
 */
export function MarkdownView({ source, mentions = [] }: { source: string; mentions?: readonly string[] }) {
  return <div className="md">{renderBlocks(parseDiscussionMarkdown(source), mentions)}</div>
}

function renderBlocks(blocks: MdBlock[], mentions: readonly string[]): ReactNode {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case 'heading': {
        const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1]
        return (
          <Tag className={`md-h md-h${block.level}`} key={index}>
            {renderInline(block.content, mentions)}
          </Tag>
        )
      }
      case 'paragraph':
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line, mentions)}
              </Fragment>
            ))}
          </p>
        )
      case 'list': {
        const items = block.items.map((item, itemIndex) => renderItem(item, itemIndex, mentions))
        return block.ordered ? (
          <ol key={index} start={block.start === 1 ? undefined : block.start}>
            {items}
          </ol>
        ) : (
          <ul className={block.items.some((item) => item.task !== null) ? 'md-tasks' : undefined} key={index}>
            {items}
          </ul>
        )
      }
      case 'quote':
        return <blockquote key={index}>{renderBlocks(block.blocks, mentions)}</blockquote>
      case 'code':
        return (
          <pre data-language={block.language || undefined} key={index}>
            <code>{block.text}</code>
          </pre>
        )
      case 'table':
        return (
          <div className="md-table" key={index}>
            <table>
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    <th key={cellIndex}>{renderInline(cell, mentions)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{renderInline(cell, mentions)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'rule':
        return <hr key={index} />
    }
  })
}

function renderItem(item: MdListItem, index: number, mentions: readonly string[]): ReactNode {
  return (
    <li className={item.task === null ? undefined : 'md-task'} key={index}>
      {item.task !== null && <input aria-hidden="true" checked={item.task} disabled readOnly tabIndex={-1} type="checkbox" />}
      {renderInline(item.content, mentions)}
      {item.children.length > 0 && <ul>{item.children.map((child, childIndex) => renderItem(child, childIndex, mentions))}</ul>}
    </li>
  )
}

function renderInline(parts: MdInline[], mentions: readonly string[]): ReactNode {
  return parts.map((part, index) => {
    switch (part.kind) {
      case 'text':
        return <Fragment key={index}>{withMentions(part.text, mentions)}</Fragment>
      case 'bold':
        return <strong key={index}>{renderInline(part.children, mentions)}</strong>
      case 'italic':
        return <em key={index}>{renderInline(part.children, mentions)}</em>
      case 'strike':
        return <del key={index}>{renderInline(part.children, mentions)}</del>
      case 'code':
        return <code key={index}>{part.text}</code>
      case 'case':
        return <CaseRefChip caseId={part.caseId} key={index} />
      case 'link':
        return (
          <a href={part.href} key={index} rel="noreferrer noopener" target="_blank">
            {renderInline(part.children, mentions)}
          </a>
        )
    }
  })
}

/**
 * `[[tc:id]]` 자리. 글 버전에 든 TC 면 씬 · 스텝과 판정이 보이고 누르면 명세가 열린다. 그 버전에 없는 TC 면 번호만
 * 흐리게 남긴다 — 다른 버전에서 지워졌거나 아직 읽는 중이다.
 */
function CaseRefChip({ caseId }: { caseId: string }) {
  const caseLabel = useTestCaseLabel()
  const { t } = useI18n()
  const refs = useCaseRefs()
  const testCase = refs?.cases.get(caseId)
  if (testCase === undefined)
    return (
      <span className="md-tc is-missing" title={t.discussions.caseMissing}>
        <span className="md-tc-id">{caseLabel(caseId)}</span>
      </span>
    )
  const body = (
    <>
      <span className="md-tc-id">{caseLabel(caseId)}</span>
      <span className="md-tc-scene">{testCase.scene}</span>
      <span className="md-tc-step">{testCase.step}</span>
      <span className={`md-tc-state md-tc-state--${testCase.verificationStatus.toLowerCase()}`}>
        {t.scenarios.composition.status[testCase.verificationStatus]}
      </span>
    </>
  )
  const title = `${testCase.scene} — ${testCase.step}\n→ ${testCase.expectedValue}`
  return <TestCaseHover projectId={testCase.projectId} caseId={caseId} gameBuildId={refs?.gameBuildId}>{refs?.onOpen ? (
    <button className="md-tc" onClick={() => refs.onOpen?.(testCase)} title={title} type="button">
      {body}
    </button>
  ) : (
    <span className="md-tc" title={title}>
      {body}
    </span>
  )}</TestCaseHover>
}

/** `@이름` 을 강조한다. 긴 이름부터 찾아 "Local" 이 "Local Tester" 를 먼저 먹지 않게 한다. */
function withMentions(text: string, mentions: readonly string[]): ReactNode {
  if (mentions.length === 0 || !text.includes('@')) return text
  const names = [...mentions].sort((a, b) => b.length - a.length)
  const out: ReactNode[] = []
  let rest = text
  let key = 0
  while (rest.length > 0) {
    const at = rest.indexOf('@')
    if (at < 0) break
    const name = names.find((candidate) => rest.startsWith(`@${candidate}`, at))
    if (name === undefined) {
      out.push(rest.slice(0, at + 1))
      rest = rest.slice(at + 1)
      continue
    }
    out.push(rest.slice(0, at))
    out.push(
      <span className="md-mention" key={key++}>
        @{name}
      </span>,
    )
    rest = rest.slice(at + 1 + name.length)
  }
  out.push(rest)
  return out
}
