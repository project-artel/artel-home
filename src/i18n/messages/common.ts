import type { Localized } from '../messages'

/**
 * Strings for the shell, session boundary, and error pages. English is the
 * source of shape; `commonKo` is typed against it so the locales cannot drift.
 */
export const commonEn = {
  shell: {
    brandHomeLabel: 'ARTEL Replay Studio home',
    signOut: 'Sign out',
    languageLabel: 'Language',
    switchToDark: 'Switch to dark theme',
    switchToLight: 'Switch to light theme',
  },
  session: {
    checking: 'Checking your session…',
  },
  login: {
    title: 'Sign in to your workspace',
    copy: 'Continue with an approved account to inspect QA sessions, agent actions, and replay evidence.',
    serviceUnavailable: 'Authentication service is unavailable. You can retry sign-in shortly.',
    providerListLabel: 'Social sign-in providers',
    continueWith: (provider: string) => `Continue with ${provider}`,
    note: 'Authentication is handled by the selected provider.',
    errorOauth: 'GitHub sign-in could not be completed. Please try again.',
    errorServer: 'We could not start your session. Please try again shortly.',
    errorGeneric: 'Sign-in could not be completed. Please try again.',
  },
  /** The relay page the Artel SDK opens to turn a browser session into its own token. */
  sdkLogin: {
    eyebrow: 'ARTEL SDK',
    title: 'Connect the Artel SDK',
    signInCopy: 'Sign in to approve the SDK waiting on this machine.',
    issuing: 'Approving the SDK…',
    returning: 'Returning to the SDK…',
    /** The three parameter faults are separate because the fixes differ. */
    invalidPort: 'The SDK asked this page to answer on a port it is not allowed to use. Start the sign-in from the SDK again.',
    missingRequest: 'This address is missing the details the SDK has to send. Start the sign-in from the SDK again.',
    failed: 'The SDK could not be approved. It may have waited too long, or the server could not be reached.',
    retry: 'Try again',
    note: 'Approval only works for the SDK that opened this page. It is safe to close this tab once the SDK takes over.',
  },
  notFound: {
    title: 'Page not found',
    copy: 'That address does not match anything in the workspace.',
    backToProjects: 'Back to projects',
  },
} as const

export const commonKo: Localized<typeof commonEn> = {
  shell: {
    brandHomeLabel: 'ARTEL Replay Studio 홈',
    signOut: '로그아웃',
    languageLabel: '언어',
    switchToDark: '다크 테마로 전환',
    switchToLight: '라이트 테마로 전환',
  },
  session: {
    checking: '세션을 확인하는 중…',
  },
  login: {
    title: '워크스페이스에 로그인',
    copy: '승인된 계정으로 계속하여 QA 세션, 에이전트 액션, 리플레이 증거를 확인하세요.',
    serviceUnavailable: '인증 서비스를 사용할 수 없습니다. 잠시 후 다시 로그인해 주세요.',
    providerListLabel: '소셜 로그인 제공자',
    continueWith: (provider: string) => `${provider} 계정으로 계속`,
    note: '인증은 선택한 제공자를 통해 처리됩니다.',
    errorOauth: 'GitHub 로그인을 완료하지 못했습니다. 다시 시도해 주세요.',
    errorServer: '세션을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    errorGeneric: '로그인을 완료하지 못했습니다. 다시 시도해 주세요.',
  },
  sdkLogin: {
    eyebrow: 'ARTEL SDK',
    title: 'Artel SDK 연결',
    signInCopy: '로그인하면 이 컴퓨터에서 기다리고 있는 SDK를 승인할 수 있습니다.',
    issuing: 'SDK를 승인하는 중…',
    returning: 'SDK로 돌아가는 중…',
    invalidPort: 'SDK가 사용할 수 없는 포트로 응답을 요청했습니다. SDK에서 로그인을 다시 시작해 주세요.',
    missingRequest: '주소에 SDK가 보내야 할 정보가 없습니다. SDK에서 로그인을 다시 시작해 주세요.',
    failed: 'SDK를 승인하지 못했습니다. 시간이 너무 지났거나 서버에 연결하지 못했을 수 있습니다.',
    retry: '다시 시도',
    note: '승인은 이 페이지를 연 SDK에만 적용됩니다. SDK가 이어받은 뒤에는 이 탭을 닫아도 됩니다.',
  },
  notFound: {
    title: '페이지를 찾을 수 없습니다',
    copy: '주소가 워크스페이스의 어떤 항목과도 일치하지 않습니다.',
    backToProjects: '프로젝트 목록으로',
  },
}
