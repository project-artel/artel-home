import { commonEn, commonKo } from './messages/common'
import { issuesEn, issuesKo } from './messages/issues'
import { knowledgeEn, knowledgeKo } from './messages/knowledge'
import { performanceEn, performanceKo } from './messages/performance'
import { projectsEn, projectsKo } from './messages/projects'
import { qaEn, qaKo } from './messages/qa'
import { scenariosEn, scenariosKo } from './messages/scenarios'

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
    common: commonEn,
    issues: issuesEn,
    knowledge: knowledgeEn,
    performance: performanceEn,
    projects: projectsEn,
    qa: qaEn,
    scenarios: scenariosEn,
  },
  ko: {
    common: commonKo,
    issues: issuesKo,
    knowledge: knowledgeKo,
    performance: performanceKo,
    projects: projectsKo,
    qa: qaKo,
    scenarios: scenariosKo,
  },
}

/**
 * What `useI18n().t` exposes. Widened via `Localized` so the value can be
 * either locale's dictionary, not just the English literals.
 */
export type Messages = Localized<(typeof messages)['en']>
