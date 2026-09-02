import type { Localized } from '../messages'

/**
 * Strings for `src/account/*`. See `common.ts` for the typing convention.
 *
 * `profile` is its own group because `ARTEL-733` adds an email panel to this
 * same screen later — a second group sits beside this one rather than this
 * one growing flat keys for a feature it does not own.
 */
export const accountEn = {
  eyebrow: 'Account',
  title: 'Account settings',
  profile: {
    title: 'Profile',
    edit: 'Edit',
    cancel: 'Cancel',
    save: 'Save changes',
    saving: 'Saving…',
    nicknameLabel: 'Nickname',
    nicknameHint: 'Up to 64 characters. Shown in place of your sign-in name across the workspace.',
    nicknameRequired: 'Enter a nickname.',
    userTagLabel: 'User tag',
    userTagHint: 'Assigned automatically, so people who chose the same nickname can still be told apart.',
    savedAnnouncement: 'Profile saved.',
    saveFailed: 'The profile could not be saved. Please try again.',
  },
} as const

export const accountKo: Localized<typeof accountEn> = {
  eyebrow: '계정',
  title: '계정 설정',
  profile: {
    title: '프로필',
    edit: '편집',
    cancel: '취소',
    save: '변경 사항 저장',
    saving: '저장하는 중…',
    nicknameLabel: 'Nickname',
    nicknameHint: '64자까지 넣을 수 있습니다. 워크스페이스 곳곳에서 로그인 이름 대신 그려집니다.',
    nicknameRequired: 'Nickname 을 입력해 주세요.',
    userTagLabel: '사용자 태그',
    userTagHint: '같은 nickname 을 쓰는 사람도 구분할 수 있도록 서버가 자동으로 붙여 줍니다.',
    savedAnnouncement: '프로필을 저장했습니다.',
    saveFailed: '프로필을 저장하지 못했습니다. 다시 시도해 주세요.',
  },
}
