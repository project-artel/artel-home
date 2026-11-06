import { useId, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SketchEmpty } from '../emptyStates/SketchEmpty'
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
 * 탭 화면의 남는 자리(ARTEL-1380). 칸 아래에 그 탭이 무엇을 하는지 손그림(`sketches.tsx`)과 함께 둔다 — 칸 하나만
 * 두면 큰 창의 아래가 통째로 빈다. 그림은 빈 화면 그림과 같은 `SketchEmpty` 를 쓴다.
 */
export function SettingsScreenFill({ sketch, title, body }: { sketch: ReactNode; title: string; body: string }) {
  return (
    <div className="settings-screen-fill">
      <SketchEmpty body={body} sketch={sketch} title={title} />
    </div>
  )
}
