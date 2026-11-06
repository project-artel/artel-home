import type { GameIdentity } from '../gameIdentityApi'
import type { GlossaryTerm } from '../../testCases/glossaryApi'

export type StateFilter = 'all' | 'issues' | 'linked' | 'unlinked'

/** 이 이름에 이은 게임 변수가 고른 빌드에 있나(ARTEL-1396). 이름이 다르면 그 빌드에는 없는 것이다. */
export function linkOf(term: GlossaryTerm, variables: readonly GameIdentity[]): { kind: 'none' } | { kind: 'found'; variable: GameIdentity } | { kind: 'missing'; name: string } {
  if (term.gameVariable === null) return { kind: 'none' }
  const variable = variables.find((item) => item.name === term.gameVariable && !item.deleted)
  return variable === undefined ? { kind: 'missing', name: term.gameVariable } : { kind: 'found', variable }
}
