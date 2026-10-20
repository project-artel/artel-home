import type { Localized } from '../messages'

/**
 * Strings for `src/macros/*`. See `common.ts` for the typing convention.
 *
 * The library mirrors the case library, so the words both screens share — the
 * version heading, `현재`, `현재 버전`, the search label, `조건 지우기` — are
 * read from `testCases` rather than repeated here.
 */
export const macrosEn = {
  section: {
    title: 'Macro library',
    subtitle:
      'Pick a version on the left to see the agent macros the QA agent saved on that build, or pick Developer macros (MCP) to see the macros a developer registered for the project over the MCP connection. This screen only reads them.',
    refresh: 'Refresh',
    noBuildsTitle: 'This project has no builds yet',
    noBuildsCopy: 'Register a build with the SDK, and the macros saved against it appear here.',
    loading: 'Loading macros…',
    retry: 'Retry',
    // One wording for every 404: the server will not say whether the build is
    // missing, belongs to another project, or simply has no map.
    agentLoadFailed: 'This version’s agent macros could not be loaded.',
    developerLoadFailed: 'Developer macros could not be loaded.',
    empty: 'This version has no macros yet.',
    developerEmpty: 'No developer macros are registered. They are registered over the MCP connection.',
    developerChip: 'Developer macros',
    developerChipTitle:
      'Every developer macro of the project. The QA engine receives all of them, whichever build it runs. Each one’s build is compared with the current version.',
    emptyFiltered: 'No macro matches these filters.',
    searchPlaceholder: 'Name, parameter, docstring',
    shownOf: (shown: number, total: number) => `${shown} of ${total}`,
    listLabel: 'Macros',
  },
  versions: {
    developer: 'Developer macros (MCP)',
    developerTitle:
      'Macros a developer registered for the project over the MCP connection. The QA engine receives all of them, whichever build it runs.',
  },
  columns: {
    macro: 'Macro',
    docstring: 'Description',
    updated: 'Updated',
  },
  // Shown only on a developer macro written against another build than the
  // current version (the newest non-editor build). Says where that build sits, never whether to use the macro:
  // the engine receives it either way. A newer build, an editor build, and a
  // build whose order is unknown all read `other`.
  relation: {
    older: 'Older version',
    other: 'Other version',
  },
  meta: {
    writtenAgainst: (build: string) => `Written against ${build}`,
    registeredBy: (nickname: string, date: string) => `Registered by ${nickname} · ${date}`,
    registeredAt: (date: string) => `Registered ${date}`,
    version: (version: number) => `v${version}`,
    updatedAt: (date: string) => `Updated ${date}`,
  },
  sheet: {
    label: 'Macro',
    close: 'Close',
    docstring: 'Docstring',
    screens: 'Attached screens',
    noScreens: 'No screen chosen yet',
    noScreensCopy:
      'Nothing has said where this macro runs. That is an open question, not permission to run it anywhere.',
    source: 'Source',
    // The screen never edits a macro, and saying so is cheaper than letting
    // someone hunt for a control that does not exist.
    readOnlyAgent: 'Read-only. A macro is rewritten by the agent, not from this screen.',
    readOnlyDeveloper:
      'Read-only. A developer macro is registered and changed over the MCP connection, not from this screen.',
    sourceEmpty: 'This macro has no source.',
    sourceLoading: 'Loading the source…',
    sourceFailed: 'The source could not be loaded.',
  },
} as const

export const macrosKo: Localized<typeof macrosEn> = {
  section: {
    title: 'Macro 라이브러리',
    subtitle:
      '왼쪽에서 버전을 고르면 QA 에이전트가 그 빌드에 저장한 agent macro 를, 개발자 macro (MCP) 를 고르면 개발자가 MCP 연결로 프로젝트에 등록한 macro 를 봅니다. 이 화면에서는 읽기만 합니다.',
    refresh: '새로고침',
    noBuildsTitle: '이 프로젝트에는 아직 빌드가 없습니다',
    noBuildsCopy: 'SDK 로 빌드를 등록하면, 그 빌드에 저장된 macro 가 여기 나타납니다.',
    loading: 'macro 를 불러오는 중…',
    retry: '다시 시도',
    agentLoadFailed: '이 버전의 agent macro 를 불러오지 못했습니다.',
    developerLoadFailed: '개발자 macro 를 불러오지 못했습니다.',
    empty: '이 버전에는 아직 macro 가 없습니다.',
    developerEmpty: '등록된 개발자 macro 가 없습니다. MCP 연결로 등록됩니다.',
    developerChip: '개발자 macro',
    developerChipTitle:
      '프로젝트의 개발자 macro 전부입니다. QA 엔진은 빌드와 상관없이 전부 받습니다. 각 macro 의 기준 버전은 현재 버전과 비교합니다.',
    emptyFiltered: '이 조건에 맞는 macro 가 없습니다.',
    searchPlaceholder: '이름, parameter, docstring',
    shownOf: (shown: number, total: number) => `${total}개 중 ${shown}개`,
    listLabel: 'Macro 목록',
  },
  versions: {
    developer: '개발자 macro (MCP)',
    developerTitle: '개발자가 MCP 연결로 프로젝트에 등록한 macro. QA 엔진은 빌드와 상관없이 전부 받습니다.',
  },
  columns: {
    macro: 'Macro',
    docstring: '설명',
    updated: '수정',
  },
  relation: {
    older: '이전 버전',
    other: '다른 버전',
  },
  meta: {
    writtenAgainst: (build: string) => `${build} 기준`,
    registeredBy: (nickname: string, date: string) => `${nickname} 등록 · ${date}`,
    registeredAt: (date: string) => `등록 ${date}`,
    version: (version: number) => `v${version}`,
    updatedAt: (date: string) => `수정 ${date}`,
  },
  sheet: {
    label: 'Macro',
    close: '닫기',
    docstring: 'Docstring',
    screens: '달린 screen',
    noScreens: '아직 screen 미정',
    noScreensCopy:
      '이 macro 가 어디서 도는지는 아직 아무도 정하지 않았습니다. 아직 답이 없는 것이지, 아무 데서나 돌려도 된다는 허가가 아닙니다.',
    source: 'Source',
    readOnlyAgent: '읽기 전용입니다. macro 는 에이전트가 다시 쓰고, 이 화면에서는 고치지 않습니다.',
    readOnlyDeveloper:
      '읽기 전용입니다. 개발자 macro 는 MCP 연결로 등록하고 고치며, 이 화면에서는 고치지 않습니다.',
    sourceEmpty: '이 macro 에는 source 가 없습니다.',
    sourceLoading: 'source 를 불러오는 중…',
    sourceFailed: 'source 를 불러오지 못했습니다.',
  },
}
