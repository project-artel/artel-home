import type { ReactNode } from 'react'

/**
 * Renders a message with bold parts. `**text**` becomes bold as written, and
 * `{name}` becomes the bold `values.name`. Values are never parsed, so a name a
 * user typed cannot add or break the markup.
 */
export function emphasize(template: string, values: Record<string, string> = {}): ReactNode[] {
  return template
    .split(/(\*\*.+?\*\*|\{\w+\})/g)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={index}>{part.slice(2, -2)}</strong>
      }
      const name = /^\{(\w+)\}$/.exec(part)?.[1]
      if (name !== undefined && name in values) return <strong key={index}>{values[name]}</strong>
      return part
    })
}
