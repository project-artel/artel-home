import { accountEn, accountKo } from './messages/account'
import { commonEn, commonKo } from './messages/common'
import { contentMapEn, contentMapKo } from './messages/contentMap'
import { issuesEn, issuesKo } from './messages/issues'
import { knowledgeEn, knowledgeKo } from './messages/knowledge'
import { performanceEn, performanceKo } from './messages/performance'
import { projectsEn, projectsKo } from './messages/projects'
import { qaEn, qaKo } from './messages/qa'
import { scenariosEn, scenariosKo } from './messages/scenarios'
import { testCasesEn, testCasesKo } from './messages/testCases'
import { trackerEn, trackerKo } from './messages/tracker'
import { usageEn, usageKo } from './messages/usage'

/**
 * Maps an English dictionary shape to the type a translation must satisfy:
 * same keys, but literal string types widen so the Korean text can differ.
 */
export type Localized<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : T[K] extends string
      ? string
      : Localized<T[K]>
}

export const messages = {
  en: {
    account: accountEn,
    common: commonEn,
    contentMap: contentMapEn,
    issues: issuesEn,
    knowledge: knowledgeEn,
    performance: performanceEn,
    projects: projectsEn,
    qa: qaEn,
    scenarios: scenariosEn,
    testCases: testCasesEn,
    tracker: trackerEn,
    usage: usageEn,
  },
  ko: {
    account: accountKo,
    common: commonKo,
    contentMap: contentMapKo,
    issues: issuesKo,
    knowledge: knowledgeKo,
    performance: performanceKo,
    projects: projectsKo,
    qa: qaKo,
    scenarios: scenariosKo,
    testCases: testCasesKo,
    tracker: trackerKo,
    usage: usageKo,
  },
}

/**
 * What `useI18n().t` exposes. Widened via `Localized` so the value can be
 * either locale's dictionary, not just the English literals.
 */
export type Messages = Localized<(typeof messages)['en']>
