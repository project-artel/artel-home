import { useState } from 'react'
import { applyTheme, currentTheme } from './theme'

export function ThemeToggle({
  toDarkLabel,
  toLightLabel,
}: {
  toDarkLabel: string
  toLightLabel: string
}) {
  const [theme, setTheme] = useState(currentTheme)

  return (
    <button
      aria-label={theme === 'dark' ? toLightLabel : toDarkLabel}
      className="theme-toggle"
      onClick={() => {
        const next = theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        setTheme(next)
      }}
      type="button"
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  )
}
