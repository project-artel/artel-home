import type { useI18n } from '../i18n/useI18n'

/** PE 엔진의 글을 그릴 때 쓰는 단어장. */
export type PeWordsText = ReturnType<typeof useI18n>['t']['qa']['run']['pe']

/** 매크로 이름: `developer:` 와 같은 매크로를 두 번 고른 표시(`#2`)를 뗀다. 이름 자체는 코드가 붙인 그대로다. */
export function macroName(name: string): string {
  return name.replace(/^developer:/, '').replace(/#\d+$/, '')
}

/** `EVALUATOR-ERROR: …`, `JEV-ERROR: …` 처럼 엔진이 낸 오류. 태그와 나머지 글로 가른다. */
export function errorOf(text: string): { tag: string; rest: string } | null {
  const match = /^([A-Z][A-Z]*(?:[-_][A-Z]+)*[-_]ERROR):\s*/.exec(text)
  return match === null ? null : { tag: match[1], rest: text.slice(match[0].length) }
}

/** 판정 이유 끝에 엔진이 붙이는 멈춤 사유. 멈춘 이유는 따로 보이므로 판정 이유에서는 뗀다. */
export function withoutStopNote(reason: string): string {
  return reason.replace(/\s*\(executer (?:중단|stopped): .*\)\s*$/s, '')
}
