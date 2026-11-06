/** 키 문제로 멈춘 NOTICE. 이 두 원인만 계정 설정이나 모델 선택으로 풀 수 있다. */
const KEY_CAUSES = ['llm_key_missing', 'llm_auth_failed'] as const

export type NoticeKeyAction = {
  /** key 를 넣을 화면. 플랫폼 key 인데 관리자가 아니면 null 이다. */
  keyLink: '/account' | '/admin/settings' | null
}

/** key 원인이 아니면 null 이다. 그 경우 NOTICE 는 문구만 보인다. */
export function noticeKeyAction(
  cause: string | null,
  keySource: 'platform' | 'user' | null,
  isAdmin: boolean,
): NoticeKeyAction | null {
  if (cause === null || !(KEY_CAUSES as readonly string[]).includes(cause)) return null
  if (keySource === 'user') return { keyLink: '/account' }
  if (keySource === 'platform') return { keyLink: isAdmin ? '/admin/settings' : null }
  return { keyLink: null }
}
