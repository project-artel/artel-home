/*
 * Line diff for the "changes in this run" panel.
 *
 * jsdiff is not a dependency and one view does not justify adding it. The texts
 * compared here are knowledge entries and macro sources, a few hundred lines at
 * most, so a plain LCS table is enough.
 */

export type DiffLineKind = 'context' | 'add' | 'remove'

export interface DiffLine {
  kind: DiffLineKind
  text: string
  /** 1-based line number in the before text; null for an added line. */
  beforeNumber: number | null
  /** 1-based line number in the after text; null for a removed line. */
  afterNumber: number | null
}

export interface DiffFold {
  kind: 'fold'
  /** The unchanged lines this fold hides, in order. */
  lines: DiffLine[]
}

export type DiffRow = DiffLine | DiffFold

/** Largest LCS table (before lines x after lines) that is computed exactly. */
const MAX_TABLE_CELLS = 4_000_000

/** Splits text into lines. A trailing newline does not add an empty last line. */
export function splitLines(text: string | null): string[] {
  if (text === null || text === '') return []
  const lines = text.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  return lines
}

/**
 * Unified line diff of two texts. A `null` side is an empty text, so a CREATE
 * comes out as all `add` lines and a DELETE as all `remove` lines.
 *
 * Common leading and trailing lines are peeled off first. When what remains is
 * too large for an exact table, it is reported as a full replacement, which is
 * still a correct diff, only a longer one.
 */
export function diffLines(before: string | null, after: string | null): DiffLine[] {
  const a = splitLines(before)
  const b = splitLines(after)

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const middle = diffMiddle(a.slice(start, endA), b.slice(start, endB))

  const result: DiffLine[] = []
  let beforeNumber = 1
  let afterNumber = 1
  const push = (kind: DiffLineKind, text: string) => {
    result.push({
      kind,
      text,
      beforeNumber: kind === 'add' ? null : beforeNumber,
      afterNumber: kind === 'remove' ? null : afterNumber,
    })
    if (kind !== 'add') beforeNumber++
    if (kind !== 'remove') afterNumber++
  }

  for (const text of a.slice(0, start)) push('context', text)
  for (const entry of middle) push(entry.kind, entry.text)
  for (const text of a.slice(endA)) push('context', text)
  return result
}

function diffMiddle(a: string[], b: string[]): { kind: DiffLineKind; text: string }[] {
  if (a.length === 0) return b.map((text) => ({ kind: 'add', text }))
  if (b.length === 0) return a.map((text) => ({ kind: 'remove', text }))
  if (a.length * b.length > MAX_TABLE_CELLS) {
    return [
      ...a.map((text) => ({ kind: 'remove' as const, text })),
      ...b.map((text) => ({ kind: 'add' as const, text })),
    ]
  }

  // lcs[i][j] = longest common subsequence length of a[i..] and b[j..].
  const width = b.length + 1
  const lcs = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const out: { kind: DiffLineKind; text: string }[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'context', text: a[i] })
      i++
      j++
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      out.push({ kind: 'remove', text: a[i] })
      i++
    } else {
      out.push({ kind: 'add', text: b[j] })
      j++
    }
  }
  for (; i < a.length; i++) out.push({ kind: 'remove', text: a[i] })
  for (; j < b.length; j++) out.push({ kind: 'add', text: b[j] })
  return out
}

/**
 * Replaces each run of unchanged lines that is longer than `2 * context` (inside
 * the diff) or longer than `context` (at either end) with one fold, keeping
 * `context` lines beside every change, like `git diff -U<context>`.
 *
 * A fold is only made when it hides at least `minFold` lines, so a fold never
 * costs more rows than the lines it replaces.
 */
export function foldUnchanged(lines: DiffLine[], context = 3, minFold = 2): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((line, index) => {
    if (line.kind === 'context') return
    const from = Math.max(0, index - context)
    const to = Math.min(lines.length - 1, index + context)
    for (let k = from; k <= to; k++) keep[k] = true
  })

  const rows: DiffRow[] = []
  let index = 0
  while (index < lines.length) {
    if (keep[index]) {
      rows.push(lines[index])
      index++
      continue
    }
    let end = index
    while (end < lines.length && !keep[end]) end++
    const hidden = lines.slice(index, end)
    if (hidden.length >= minFold) rows.push({ kind: 'fold', lines: hidden })
    else rows.push(...hidden)
    index = end
  }
  return rows
}
