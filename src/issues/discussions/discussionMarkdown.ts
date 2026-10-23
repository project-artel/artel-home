/**
 * 팀 공유 글 · 댓글의 마크다운(ARTEL-1114). GitHub 이슈 · PR 에서 사람이 실제로 쓰는 만큼만 읽는다 —
 * 제목(#~###), 굵게 · 기울임 · 취소선 · 인라인 코드, 코드 블록, 링크, 인용, 목록(한 단계 중첩), 체크리스트, 표, 구분선.
 * 여기에 서비스 것 하나 — `[[tc:12]]` 는 테스트 케이스를 가리키는 표시다.
 *
 * 결과는 HTML 이 아니라 데이터다. 화면이 이것으로 React 요소를 만들므로 글에 마크업이 끼어들 수 없다(`chatMarkdown`
 * 과 같은 이유). 링크는 http · https · mailto 만 링크로 그리고, 나머지는 글자로 둔다. 모르는 문법은 글자 그대로 남는다.
 */

export type MdInline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: MdInline[] }
  | { kind: 'italic'; children: MdInline[] }
  | { kind: 'strike'; children: MdInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: MdInline[] }
  /** `[[tc:12]]` — 테스트 케이스 하나를 가리킨다. */
  | { kind: 'case'; caseId: string }

export type MdListItem = {
  /** 체크리스트 항목이면 체크 여부, 아니면 null. */
  task: boolean | null
  content: MdInline[]
  children: MdListItem[]
}

export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; content: MdInline[] }
  | { kind: 'paragraph'; lines: MdInline[][] }
  | { kind: 'list'; ordered: boolean; start: number; items: MdListItem[] }
  | { kind: 'quote'; blocks: MdBlock[] }
  | { kind: 'code'; language: string; text: string }
  | { kind: 'table'; header: MdInline[][]; rows: MdInline[][][] }
  | { kind: 'rule' }

const HEADING = /^(#{1,6})\s+(.*)$/
const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const TASK = /^\[([ xX])\]\s+(.*)$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s*>\s?(.*)$/
const NEST_INDENT = 2

const isTableRow = (line: string) => line.trim().startsWith('|')
const isTableSeparator = (line: string) => isTableRow(line) && /^[\s|:-]+$/.test(line) && line.includes('-')
function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function startsBlock(line: string): boolean {
  return HEADING.test(line) || FENCE.test(line) || LIST.test(line) || QUOTE.test(line) || RULE.test(line) || isTableRow(line)
}

export function parseDiscussionMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') {
      index++
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const body: string[] = []
      index++
      while (index < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[index])) body.push(lines[index++])
      index++ // 닫는 울타리. 없으면 글 끝까지가 코드다.
      blocks.push({ kind: 'code', language: fence[2], text: body.join('\n') })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: Math.min(3, heading[1].length) as 1 | 2 | 3, content: parseMarkdownInline(heading[2].trim()) })
      index++
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' })
      index++
      continue
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = []
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoted.push(QUOTE.exec(lines[index])![1])
        index++
      }
      blocks.push({ kind: 'quote', blocks: parseDiscussionMarkdown(quoted.join('\n')) })
      continue
    }
    if (isTableRow(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = cells(line)
      index += 2
      const rows: MdInline[][][] = []
      while (index < lines.length && isTableRow(lines[index])) {
        const row = cells(lines[index++])
        rows.push(header.map((_, column) => parseMarkdownInline(row[column] ?? '')))
      }
      blocks.push({ kind: 'table', header: header.map(parseMarkdownInline), rows })
      continue
    }
    const list = LIST.exec(line)
    if (list) {
      const ordered = /\d/.test(list[2])
      const start = ordered ? Number.parseInt(list[2], 10) : 1
      const items: MdListItem[] = []
      const baseIndent = list[1].length
      while (index < lines.length) {
        const match = LIST.exec(lines[index])
        if (!match) {
          // 들여 쓴 다음 줄은 앞 항목에 이어 붙인다.
          if (lines[index].trim() !== '' && /^\s{2,}/.test(lines[index]) && items.length > 0) {
            const last = items[items.length - 1]
            last.content.push({ kind: 'text', text: ' ' }, ...parseMarkdownInline(lines[index].trim()))
            index++
            continue
          }
          break
        }
        if (match[1].length >= baseIndent + NEST_INDENT && items.length > 0) {
          items[items.length - 1].children.push(listItem(match[3]))
        } else if (/\d/.test(match[2]) === ordered) {
          items.push(listItem(match[3]))
        } else break
        index++
      }
      blocks.push({ kind: 'list', ordered, start, items })
      continue
    }
    const paragraph: MdInline[][] = []
    while (index < lines.length && lines[index].trim() !== '' && (paragraph.length === 0 || !startsBlock(lines[index]))) {
      paragraph.push(parseMarkdownInline(lines[index].trim()))
      index++
    }
    blocks.push({ kind: 'paragraph', lines: paragraph })
  }
  return blocks
}

function listItem(text: string): MdListItem {
  const task = TASK.exec(text)
  return task
    ? { task: task[1] !== ' ', content: parseMarkdownInline(task[2]), children: [] }
    : { task: null, content: parseMarkdownInline(text), children: [] }
}

const SAFE_LINK = /^(https?:\/\/|mailto:)/i

/** 한 줄 안의 강조 · 코드 · 링크. 닫히지 않은 표시는 글자로 남긴다. */
export function parseMarkdownInline(text: string): MdInline[] {
  const out: MdInline[] = []
  let buffer = ''
  const flush = () => {
    if (buffer) out.push({ kind: 'text', text: buffer })
    buffer = ''
  }
  let index = 0
  while (index < text.length) {
    const rest = text.slice(index)
    if (rest.startsWith('\\') && rest.length > 1) {
      buffer += rest[1]
      index += 2
      continue
    }
    const code = /^`([^`]+)`/.exec(rest)
    if (code) {
      flush()
      out.push({ kind: 'code', text: code[1] })
      index += code[0].length
      continue
    }
    const testCase = /^\[\[tc:(\d{1,18})\]\]/.exec(rest)
    if (testCase) {
      flush()
      out.push({ kind: 'case', caseId: testCase[1] })
      index += testCase[0].length
      continue
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
    if (link && SAFE_LINK.test(link[2])) {
      flush()
      out.push({ kind: 'link', href: link[2], children: parseMarkdownInline(link[1]) })
      index += link[0].length
      continue
    }
    if (link) {
      // 링크로 그리지 않는 주소(javascript: 등)는 글자 그대로 둔다.
      buffer += link[0]
      index += link[0].length
      continue
    }
    const auto = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/.exec(rest)
    if (auto && (index === 0 || /\s|\(/.test(text[index - 1]))) {
      flush()
      out.push({ kind: 'link', href: auto[0], children: [{ kind: 'text', text: auto[0] }] })
      index += auto[0].length
      continue
    }
    const emphasis = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest) ?? null
    if (emphasis) {
      flush()
      out.push({ kind: 'bold', children: parseMarkdownInline(emphasis[2]) })
      index += emphasis[0].length
      continue
    }
    const strike = /^~~(?=\S)([\s\S]*?\S)~~/.exec(rest)
    if (strike) {
      flush()
      out.push({ kind: 'strike', children: parseMarkdownInline(strike[1]) })
      index += strike[0].length
      continue
    }
    const italic = /^([*_])(?=\S)([\s\S]*?\S)\1(?![*_\w])/.exec(rest)
    if (italic && (index === 0 || !/\w/.test(text[index - 1]))) {
      flush()
      out.push({ kind: 'italic', children: parseMarkdownInline(italic[2]) })
      index += italic[0].length
      continue
    }
    buffer += rest[0]
    index++
  }
  flush()
  return out
}

/** 목록 줄의 짧은 글(excerpt)을 위해 표시 문자를 걷어낸 글. */
export function plainMarkdown(source: string): string {
  return source
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/\[\[tc:(\d+)\]\]/g, 'TC #$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]\s+\[[ xX]\]|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
