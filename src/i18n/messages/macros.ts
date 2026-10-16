import type { Localized } from '../messages'

/** Strings for `src/macros/*`. See `common.ts` for the typing convention. */
export const macrosEn = {
  section: {
    title: 'Registered macros',
    subtitle:
      'The macros the QA agent saved on this build, and the source it wrote for each one.',
    selectLabel: 'Build',
    refresh: 'Refresh',
    noBuildsTitle: 'This project has no builds yet',
    noBuildsCopy: 'Register a build with the SDK, and the macros saved against it appear here.',
  },
  states: {
    loading: 'Loading this build’s macros…',
    // One wording for every 404: the server will not say whether the build is
    // missing, belongs to another project, or simply has no map.
    loadFailed: 'This build’s macros could not be loaded.',
    retry: 'Retry',
    refreshFailedTitle: 'This list is the last one that loaded',
    refreshFailedCopy:
      'The refresh did not reach the server, so a macro registered since then is missing from it.',
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
  },
  developer: {
    title: 'Developer macros',
    // Where these come from. The agent macros above carry no such chip, so the
    // two groups do not read as one list.
    originChip: 'MCP',
    hint: 'Macros a game developer’s coding agent registered over the MCP connection. They belong to the project, not to a build, and the QA engine receives every one of them whichever build it runs. The chip on each shows the build it was written against.',
    listLabel: 'Developer macros of this project',
    loading: 'Loading developer macros…',
    loadFailed: 'Developer macros could not be loaded.',
    emptyTitle: 'No developer macros yet',
    emptyCopy: 'Developer macros are registered over the MCP connection.',
    writtenAgainst: (build: string) => `Written against ${build}`,
    // Says where the build sits, never whether to use the macro: the engine
    // receives it either way.
    relation: {
      older: 'Older build',
      newer: 'Newer build',
      different: 'Different build',
    },
    relationTitle: {
      older: 'Written against a build that came before the selected one.',
      newer: 'Written against a build that came after the selected one.',
      different: 'Written against another build. Its order relative to the selected one is unknown.',
    },
    registeredBy: (nickname: string, date: string) => `Registered by ${nickname} · ${date}`,
    registeredAt: (date: string) => `Registered ${date}`,
    version: (version: number) => `v${version}`,
    detail: {
      title: 'Developer macro',
      hint: 'Pick a developer macro to read its source.',
      docstringLabel: 'Docstring',
      readOnly: 'Read-only. A developer macro is registered and changed over the MCP connection, not from this screen.',
    },
  },
} as const

export const macrosKo: Localized<typeof macrosEn> = {
  section: {
    title: '등록된 macro',
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
    refreshFailedTitle: '마지막으로 불러온 목록입니다',
    refreshFailedCopy:
      '새로고침이 서버에 닿지 못했습니다. 그 뒤에 등록된 macro 는 이 목록에 없습니다.',
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
  },
  developer: {
    title: '개발자 macro',
    originChip: 'MCP',
    hint: '게임 개발자의 코딩 에이전트가 MCP 연결로 등록한 macro 입니다. 빌드가 아니라 프로젝트에 속하고, QA 엔진은 빌드와 상관없이 전부 받습니다. 각 macro 의 칩은 어느 빌드를 기준으로 썼는지 보여 줍니다.',
    listLabel: '이 프로젝트의 개발자 macro',
    loading: '개발자 macro 를 불러오는 중…',
    loadFailed: '개발자 macro 를 불러오지 못했습니다.',
    emptyTitle: '등록된 개발자 macro 가 없습니다',
    emptyCopy: '개발자 macro 는 MCP 연결로 등록됩니다.',
    writtenAgainst: (build: string) => `${build} 기준`,
    relation: {
      older: '이전 빌드',
      newer: '이후 빌드',
      different: '다른 빌드',
    },
    relationTitle: {
      older: '고른 빌드보다 먼저 올라온 빌드를 기준으로 썼습니다.',
      newer: '고른 빌드보다 나중에 올라온 빌드를 기준으로 썼습니다.',
      different: '고른 빌드와 다른 빌드를 기준으로 썼습니다. 둘의 순서는 알 수 없습니다.',
    },
    registeredBy: (nickname: string, date: string) => `${nickname} 등록 · ${date}`,
    registeredAt: (date: string) => `등록 ${date}`,
    version: (version: number) => `v${version}`,
    detail: {
      title: '개발자 macro',
      hint: '개발자 macro 를 하나 고르면 source 를 읽을 수 있습니다.',
      docstringLabel: 'Docstring',
      readOnly: '읽기 전용입니다. 개발자 macro 는 MCP 연결로 등록하고 고치며, 이 화면에서는 고치지 않습니다.',
    },
  },
}
