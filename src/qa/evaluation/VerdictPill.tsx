import type { ReviewDecision } from './evaluationApi'
import { evaluationCopy } from './evaluationCopy'

type Copy = (typeof evaluationCopy)['ko']

/** 판정 하나를 색 점이 붙은 pill 로 그린다. null 은 아직 검증 중(agent)이거나 미검토(사람)다. */
export function VerdictPill({ verdict, copy, empty }: { verdict: ReviewDecision | null; copy: Copy; empty: 'running' | 'unreviewed' }) {
  if (verdict === null) return <span className={`qe-pill ${empty === 'running' ? 'qe-pill--running' : 'qe-pill--none'}`}>{copy[empty]}</span>
  return <span className={`qe-pill qe-pill--${verdict}`}><i aria-hidden="true" />{copy[verdict]}</span>
}
