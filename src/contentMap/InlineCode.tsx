import { codePieces } from './codePieces'

/**
 * 백틱 조각을 `<code>` 칩으로 그린 글(ARTEL-1172). 칩 모양은 화면마다 다르게 줄 수 있다.
 *
 * @property className 칩의 class. 케이스 라이브러리 표는 시나리오 편집기와 같은 칩을 쓴다
 */
export function InlineCode({ text, className = 'cm-code' }: { text: string; className?: string }) {
  return (
    <>
      {codePieces(text).map((piece, index) =>
        piece.code ? (
          <code className={className} key={index} translate="no">
            {piece.text}
          </code>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </>
  )
}
