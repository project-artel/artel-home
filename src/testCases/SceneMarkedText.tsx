import { codePieces } from '../contentMap/codePieces'
import { splitScenes } from './sceneHighlight'

/**
 * 백틱 조각은 `<code>` 칩으로, 씬 이름은 강조로 그린 글(ARTEL-1313). 케이스 라이브러리의 스텝 글에 쓴다 —
 * 시나리오 편집기가 스텝 글 속 씬 이름을 세우는 것과 같은 규칙이다.
 */
export function SceneMarkedText({ text, pattern, codeClassName }: { text: string; pattern: RegExp | null; codeClassName: string }) {
  return (
    <>
      {codePieces(text).map((piece, index) =>
        piece.code ? (
          <code className={codeClassName} key={index} translate="no">{piece.text}</code>
        ) : (
          splitScenes(piece.text, pattern).map((part, inner) =>
            inner % 2 === 1 ? <span className="tct-scene-ref" key={`${index}-${inner}`}>{part}</span> : <span key={`${index}-${inner}`}>{part}</span>,
          )
        ),
      )}
    </>
  )
}
