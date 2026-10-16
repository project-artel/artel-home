import { useState, type ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { ChevronDownIcon } from '../qaModelIcons'

const STORAGE_PREFIX = 'artel.qa-launch.collapsed.'

function readCollapsed(id: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + id) === 'true'
  } catch {
    return false
  }
}

/**
 * 접을 수 있는 구역(ARTEL-1084). **기본은 펼침**이고, 접은 것은 이 브라우저가 기억한다.
 *
 * 제목 줄 전체가 버튼이 아니다 — 오른쪽에 링크(결과 보기 · 전체 기록)가 같이 서므로, 접는 것은
 * 왼쪽 갈매기와 제목만 한다.
 */
export function CollapsibleSection({
  id,
  title,
  extra,
  children,
}: {
  id: string
  title: string
  extra?: ReactNode
  children: ReactNode
}) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id))

  function toggle() {
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(STORAGE_PREFIX + id, String(next))
      } catch {
        // 저장할 수 없으면 이번 화면에서만 접힌다.
      }
      return next
    })
  }

  return (
    <section aria-labelledby={`${id}-title`} className="ql-section">
      <div className="ql-section-head">
        <button
          aria-controls={`${id}-body`}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t.qa.launch.expand(title) : t.qa.launch.collapse(title)}
          className="ql-collapse"
          onClick={toggle}
          type="button"
        >
          <ChevronDownIcon className={'ql-collapse-icon' + (collapsed ? ' is-collapsed' : '')} size={16} />
          <h2 className="ql-section-title" id={`${id}-title`}>{title}</h2>
        </button>
        {extra}
      </div>
      {!collapsed && <div className="ql-section-body" id={`${id}-body`}>{children}</div>}
    </section>
  )
}
