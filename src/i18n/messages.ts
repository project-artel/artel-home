import { discussionsEn, discussionsKo } from './messages/discussions'
import { accountEn, accountKo } from './messages/account'
import { adminEn, adminKo } from './messages/admin'
import { adminGraphEn, adminGraphKo } from './messages/adminGraph'
import { adminKnowledgeEn, adminKnowledgeKo } from './messages/adminKnowledge'
import { adminLabelsEn, adminLabelsKo } from './messages/adminLabels'
import { adminQaEn, adminQaKo } from './messages/adminQa'
import { adminSettingsEn, adminSettingsKo } from './messages/adminSettings'
import { adminUsageEn, adminUsageKo } from './messages/adminUsage'
import { commonEn, commonKo } from './messages/common'
import { contentMapEn, contentMapKo } from './messages/contentMap'
import { gameBuildsEn, gameBuildsKo } from './messages/gameBuilds'
import { gameFunctionsEn, gameFunctionsKo } from './messages/gameFunctions'
import { issuesEn, issuesKo } from './messages/issues'
import { knowledgeEn, knowledgeKo } from './messages/knowledge'
import { macrosEn, macrosKo } from './messages/macros'
import { performanceEn, performanceKo } from './messages/performance'
import { projectAgentEn, projectAgentKo } from './messages/projectAgent'
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
    admin: adminEn,
    adminGraph: adminGraphEn,
    adminKnowledge: adminKnowledgeEn,
    adminLabels: adminLabelsEn,
    adminQa: adminQaEn,
    adminSettings: adminSettingsEn,
    adminUsage: adminUsageEn,
    common: commonEn,
    contentMap: contentMapEn,
    gameBuilds: gameBuildsEn,
    gameFunctions: gameFunctionsEn,
    issues: issuesEn,
    discussions: discussionsEn,
    knowledge: knowledgeEn,
    macros: macrosEn,
    performance: performanceEn,
    projectAgent: projectAgentEn,
    projects: projectsEn,
    qa: qaEn,
    scenarios: scenariosEn,
    testCases: testCasesEn,
    tracker: trackerEn,
    usage: usageEn,
  },
  ko: {
    account: accountKo,
    admin: adminKo,
    adminGraph: adminGraphKo,
    adminKnowledge: adminKnowledgeKo,
    adminLabels: adminLabelsKo,
    adminQa: adminQaKo,
    adminSettings: adminSettingsKo,
    adminUsage: adminUsageKo,
    common: commonKo,
    contentMap: contentMapKo,
    gameBuilds: gameBuildsKo,
    gameFunctions: gameFunctionsKo,
    issues: issuesKo,
    discussions: discussionsKo,
    knowledge: knowledgeKo,
    macros: macrosKo,
    performance: performanceKo,
    projectAgent: projectAgentKo,
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
