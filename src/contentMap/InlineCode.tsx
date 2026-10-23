import { codePieces } from './codePieces'

/** 백틱 조각을 `<code>` 칩으로 그린 글(ARTEL-1172). */
export function InlineCode({ text }: { text: string }) {
  return (
    <>
      {codePieces(text).map((piece, index) =>
        piece.code ? (
          <code className="cm-code" key={index}>
            {piece.text}
          </code>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </>
  )
}
