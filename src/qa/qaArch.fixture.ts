import type { QaArchAxis } from './qaArch'

// 이전 Home에서 저장한 값과 label의 호환성을 확인하는 서버 응답 fixture.
const base = { engines: ['agent'], description: { ko: '서버 설정 설명', en: 'Server option' } } as const
export const axes: QaArchAxis[] = [
  { ...base, key: 'phase_cycle', kind: 'choice', labelCode: 'a', values: ['off', 'in_verdict', 'lite', 'full'] },
  { ...base, key: 'skills', kind: 'choice', labelCode: 'b', values: ['off', 'on_demand'] },
  { ...base, key: 'macros', kind: 'choice', labelCode: 'c', values: ['off', 'on'] },
  { ...base, key: 'screen_capture', kind: 'choice', labelCode: 'd', values: ['on_demand', 'every_call', 'by_role'], visionOnlyValues: ['every_call', 'by_role'] },
  { ...base, key: 'vision', kind: 'choice', labelCode: 'e', values: ['auto', 'on', 'off'], visionOnlyValues: ['on'] },
  ...['pulse_relevance', 'report_step_view', 'fold_stale_scenes', 'fold_stale_knowledge', 'fold_stale_skills', 'fold_stale_macro_results'].map(
    (key, index) => ({ ...base, key, kind: 'toggle' as const, labelCode: 'fghijk'[index] })),
  { ...base, key: 'fold_threshold_chars', kind: 'number', labelCode: 'l', min: 0, max: 10_000_000 },
  { ...base, key: 'compaction', kind: 'toggle', labelCode: 'm' },
  { ...base, key: 'code_mode', kind: 'toggle', labelCode: 'n' },
]
