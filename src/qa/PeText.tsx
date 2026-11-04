import { useContext, type ReactNode } from 'react'
import { PeMacroNames } from './peMacroNames'
import { errorOf, macroName, type PeWordsText } from './peWords'

/** 판정 글을 그리는 부품. 무엇을 어떻게 바꾸는지는 `peWords.ts` 의 머리말에 있다. */
type Text = PeWordsText

/** 매크로 이름 블록. 매크로는 우리 쪽이 붙인 코드 이름이라 글이나 게임 객체와 섞이지 않게 따로 세운다. */
export function MacroName({ name }: { name: string }) {
  return <span className="qa-pe-macro">{macroName(name)}</span>
}

/** 매크로가 아니라 엔진에게 하는 요청인 선택지(`REPLAN`, `EXPAND_STATE`, `none_fits`). 단어장의 말로 그린다. */
const CONTROLS = new Set(['REPLAN', 'EXPAND_STATE', 'none_fits'])

/** 고른 행동 하나: 매크로 블록과, 대상이 있으면 그 게임 객체(`developer:x @ Card(Clone)[22]`). */
export function PickedAction({ picked, text }: { picked: string; text: Text }) {
  const [action, target] = picked.split(' @ ')
  if (CONTROLS.has(action)) return <span className="qa-pe-term">{text.results[action] ?? action}</span>
  return (
    <>
      <MacroName name={action} />
      {target !== undefined && (
        <>
          {' '}
          <code className="qa-pe-code">{target}</code>
        </>
      )}
    </>
  )
}

const TERMS = 'none_fits|effect_unmet|effect_met|unobservable|unobserved|stale_target|precondition_false|already_true|input_rejected'

/**
 * 판정 글 안의 조각: 매크로 표시(`⟦x⟧`, `developer:x`), 멈춤 문구, 백틱 이름, 씬 이름(`…Scene`), 게임 객체 이름
 * (`Name(Clone)[3]`, `Root/Child`, `Type.member`), 엔진 용어. 앞의 것부터 맞춘다. 백틱이 없는 옛 런의 글도 객체 이름은 같은
 * 꼴이라 걸린다.
 */
const PIECE = new RegExp(
  [
    '⟦(\\w+)⟧|\\bdeveloper:(\\w+)(?:#\\d+)?',
    '"?no action (fit|was ready) for ([\\d.]+)s"?',
    '`([^`]+)`',
    '\\b([A-Z]\\w*Scene)\\b',
    '((?:[A-Za-z_][\\w]*(?:\\(Clone\\))?(?:\\[\\d+\\])?/)+[A-Za-z_][\\w]*(?:\\(Clone\\))?(?:\\[\\d+\\])?|[A-Za-z_][\\w]*\\(Clone\\)(?:\\[\\d+\\])?|\\b[A-Z][a-zA-Z]+\\.[a-zA-Z_][\\w.]*\\b|\\b[A-Z]\\w*\\[\\d+\\])',
    `\\b(${TERMS})\\b`,
  ].join('|'),
  'g',
)

/** 표시가 없는 글에서 이 런의 매크로 이름을 찾아 블록으로 바꾼다. */
function withMacros(value: string, names: ReadonlySet<string>, key: string): ReactNode[] {
  if (names.size === 0) return [value]
  const pattern = new RegExp(`\\b(${[...names].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')
  const pieces: ReactNode[] = []
  let at = 0
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > at) pieces.push(value.slice(at, start))
    pieces.push(<MacroName key={`${key}-${start}`} name={match[1]} />)
    at = start + match[0].length
  }
  if (at < value.length) pieces.push(value.slice(at))
  return pieces
}

/** 판정 이유·인사이트 같은 글 하나. 코드 이름은 code 로, 씬은 씬 표시로, 매크로는 매크로 블록으로, 엔진 용어는 단어장의 말로. */
export function PeText({ value, text }: { value: string; text: Text }) {
  const names = useContext(PeMacroNames)
  const pieces: ReactNode[] = []
  let at = 0
  for (const match of value.matchAll(PIECE)) {
    const start = match.index ?? 0
    if (start > at) pieces.push(...withMacros(value.slice(at, start), names, `t${at}`))
    const [whole, token, developer, stop, seconds, quoted, scene, object, bare] = match
    const key = `${start}`
    // 백틱 안에 든 엔진 용어·매크로 이름도 그것으로 본다.
    const term = bare ?? (quoted !== undefined && new RegExp(`^(?:${TERMS})$`).test(quoted) ? quoted : undefined)
    const macro = token ?? developer ?? (quoted !== undefined && names.has(macroName(quoted)) ? quoted : undefined)
    if (macro !== undefined) pieces.push(<MacroName key={key} name={macro} />)
    else if (stop !== undefined) pieces.push(<span className="qa-pe-term" key={key}>{text.stop.inline(stop === 'fit', seconds)}</span>)
    else if (term !== undefined) pieces.push(<span className="qa-pe-term" key={key}>{text.results[term] ?? term}</span>)
    else if (scene !== undefined || (quoted !== undefined && /Scene$/.test(quoted)))
      pieces.push(<span className="qa-pe-scene" key={key}>{scene ?? quoted}</span>)
    else pieces.push(<code className="qa-pe-code" key={key}>{quoted ?? object ?? whole}</code>)
    at = start + whole.length
  }
  if (at < value.length) pieces.push(...withMacros(value.slice(at), names, `t${at}`))
  return <>{pieces}</>
}

/** 엔진 오류는 태그로, 나머지는 `PeText` 로. */
export function PeMessage({ value, text }: { value: string; text: Text }) {
  const error = errorOf(value)
  if (error === null) return <PeText text={text} value={value} />
  return (
    <span className="qa-pe-error">
      <span className="qa-pe-error-tag" title={error.tag}>{text.errorTag}</span>
      <span className="qa-pe-error-text">{error.rest}</span>
    </span>
  )
}
