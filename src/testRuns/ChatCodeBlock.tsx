import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'

/**
 * A fenced code block from a model answer, with a button that copies it.
 *
 * Copying can be refused (no secure context, permission denied); then the button
 * stays as it was and the text is still selectable.
 */
export function ChatCodeBlock({ text }: { text: string }) {
  const { t } = useI18n()
  const copy = t.projectAgent.chat
  const [copied, setCopied] = useState(false)

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="chat-md-fence">
      <pre tabIndex={0}><code>{text}</code></pre>
      <button aria-label={copy.copyCode} className="chat-md-fence__copy" onClick={() => void copyText()} type="button">
        {copied ? copy.copiedCode : copy.copyCode}
      </button>
    </div>
  )
}
