/** Installs the ARTEL agent skills into the current project; `-g` makes them global. */
export const SKILLS_INSTALL_COMMAND = 'npx skills add project-artel/artel-skills'
export const SKILLS_REPOSITORY_URL = 'https://github.com/project-artel/artel-skills'

/** 설치 안내의 세 쪽(ARTEL-1208). `?guide=` 값이다. */
export const SETUP_GUIDES = ['sdk', 'cli', 'skills'] as const
export type SetupGuideId = (typeof SETUP_GUIDES)[number]

/** 모르는 값이나 없는 값은 첫 쪽(SDK)이다. */
export function setupGuideFrom(value: string | null): SetupGuideId {
  return SETUP_GUIDES.find((one) => one === value) ?? 'sdk'
}
