/**
 * Whether this browser is on a Mac-family OS, so shortcut hints read ⌘ there and
 * Ctrl elsewhere. It is a display concern only — the handlers accept both
 * `metaKey` and `ctrlKey` regardless, so a wrong guess never breaks the shortcut.
 *
 * `userAgentData.platform` is the modern signal; `navigator.platform` is the
 * long-standing fallback. Both can be absent (SSR, exotic runtimes), so this
 * defaults to non-Mac.
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const platform = data?.platform ?? navigator.platform ?? ''
  return /mac/i.test(platform)
}

/** The modifier label for this OS: "⌘" on Mac, "Ctrl" elsewhere. */
export function modKeyLabel(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

/** A full shortcut label like "⌘K" / "Ctrl K" for a given key. */
export function shortcutLabel(key: string): string {
  return isMac() ? `${modKeyLabel()}${key}` : `${modKeyLabel()} ${key}`
}
