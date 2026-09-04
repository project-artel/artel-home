/**
 * The contract between the Artel SDK and the console's relay page: what the SDK
 * puts in the address, what this client is willing to believe, and where the
 * answer is allowed to be sent.
 *
 * Separate from `SdkLoginPage` so the app root can import the path and the
 * resume hook without pulling a component in behind them.
 */

/** Also the address the SDK is compiled against, so it is a constant, not config. */
export const SDK_LOGIN_PATH = '/sdk-login'

const PARKED_REQUEST_KEY = 'artel.sdkLoginRequest'

/**
 * The two flows that mint a login code against this page: the Unity SDK, and
 * the `artel` CLI, which adds `kind=cli` to the address the SDK does not send.
 * The server records which one a code was minted for and lets each exchange
 * endpoint trade only its own kind, so this is also what `createSdkLoginCode`
 * sends it.
 */
export type RelayRequestKind = 'sdk' | 'cli'

/**
 * What the SDK asks this page for: issue a login code against `challenge`, and
 * hand it back to the loopback server listening on `port`, echoing `state` so
 * the SDK can tell its own request from a stray one.
 */
export type RelayRequest = {
  challenge: string
  port: number
  state: string
  kind: RelayRequestKind
}

/** The three ways the address can be unusable. Each names its own message key. */
export type RequestFault = 'invalidPort' | 'missingRequest' | 'invalidKind'

/**
 * An absent `kind` means `sdk`: the Unity SDK never sends the parameter, and
 * every link and bookmark minted before the CLI existed must keep working
 * unchanged. Anything present that is neither flow the server knows is a
 * tampered or hand-written address, not a silent third flow.
 */
function readKind(raw: string | null): RelayRequestKind | null {
  if (raw === null) return 'sdk'
  return raw === 'sdk' || raw === 'cli' ? raw : null
}

/**
 * Ports below 1024 need privileges the SDK does not run with, so anything
 * outside 1024–65535 means the address was hand-written or tampered with.
 *
 * The digits-only test carries as much weight as the range: `parseInt` would
 * read `'5000/evil'` as 5000 and this page would build a URL around the rest.
 */
function readPort(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null

  const port = Number(raw)
  return port >= 1024 && port <= 65535 ? port : null
}

export function readRelayRequest(search: string): RelayRequest | RequestFault {
  const params = new URLSearchParams(search)

  const port = readPort(params.get('port'))
  if (port === null) return 'invalidPort'

  const kind = readKind(params.get('kind'))
  if (kind === null) return 'invalidKind'

  const challenge = params.get('challenge') ?? ''
  const state = params.get('state') ?? ''
  if (challenge === '' || state === '') return 'missingRequest'

  return { challenge, port, state, kind }
}

/**
 * The host is written here, never read from the address. Accepting one from the
 * query would make this page an open redirect that hands a live login code to
 * whatever host asked for it. The port is the only part the SDK gets to choose,
 * and `readPort` is what keeps it a port.
 */
export function callbackUrl(request: RelayRequest, code: string): string {
  // Percent-encoded rather than built with `URLSearchParams`, which would spell
  // a space as `+`. The SDK reads these back with a plain URL decode.
  return (
    `http://127.0.0.1:${request.port}/callback` +
    `?code=${encodeURIComponent(code)}&state=${encodeURIComponent(request.state)}`
  )
}

/**
 * The server's OAuth success handler redirects to the console root and carries
 * nothing back, so the relay request is parked before sign-in and replayed once
 * a session exists. `sessionStorage` rather than `localStorage`: the request
 * belongs to this tab and must die with it.
 */
export function parkRequest(): void {
  sessionStorage.setItem(PARKED_REQUEST_KEY, window.location.search)
}

/** Called from the app root, which is where a completed sign-in lands. */
export function resumeSdkLogin(): void {
  const search = sessionStorage.getItem(PARKED_REQUEST_KEY)
  if (search === null) return

  sessionStorage.removeItem(PARKED_REQUEST_KEY)
  window.location.replace(`${SDK_LOGIN_PATH}${search}`)
}

