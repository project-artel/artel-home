/**
 * Copies one value the developer would otherwise have to retype into Unity.
 *
 * Copying is the intended path for every such value in this flow — instance
 * keys and the package git URL are long, opaque, and unforgiving of a single
 * wrong character — so the button sits next to the value rather than replacing
 * it: the text stays selectable and readable either way.
 *
 * The result is reported upwards instead of announced here, so a panel keeps
 * exactly one `aria-live` region. Several competing live regions on one screen
 * is how announcements get dropped or read out of order.
 *
 * `navigator.clipboard` requires a secure context and can be refused by the
 * user's permission settings, so failure is a normal outcome and says what to
 * do instead of pretending the copy happened.
 */
export function CopyButton({
  copiedMessage,
  label,
  onResult,
  text,
}: {
  copiedMessage: string
  label: string
  onResult: (message: string) => void
  text: string
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      onResult(copiedMessage)
    } catch {
      onResult('Copying was blocked by the browser. Select the value and copy it manually.')
    }
  }

  return (
    <button
      className="button button--secondary button--compact"
      onClick={() => void copy()}
      type="button"
    >
      {label}
    </button>
  )
}
