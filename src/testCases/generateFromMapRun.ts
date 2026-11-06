import type { GeneratedTestCases } from '../contentMap/generateContentMapTestCases'
import { candidateOutcome, type GenerationCandidate } from './generationCandidates'

/*
 * 케이스 라이브러리의 "지도에서 TC 생성" 대화상자가 하는 일을, 대화상자를 열지 않고 하는 길.
 * project agent 가 쓴다. 고를 수 있는 빌드인지 판단하는 기준은 대화상자의 `candidateOutcome` 과 같다.
 */

export type GenerateFromMapMessages = {
  /** 이 빌드에서는 만들 수 없다는 이유. 대화상자의 `failure` 문구와 같다. */
  notReady: string
  buildMissing: string
}

export type GenerateFromMapDependencies = {
  listCandidates: () => Promise<GenerationCandidate[]>
  generate: (candidate: GenerationCandidate, overwrite: boolean) => Promise<GeneratedTestCases>
  messages: GenerateFromMapMessages
}

/**
 * `overwrite` 가 false 면 아직 TC 를 만들지 않은 빌드에만 쓰고, true 면 이미 만든 빌드를 덮어쓴다.
 * 맞지 않는 빌드면 서버를 부르지 않고 던진다.
 */
export async function runGenerateFromMap(
  gameBuildId: string,
  overwrite: boolean,
  dependencies: GenerateFromMapDependencies,
): Promise<{ candidate: GenerationCandidate; result: GeneratedTestCases }> {
  const candidates = await dependencies.listCandidates()
  const candidate = candidates.find((one) => one.gameBuildId === gameBuildId)
  if (candidate === undefined) throw new Error(dependencies.messages.buildMissing)
  const outcome = candidateOutcome(candidate)
  if (outcome === 'noMap' || outcome === 'notRead' || outcome === 'alreadyGenerated') {
    throw new Error(dependencies.messages.notReady)
  }
  if (overwrite && outcome === 'create') {
    throw new Error(`Build ${candidate.version} has no generated test cases yet, so there is nothing to overwrite. Use testCases.generate.`)
  }
  if (!overwrite && outcome === 'overwrite') {
    throw new Error(`Build ${candidate.version} already has generated test cases. Use testCases.overwriteGenerated to replace them.`)
  }
  const result = await dependencies.generate(candidate, overwrite)
  return { candidate, result }
}
