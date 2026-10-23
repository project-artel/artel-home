import { useEffect, useState, type ReactNode } from 'react'
import './screens.css'

export type SettingsTocItem = {
  /** 그 칸 제목(`h2`)의 id. 목차는 그 제목이 든 칸으로 옮겨 간다. */
  targetId: string
  label: string
  tone?: 'danger'
}

/**
 * 설정 화면 배치(ARTEL-1208): 왼쪽 목차 + 오른쪽 칸 격자. 프로젝트 설정과 계정 설정이 같이 쓴다.
 *
 * 칸은 지금처럼 각자의 `section.panel` 이고, 목차는 그 제목 id 로 칸을 찾아 옮겨 간다. 지금 보이는 칸을
 * 목차에 표시한다.
 */
export function SettingsLayout({ label, items, children }: { label: string; items: SettingsTocItem[]; children: ReactNode }) {
  const [active, setActive] = useState(items[0]?.targetId ?? '')
  const key = items.map((item) => item.targetId).join(',')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const ids = key.split(',')
    const sections = ids
      .map((id) => document.getElementById(id)?.closest('section'))
      .filter((section): section is HTMLElement => section != null)
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const first = seen[0]?.target.querySelector('h2')?.id
        if (first !== undefined && ids.includes(first)) setActive(first)
      },
      { rootMargin: '0px 0px -55% 0px' },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [key])

  function go(targetId: string) {
    const section = document.getElementById(targetId)?.closest('section')
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(targetId)
  }

  return (
    <div className="settings-layout">
      <nav aria-label={label} className="settings-toc">
        {items.map((item) => (
          <a
            aria-current={active === item.targetId ? 'true' : undefined}
            className={`settings-toc-link${item.tone === 'danger' ? ' is-danger' : ''}`}
            href={`#${item.targetId}`}
            key={item.targetId}
            onClick={(event) => {
              event.preventDefault()
              go(item.targetId)
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className="settings-grid">{children}</div>
    </div>
  )
}
