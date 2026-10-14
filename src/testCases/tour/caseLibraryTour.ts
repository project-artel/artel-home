import type { Messages } from '../../i18n/messages'
import type { TourStep } from './CoachTour'

/** 이 튜토리얼의 이름. 본 기록의 열쇠에 쓴다. */
export const CASE_LIBRARY_TOUR = 'caseLibrary'

/**
 * 케이스 라이브러리 튜토리얼의 단계(ARTEL-1033). 순서는 화면을 왼쪽 위에서 오른쪽 아래로 훑는 순서다 — 버전을 고르고,
 * 폴더로 모으고, 표를 거르고 읽고, 새로 만든다. 대상은 각 요소의 `data-tour` 다. 그 자리가 화면에 없으면(예: 폴더 안을
 * 보는 중이라 비교 상자가 없을 때) 말풍선만 가운데에 뜬다.
 */
export function caseLibraryTourSteps(t: Messages): TourStep[] {
  const m = t.testCases.tour.steps
  const step = (id: keyof typeof m, target?: string): TourStep => ({
    id,
    target: target === undefined ? undefined : `[data-tour="${target}"]`,
    title: m[id].title,
    body: m[id].body,
  })
  return [
    step('welcome'),
    step('versions', 'versions'),
    step('versionTools', 'version-head'),
    step('importManual', 'latest-version'),
    step('unversioned', 'unversioned'),
    step('folders', 'folders'),
    step('folderTools', 'folder-actions'),
    step('collapse', 'collapse'),
    step('search', 'search'),
    step('compare', 'compare'),
    step('chips', 'chips'),
    step('table', 'table'),
    step('generateFromMap', 'generate-from-map'),
    step('newCase', 'new-case'),
    step('help', 'help'),
  ]
}
