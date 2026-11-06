/**
 * 서버 문장 속 백틱 조각(ARTEL-1172). `Canvas/continue` 클릭 → `Cards.BackToMain()` 같은 단계 요약 · 조건 · capability
 * 요약은 코드 이름이 글 사이에 섞여 와서, 그대로 두면 어디가 이름인지 안 읽혔다. 짝이 맞는 백틱 사이만 코드로 가르고
 * 나머지는 글 그대로 둔다 — `*` · `[` 같은 마크다운 기호는 조건 식에 그냥 나오므로 해석하지 않는다. 짝이 없는 마지막
 * 백틱은 글자로 남긴다.
 */
export type TextPiece = { code: boolean; text: string }

export function codePieces(text: string): TextPiece[] {
  const pieces: TextPiece[] = []
  let at = 0
  while (at < text.length) {
    const open = text.indexOf('`', at)
    const close = open === -1 ? -1 : text.indexOf('`', open + 1)
    if (open === -1 || close === -1) {
      pieces.push({ code: false, text: text.slice(at) })
      break
    }
    if (open > at) pieces.push({ code: false, text: text.slice(at, open) })
    if (close > open + 1) pieces.push({ code: true, text: text.slice(open + 1, close) })
    at = close + 1
  }
  return pieces
}
