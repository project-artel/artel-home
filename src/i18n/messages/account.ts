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
    nicknameHint: 'Up to 64 characters. Shown in place of your sign-in name across the workspace. Leave it empty to keep using your sign-in name.',
    battleTagLabel: 'BattleTag',
    battleTagPlaceholder: 'Name#1234',
    battleTagHint: 'A name of up to 24 characters, then "#", then 1 to 8 digits.',
    battleTagInvalid: 'Enter a BattleTag as a name, "#", and 1 to 8 digits — for example Ashbringer#1234.',
    notSet: 'Not set',
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
    nicknameHint: '64자까지 넣을 수 있습니다. 워크스페이스 곳곳에서 로그인 이름 대신 그려집니다. 비워 두면 로그인 이름을 계속 씁니다.',
    battleTagLabel: 'BattleTag',
    battleTagPlaceholder: 'Name#1234',
    battleTagHint: '이름 24자 이하, #, 숫자 1~8자 순서입니다.',
    battleTagInvalid: 'BattleTag는 이름, #, 숫자 1~8자 순서로 적어 주세요 — 예: Ashbringer#1234.',
    notSet: '설정하지 않음',
    savedAnnouncement: '프로필을 저장했습니다.',
    saveFailed: '프로필을 저장하지 못했습니다. 다시 시도해 주세요.',
  },
}
