import { appPath } from '../appPath'
import { useEffect, useState, type ReactNode } from 'react'
import { composeNicknameTag, type AuthUser } from '../auth/authTypes'
import { useAuth } from '../auth/useAuth'
import { useI18n } from '../i18n/useI18n'
import { LoginPage } from '../LoginPage'
import { ThemeToggle } from '../ThemeToggle'
import {
  buildDenyUrl,
  discardParkedMcpConnectRequest,
  MCP_BASE_URL,
  parkMcpConnectRequest,
  readMcpConnectRequest,
  type McpConnectRequest,
} from './mcpConnectRequest'
import { createMcpHandoff, handoffFailure, type HandoffFailure } from './mcpHandoffApi'

type Phase =
  | { kind: 'consent'; failure: HandoffFailure | null }
  | { kind: 'allowing' }
  | { kind: 'leaving' }
  | { kind: 'denied' }

/**
 * MCP 가 `/authorize` 를 받은 뒤 브라우저를 보내는 동의 화면. 허용하면 orchestration 이 만든 MCP
 * 주소로, 거절하면 MCP 의 거절 주소로 떠난다.
 *
 * `SdkLoginPage` 처럼 router 밖에서 그린다. router 는 로그인한 사용자에게만 붙는데, 이 페이지는
 * 세션이 없는 브라우저에서도 열리고 로그인 화면을 거쳐 같은 주소로 돌아와야 한다.
 */
export function McpConnectPage() {
  const auth = useAuth()
  const { t } = useI18n()
  // 한 번만 읽는다. 이 페이지는 마지막에 다른 주소로 떠나므로 이후 render 가 주소를 다시 읽으면 안 된다.
  const [request] = useState(() => readMcpConnectRequest(window.location.search))

  useEffect(() => {
    if (typeof request === 'string' || auth.status === 'loading') return
    if (auth.status === 'authenticated') {
      discardParkedMcpConnectRequest()
    } else {
      parkMcpConnectRequest()
    }
  }, [auth.status, request])

  if (typeof request === 'string') {
    return (
      <McpConnectFrame>
        <ErrorAlert message={t.common.mcpConnect.invalidRequest} />
      </McpConnectFrame>
    )
  }

  if (auth.status === 'loading') {
    return (
      <main className="session-loading" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        {t.common.session.checking}
      </main>
    )
  }

  if (auth.status !== 'authenticated') {
    return (
      <LoginPage
        copy={t.common.mcpConnect.signInCopy}
        serviceUnavailable={auth.status === 'error'}
      />
    )
  }

  return <McpConsent request={request} user={auth.user} />
}

function McpConsent({ request, user }: { request: McpConnectRequest; user: AuthUser }) {
  const { t } = useI18n()
  const copy = t.common.mcpConnect
  const [phase, setPhase] = useState<Phase>({ kind: 'consent', failure: null })

  function allow() {
    setPhase({ kind: 'allowing' })
    createMcpHandoff(request.requestId)
      .then((redirectUrl) => {
        // 브라우저가 떠나는 동안에도 문구가 남도록 먼저 바꾼다.
        setPhase({ kind: 'leaving' })
        window.location.assign(redirectUrl)
      })
      .catch((error: unknown) => {
        // 401 이면 `apiFetch` 가 이미 세션을 끊었고 위의 로그인 화면이 먼저 그려진다.
        setPhase({ kind: 'consent', failure: handoffFailure(error, t) })
      })
  }

  function deny() {
    const denyUrl = buildDenyUrl(MCP_BASE_URL, request.requestId)
    if (denyUrl === null) {
      setPhase({ kind: 'denied' })
      return
    }
    setPhase({ kind: 'leaving' })
    window.location.assign(denyUrl)
  }

  if (phase.kind === 'denied') {
    return (
      <McpConnectFrame>
        <p className="login-copy" role="status">{copy.denied}</p>
      </McpConnectFrame>
    )
  }

  const isBusy = phase.kind === 'allowing' || phase.kind === 'leaving'
  const failure = phase.kind === 'consent' ? phase.failure : null
  const showsActions = failure === null || failure.isRetryable

  return (
    <McpConnectFrame>
      <p className="login-copy">
        {request.clientName === null ? (
          copy.unnamedRequest
        ) : (
          <>
            {/* `client_name` 은 클라이언트가 정한 값이다. text node 로만 넣는다. */}
            <strong className="mcp-connect-client">{request.clientName}</strong>
            {copy.requestSuffix}
          </>
        )}
      </p>

      <div className="mcp-connect-scope">
        <h2>{copy.canTitle}</h2>
        <ul>
          <li>{copy.canReadProjects}</li>
          <li>{copy.canManageMacros}</li>
        </ul>
        <h2>{copy.cannotTitle}</h2>
        <ul>
          <li>{copy.cannotRunQa}</li>
          <li>{copy.cannotChangeSettings}</li>
        </ul>
      </div>

      <dl className="mcp-connect-account">
        <dt>{copy.signedInAs}</dt>
        <dd>
          <span className="mono">{composeNicknameTag(user.nickname, user.userTag)}</span>
          {user.email !== null && <span className="mcp-connect-email">{user.email}</span>}
        </dd>
      </dl>

      {failure !== null && <ErrorAlert message={failure.message} />}

      <p className="mcp-connect-status" aria-live="polite">
        {phase.kind === 'allowing' && copy.allowing}
        {phase.kind === 'leaving' && copy.leaving}
      </p>

      {showsActions && (
        <div className="form-actions">
          <button className="button button--secondary" disabled={isBusy} onClick={deny} type="button">
            {copy.deny}
          </button>
          <button className="button button--primary" disabled={isBusy} onClick={allow} type="button">
            {copy.allow}
          </button>
        </div>
      )}
    </McpConnectFrame>
  )
}

/** 로그인 화면과 같은 판. 이 페이지의 모든 상태가 이 안에 그려진다. */
function McpConnectFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n()

  return (
    <main className="login-layout">
      <div className="login-theme-toggle">
        <ThemeToggle
          toDarkLabel={t.common.shell.switchToDark}
          toLightLabel={t.common.shell.switchToLight}
        />
      </div>
      <section className="login-panel" aria-labelledby="mcp-connect-title">
        <div className="login-brand" aria-hidden="true">
          <img src={appPath('/artel-mark.svg')} alt="" />
        </div>
        <p className="eyebrow">{t.common.mcpConnect.eyebrow}</p>
        <h1 id="mcp-connect-title">{t.common.mcpConnect.title}</h1>
        {children}
        <p className="login-note">{t.common.mcpConnect.note}</p>
      </section>
    </main>
  )
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="login-error" role="alert">
      <span aria-hidden="true">!</span>
      {message}
    </div>
  )
}
