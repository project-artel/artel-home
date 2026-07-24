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
  notFound: {
    title: '페이지를 찾을 수 없습니다',
    copy: '주소가 워크스페이스의 어떤 항목과도 일치하지 않습니다.',
    backToProjects: '프로젝트 목록으로',
  },
}
