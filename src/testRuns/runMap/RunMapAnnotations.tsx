import type { RunMapAnnotation } from './runMapApi'

/**
 * 맵 위 주석(ARTEL-1245). 도형 · 화살표 · 그림은 한 SVG 에, 메모 · 글은 글을 고칠 수 있게 HTML 로 그린다.
 * TS 프레임 위에 얹는다. 주석은 프레임을 가리키려고 붙이는 것이라 프레임 밑에 깔리면 쓸모가 없다.
 */
export function RunMapAnnotations({
  annotations,
  selected,
  editing,
  authors,
  onEditText,
}: {
  annotations: readonly RunMapAnnotation[]
  selected: string | null
  editing: string | null
  authors: Record<string, string>
  onEditText: (id: string, text: string) => void
}) {
  const sel = (id: string) => (selected === id ? ' is-selected' : '')
  return (
    <>
      <svg aria-hidden="true" className="rma-svg" height="1" width="1">
        <defs>
          <marker id="rma-ah" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4" viewBox="0 0 8 8">
            <path className="rma-arrowhead" d="M0 0 L8 4 L0 8 z" />
          </marker>
        </defs>
        {annotations.map((a) => {
          if (a.type === 'rect') return <rect className={'rma-shape' + sel(a.id)} data-annotation={a.id} height={a.h} key={a.id} rx={10} width={a.w} x={a.x} y={a.y} />
          if (a.type === 'ellipse') return <ellipse className={'rma-shape' + sel(a.id)} cx={a.x + a.w / 2} cy={a.y + a.h / 2} data-annotation={a.id} key={a.id} rx={a.w / 2} ry={a.h / 2} />
          if (a.type === 'arrow') return <path className={'rma-arrow' + sel(a.id)} d={`M ${a.x1} ${a.y1} L ${a.x2} ${a.y2}`} data-annotation={a.id} key={a.id} markerEnd="url(#rma-ah)" />
          if (a.type === 'pen') return <path className={'rma-pen' + sel(a.id)} d={a.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} data-annotation={a.id} key={a.id} />
          return null
        })}
      </svg>
      {annotations.map((a) => {
        if (a.type !== 'note' && a.type !== 'text') return null
        const isEditing = editing === a.id
        const by = a.createdBy ? authors[a.createdBy] : undefined
        return (
          <div
            className={(a.type === 'note' ? `rma-note rma-note--${a.color}` : 'rma-text') + sel(a.id)}
            contentEditable={isEditing}
            data-annotation={a.id}
            key={a.id + (isEditing ? ':edit' : '')}
            onBlur={(event) => isEditing && onEditText(a.id, event.currentTarget.innerText.trim())}
            ref={(node) => {
              if (node && isEditing && document.activeElement !== node) {
                node.focus()
                document.getSelection()?.selectAllChildren(node)
              }
            }}
            style={{ left: a.x, top: a.y }}
            suppressContentEditableWarning
          >
            {a.text}
            {a.type === 'note' && !isEditing && by !== undefined && <span className="rma-by" contentEditable={false}>{by}</span>}
          </div>
        )
      })}
    </>
  )
}
