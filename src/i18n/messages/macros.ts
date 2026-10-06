import type { Localized } from '../messages'

/** Strings for `src/macros/*`. See `common.ts` for the typing convention. */
export const macrosEn = {
  section: {
    // No title here: the workspace layout already renders the nav label as the
    // page's `h1`, and a second heading with the same words would be read twice.
    subtitle:
      'The macros the QA agent saved on this build, and the source it wrote for each one.',
    selectLabel: 'Build',
    refresh: 'Refresh',
    noBuildsTitle: 'This project has no builds yet',
    noBuildsCopy: 'Register a build with the SDK, and the macros saved against it appear here.',
  },
  states: {
    loading: 'Loading this build’s macros…',
    loadFailed: 'This build’s macros could not be loaded.',
    retry: 'Retry',
  },
  empty: {
    title: 'No macros are registered on this build',
    copy: 'A macro appears here once a QA run succeeds at something worth repeating and the agent saves it.',
  },
  list: {
    label: 'Macros on this build',
    attachedHeading: (count: number) => `Attached to a screen · ${count}`,
    // Not "works anywhere". The empty relation records that nobody has decided
    // where this belongs — the opposite of a macro cleared for general use.
    unattachedHeading: (count: number) => `No screen chosen yet · ${count}`,
    unattachedCopy:
      'Nothing has said where these run. An empty relation means the screen is still undecided, not that the macro works on any screen.',
    unnamedScreen: (id: string) => `Unnamed screen #${id}`,
    screenCount: (count: number) => `${count} screen${count === 1 ? '' : 's'}`,
    updatedAt: (date: string) => `Updated ${date}`,
  },
  detail: {
    title: 'Macro',
    hint: 'Pick a macro to read its source.',
    screensLabel: 'Attached screens',
    noScreens: 'No screen chosen yet',
    noScreensCopy:
      'Nothing has said where this macro runs. That is an open question, not permission to run it anywhere.',
    sourceLabel: 'Source',
    // The screen never edits a macro, and saying so is cheaper than letting
    // someone hunt for a control that does not exist.
    readOnly: 'Read-only. A macro is rewritten by the agent, not from this screen.',
    sourceEmpty: 'This macro has no source.',
    sourceLoading: 'Loading the source…',
    sourceFailed: 'The source could not be loaded.',
    parameterless: 'Takes no parameters',
  },
} as const

export const macrosKo: Localized<typeof macrosEn> = {
  section: {
    subtitle: 'QA 에이전트가 이 빌드에 저장한 macro 와, 각각에 대해 쓴 source 입니다.',
    selectLabel: '빌드',
    refresh: '새로고침',
    noBuildsTitle: '이 프로젝트에는 아직 빌드가 없습니다',
    noBuildsCopy: 'SDK 로 빌드를 등록하면, 그 빌드에 저장된 macro 가 여기 나타납니다.',
  },
  states: {
    loading: '이 빌드의 macro 를 불러오는 중…',
    loadFailed: '이 빌드의 macro 를 불러오지 못했습니다.',
    retry: '다시 시도',
  },
  empty: {
    title: '이 빌드에 등록된 macro 가 없습니다',
    copy: 'QA 런이 다시 할 만한 조작에 성공하고 에이전트가 그것을 저장하면 여기 나타납니다.',
  },
  list: {
    label: '이 빌드의 macro',
    attachedHeading: (count: number) => `screen 에 달림 · ${count}`,
    unattachedHeading: (count: number) => `아직 screen 미정 · ${count}`,
    unattachedCopy:
      '이것들이 어디서 도는지는 아직 아무도 정하지 않았습니다. 빈 관계는 screen 이 미정이라는 뜻이지, 아무 screen 에서나 된다는 뜻이 아닙니다.',
    unnamedScreen: (id: string) => `이름 없는 screen #${id}`,
    screenCount: (count: number) => `screen ${count}개`,
    updatedAt: (date: string) => `수정 ${date}`,
  },
  detail: {
    title: 'Macro',
    hint: 'macro 를 하나 고르면 source 를 읽을 수 있습니다.',
    screensLabel: '달린 screen',
    noScreens: '아직 screen 미정',
    noScreensCopy:
      '이 macro 가 어디서 도는지는 아직 아무도 정하지 않았습니다. 아직 답이 없는 것이지, 아무 데서나 돌려도 된다는 허가가 아닙니다.',
    sourceLabel: 'Source',
    readOnly: '읽기 전용입니다. macro 는 에이전트가 다시 쓰고, 이 화면에서는 고치지 않습니다.',
    sourceEmpty: '이 macro 에는 source 가 없습니다.',
    sourceLoading: 'source 를 불러오는 중…',
    sourceFailed: 'source 를 불러오지 못했습니다.',
    parameterless: 'parameter 없음',
  },
}
