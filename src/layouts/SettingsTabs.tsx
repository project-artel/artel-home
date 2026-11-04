import { useId, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import './screens.css'

export type SettingsTab = {
  /** 주소 `?tab=` 의 값. 첫 탭은 주소에 남기지 않는다. */
  id: string
  label: string
  tone?: 'danger'
  content: ReactNode
}

/**
 * 설정 화면 배치(ARTEL-1380): 왼쪽 탭 + 오른쪽 한 화면. 프로젝트 설정과 계정 설정이 같이 쓴다.
 *
 * 예전(ARTEL-1208)에는 왼쪽이 목차였고 오른쪽에 칸이 격자로 다 놓였다. 칸이 두 줄로 놓여 목차 순서와 화면 순서가
 * 어긋나고, 목차에 없는 칸도 생겼다. 이제 목차 하나가 탭 하나고, 오른쪽에는 그 탭의 화면만 선다. 고른 탭은 주소에
 * 남아 새로고침 · 공유해도 그 탭이 열린다. 탭 모양은 예전 목차 링크(`settings-toc-link`)를 그대로 쓴다.
 */
export function SettingsTabs({ label, tabs, aside }: { label: string; tabs: SettingsTab[]; aside?: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const baseId = useId()
  const first = tabs[0]
  const current = tabs.find((tab) => tab.id === params.get('tab')) ?? first

  function pick(tab: SettingsTab) {
    setParams(
      (next) => {
        if (tab.id === first?.id) next.delete('tab')
        else next.set('tab', tab.id)
        return next
      },
      { replace: true },
    )
  }

  if (current === undefined) return null
  return (
    <div className="settings-tabs">
      <div className="settings-tabs-side">
        <div aria-label={label} aria-orientation="vertical" className="settings-toc" role="tablist">
          {tabs.map((tab) => (
            <button
              aria-controls={`${baseId}-panel`}
              aria-selected={tab.id === current.id}
              className={`settings-toc-link${tab.tone === 'danger' ? ' is-danger' : ''}`}
              id={`${baseId}-${tab.id}`}
              key={tab.id}
              onClick={() => pick(tab)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        {aside}
      </div>
      <div aria-labelledby={`${baseId}-${current.id}`} className="settings-screen" id={`${baseId}-panel`} role="tabpanel">
        {current.content}
      </div>
    </div>
  )
}

/**
 * 탭 화면 머리(ARTEL-1380). 아이콘 · 한 줄 설명 · 오른쪽 장식 그림으로 칸 위를 채운다. 칸 제목은 칸이 이미 갖고
 * 있어 여기서 다시 말하지 않는다.
 */
export function SettingsScreenHead({ icon, body, tone }: { icon: ReactNode; body: string; tone?: 'danger' }) {
  return (
    <div className={'settings-screen-head' + (tone === 'danger' ? ' is-danger' : '')}>
      <span aria-hidden="true" className="settings-screen-icon">{icon}</span>
      <p>{body}</p>
      <SettingsArt />
    </div>
  )
}

/** 탭 머리 · 일반 탭 머리 뒤의 장식 그림. 점선이 이어지고 한 점이 깜박인다. */
export function SettingsArt() {
  return (
    <svg aria-hidden="true" className="settings-screen-art" fill="none" viewBox="0 0 320 96">
      <path className="settings-art-line" d="M8 84 L92 22 L150 64 L214 14 L312 72" />
      <circle className="settings-art-dot settings-art-dot--hot" cx="92" cy="22" r="5" />
      <circle className="settings-art-dot" cx="214" cy="14" r="4" />
      <circle className="settings-art-dot" cx="150" cy="64" r="3" />
      <circle className="settings-art-ring" cx="262" cy="52" r="26" />
    </svg>
  )
}

/** 탭 머리의 24px 선 아이콘 하나. */
export function TabIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="22">
      <path d={d} />
    </svg>
  )
}
