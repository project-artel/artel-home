import { commonEn, commonKo } from './messages/common'
import { projectsEn, projectsKo } from './messages/projects'
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
  en: { common: commonEn, projects: projectsEn, scenarios: scenariosEn },
  ko: { common: commonKo, projects: projectsKo, scenarios: scenariosKo },
}

/**
 * What `useI18n().t` exposes. Widened via `Localized` so the value can be
 * either locale's dictionary, not just the English literals.
 */
export type Messages = Localized<(typeof messages)['en']>
