export type Format = 'heading' | 'bold' | 'italic' | 'strike' | 'quote' | 'code' | 'link' | 'bullet' | 'number' | 'task' | 'mention'

/** 글 [value] 의 선택 [start, end) 에 [format] 을 입힌 새 글과 그 뒤의 선택. GitHub 편집기의 도구 줄과 같다. */
export function applyFormat(value: string, start: number, end: number, format: Format) {
  const selected = value.slice(start, end)
  const wrap = (mark: string, placeholder: string) => {
    const inner = selected || placeholder
    const next = value.slice(0, start) + mark + inner + mark + value.slice(end)
    return { next, start: start + mark.length, end: start + mark.length + inner.length }
  }
  // 선택이 걸친 줄마다 앞에 표시를 붙인다.
  const prefix = (marker: (index: number) => string) => {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineEnd = end > start && value[end - 1] === '\n' ? end - 1 : value.indexOf('\n', end) < 0 ? value.length : value.indexOf('\n', end)
    const lines = value.slice(lineStart, lineEnd).split('\n')
    const block = lines.map((line, index) => marker(index) + line).join('\n')
    const next = value.slice(0, lineStart) + block + value.slice(lineEnd)
    return { next, start: lineStart + marker(0).length, end: lineStart + block.length }
  }
  switch (format) {
    case 'bold':
      return wrap('**', 'text')
    case 'italic':
      return wrap('_', 'text')
    case 'strike':
      return wrap('~~', 'text')
    case 'code':
      if (selected.includes('\n')) {
        const next = `${value.slice(0, start)}\`\`\`\n${selected}\n\`\`\`${value.slice(end)}`
        return { next, start: start + 4, end: start + 4 + selected.length }
      }
      return wrap('`', 'code')
    case 'link': {
      const text = selected || 'text'
      const next = `${value.slice(0, start)}[${text}](url)${value.slice(end)}`
      const urlStart = start + text.length + 3
      return { next, start: urlStart, end: urlStart + 3 }
    }
    case 'heading':
      return prefix(() => '### ')
    case 'quote':
      return prefix(() => '> ')
    case 'bullet':
      return prefix(() => '- ')
    case 'number':
      return prefix((index) => `${index + 1}. `)
    case 'task':
      return prefix(() => '- [ ] ')
    case 'mention': {
      const before = start > 0 && !/\s/.test(value[start - 1]) ? ' @' : '@'
      const next = value.slice(0, start) + before + value.slice(end)
      return { next, start: start + before.length, end: start + before.length }
    }
  }
}
