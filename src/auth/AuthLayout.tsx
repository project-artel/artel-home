import type { ReactNode } from 'react'
import { appPath } from '../appPath'
import { useI18n } from '../i18n/useI18n'
import { ThemeToggle } from '../ThemeToggle'

/**
 * 로그인 · SDK 로그인 중계 · 비밀번호 바꾸기 · MCP 연결 동의가 함께 쓰는 판(ARTEL-1266). 왼쪽은 Artel 로고와
 * 이름만 두는 자리이고, 오른쪽에 각 화면의 [children](`.login-panel`)이 들어간다. 좁은 화면에서는 왼쪽이 위의
 * 띠로 줄어든다.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n()

  return (
    <main className="login-layout">
      <div className="login-hero">
        {/* 테마마다 다른 판을 쓴다. 어두운 테마의 판은 CSS 가 `content` 로 바꾼다. */}
        <img alt="" className="login-hero-mark" height={240} src={appPath('/artel-logo-symbol.png')} width={240} />
        <p className="login-hero-word">
          <span className="login-hero-name">ARTEL</span>
          <span className="login-hero-product">Replay Studio</span>
        </p>
      </div>
      <div className="login-side">
        <div className="login-theme-toggle">
          <ThemeToggle
            toDarkLabel={t.common.shell.switchToDark}
            toLightLabel={t.common.shell.switchToLight}
          />
        </div>
        {children}
      </div>
    </main>
  )
}
