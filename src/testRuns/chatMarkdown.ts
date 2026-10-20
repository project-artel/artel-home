/**
 * The small slice of Markdown the authoring agent actually writes.
 *
 * Measured on a local run's 25 assistant messages: paragraphs separated by a
 * blank line (7), unordered lists (5, three of them with one level of nesting),
 * ordered lists (5), bold (7), inline code (6). Code fences, headings and links:
 * **none**. So this parses those and nothing else — a full Markdown dependency
 * would be a tree of packages for a syntax that does not arrive.
 *
 * Pipe tables were added with the split reply (ARTEL-929): the explanation part is
 * told to use a table when it compares or maps things, so tables now do arrive.
 *
 * The output is data, not HTML. The renderer builds React elements from it, so a
 * message can never inject markup — the body is a string a model wrote.
 *
 * Anything it does not understand stays literal. A lone `*`, an unclosed
 * backtick, a line starting with `#` — all of it comes out as the text it is,
 * which is the behaviour the screen had before this existed.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }
  /**
   * `[text](url)`, read only with `links: true`. `text` is literal — no code or bold is read inside it.
   * `internal` is an app path (`/account`), `external` is `http(s)://`. Any other target never becomes a
   * link: it stays in the text as the characters the model wrote.
   */
  | { kind: 'link'; text: string; href: string; target: 'internal' | 'external' }
  /**
   * A `[[tc:5]]` / `[[ts:7]]` marker (ARTEL-933). The number is for the machine only, so
   * `text` is empty — the renderer draws the name from the message's refs, and a marker
   * with no matching ref draws nothing.
   */
  | { kind: 'ref'; refKind: 'tc' | 'ts'; id: number; text: '' }

export type ListItem = {
  content: Inline[]
  /** One level only. The agent has never nested deeper, and deeper nesting in a 360px column is unreadable anyway. */
  children: Inline[][]
}

export type Block =
  | { kind: 'paragraph'; lines: Inline[][] }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  /** Every row has as many cells as the header — short rows are padded with empty cells. */
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] }
  /** A fenced block, read only with `fences: true`. The language tag is dropped; line breaks and indent are kept. */
  | { kind: 'fence'; text: string }

/**
 * Syntax that RunChat does not get. Both are off by default, so the output for the
 * authoring chat is what it was before they existed; the project agent opts in.
 */
export type ChatMarkdownOptions = { links?: boolean; fences?: boolean }

/** `- ` or `* ` at the start, after optional indent. */
const BULLET = /^(\s*)[-*]\s+(.*)$/
/** `1. ` at the start, after optional indent. */
const NUMBER = /^(\s*)\d+\.\s+(.*)$/
/** ```` ``` ```` with an optional language tag, after optional indent. */
const FENCE_OPEN = /^\s*```[^`]*$/
const FENCE_CLOSE = /^\s*```\s*$/
/** Indent from this column on is a nested item rather than a new top-level one. */
const NEST_INDENT = 2

type Marker = { indent: number; ordered: boolean; text: string }

/** `| a | b |` — a row starts with a pipe. */
function isTableRow(line: string): boolean {
  return line.trimStart().startsWith('|')
}

/** `|---|:---:|` — only dashes, colons, pipes and spaces, with at least one dash. */
function isTableSeparator(line: string): boolean {
  return isTableRow(line) && /^[\s|:-]+$/.test(line) && line.includes('-')
}

function tableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((cell) => cell.trim())
}

function readMarker(line: string): Marker | null {
  const bullet = BULLET.exec(line)
  if (bullet !== null) return { indent: bullet[1].length, ordered: false, text: bullet[2] }
  const numbered = NUMBER.exec(line)
  if (numbered !== null) return { indent: numbered[1].length, ordered: true, text: numbered[2] }
  return null
}

/**
 * Splits a message body into blocks.
 *
 * A blank line ends whatever is open. A list ends when a line is neither a marker
 * nor indented under one; the paragraph that follows is its own block, which is
 * how the agent writes ("… requires:" then the list, then more prose).
 */
export function parseChatMarkdown(body: string, options: ChatMarkdownOptions = {}): Block[] {
  const blocks: Block[] = []
  let paragraph: Inline[][] = []
  let list: { ordered: boolean; items: ListItem[] } | null = null

  function closeParagraph() {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', lines: paragraph })
    paragraph = []
  }
  function closeList() {
    if (list === null) return
    blocks.push({ kind: 'list', ordered: list.ordered, items: list.items })
    list = null
  }

  const lines = body.split('\n').map((raw) => raw.replace(/\s+$/, ''))
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    // A fence is checked before the blank-line rule: a blank line inside it is code.
    if (options.fences === true && FENCE_OPEN.test(line)) {
      closeParagraph()
      closeList()
      const code: string[] = []
      index += 1
      // No closing fence: the rest of the message is code, which is what the model meant.
      while (index < lines.length && !FENCE_CLOSE.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      blocks.push({ kind: 'fence', text: code.join('\n') })
      continue
    }

    if (line.trim().length === 0) {
      closeParagraph()
      closeList()
      continue
    }

    // A table needs its separator row. Without it a leading `|` is just a character
    // the model wrote — reading it as a table would break an ordinary sentence.
    if (isTableRow(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      closeParagraph()
      closeList()
      const header = tableCells(line)
      const rows: Inline[][][] = []
      index += 2
      while (index < lines.length && isTableRow(lines[index])) {
        const cells = tableCells(lines[index])
        rows.push(header.map((_, column) => parseInline(cells[column] ?? '', options)))
        index += 1
      }
      index -= 1
      blocks.push({ kind: 'table', header: header.map((cell) => parseInline(cell, options)), rows })
      continue
    }

    const marker = readMarker(line)
    if (marker === null) {
      closeList()
      paragraph.push(parseInline(line.trim(), options))
      continue
    }

    closeParagraph()
    // A nested marker belongs to the item above it. With no item above — the agent
    // opening a list already indented — it starts the list at that level instead of
    // being dropped.
    if (marker.indent >= NEST_INDENT && list !== null && list.items.length > 0) {
      list.items[list.items.length - 1].children.push(parseInline(marker.text, options))
      continue
    }
    // A `1.` list and a `-` list next to each other are two lists, not one.
    if (list !== null && list.ordered !== marker.ordered) closeList()
    list ??= { ordered: marker.ordered, items: [] }
    list.items.push({ content: parseInline(marker.text, options), children: [] })
  }

  closeParagraph()
  closeList()
  return blocks
}

/**
 * Splits one line into text, `**bold**` and `` `code` `` runs.
 *
 * An opener with no closer is not markup — it is the character the user sees, so
 * it stays in the text. Bold is not read inside code: `` `a ** b` `` is code that
 * happens to contain asterisks.
 */
export function parseInline(line: string, options: ChatMarkdownOptions = {}): Inline[] {
  // Markers first: they cannot contain markup, and splitting on them keeps the bold
  // and code rules below exactly as they were.
  const parts: Inline[] = []
  let at = 0
  for (const match of line.matchAll(MARKER)) {
    const start = match.index ?? 0
    if (start > at) parts.push(...parseRuns(line.slice(at, start), options))
    parts.push({ kind: 'ref', refKind: match[1] as 'tc' | 'ts', id: Number(match[2]), text: '' })
    at = start + match[0].length
  }
  if (at < line.length) parts.push(...parseRuns(line.slice(at), options))
  return parts
}

/**
 * `[[tc:5]]` / `[[ts:7]]`. A malformed one (`[[tc:abc]]`) does not match and stays text.
 * A draft not yet approved is a negative number (`[[ts:-1]]`, ARTEL-1075); the chip opens that draft.
 */
const MARKER = /\[\[(tc|ts):(-?\d+)\]\]/g

/** `[text](target)` — target has no spaces or parentheses. */
const LINK = /^\[([^\]\n]+)\]\(([^()\s]+)\)/

/** Only an app path or an http(s) URL is a link. `//host`, `/\host`, `javascript:` and `data:` are not. */
function linkTarget(href: string): 'internal' | 'external' | null {
  if (/^\/(?![/\\])/.test(href)) return 'internal'
  if (/^https?:\/\/[^/\s]/i.test(href)) return 'external'
  return null
}

function parseRuns(line: string, options: ChatMarkdownOptions): Inline[] {
  const parts: Inline[] = []
  let plain = ''
  let at = 0

  function flush() {
    if (plain.length === 0) return
    parts.push({ kind: 'text', text: plain })
    plain = ''
  }

  while (at < line.length) {
    const backtick = line.indexOf('`', at)
    const stars = line.indexOf('**', at)
    const bracket = options.links === true ? line.indexOf('[', at) : -1
    // Whichever opens first wins; -1 means "not present".
    const next = [backtick, stars, bracket].filter((position) => position !== -1).reduce((a, b) => Math.min(a, b), Infinity)
    if (next === Infinity) break

    if (next === bracket) {
      const match = LINK.exec(line.slice(next))
      if (match === null) {
        // Not a link: the bracket is text, and the scan goes on after it.
        plain += line.slice(at, next + 1)
        at = next + 1
        continue
      }
      plain += line.slice(at, next)
      const target = linkTarget(match[2])
      if (target === null) {
        // Unsafe or unknown target: keep the model's own characters, never an anchor.
        plain += match[0]
      } else {
        flush()
        parts.push({ kind: 'link', text: match[1], href: match[2], target })
      }
      at = next + match[0].length
      continue
    }

    if (next === backtick) {
      const close = line.indexOf('`', next + 1)
      if (close === -1) break
      plain += line.slice(at, next)
      flush()
      parts.push({ kind: 'code', text: line.slice(next + 1, close) })
      at = close + 1
      continue
    }

    const close = line.indexOf('**', next + 2)
    if (close === -1) break
    // `****` — an empty run is not emphasis, it is four characters.
    if (close === next + 2) {
      plain += line.slice(at, close + 2)
      at = close + 2
      continue
    }
    plain += line.slice(at, next)
    flush()
    parts.push({ kind: 'bold', text: line.slice(next + 2, close) })
    at = close + 2
  }

  plain += line.slice(at)
  flush()
  return parts
}
