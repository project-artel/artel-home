import { arrowMid, arrowPath, BOX_HANDLES, boxOf } from './annotationGeometry'
import type { RunMapAnnotation } from './runMapApi'

type TextProps = {
  editing: string | null
  onEditText: (id: string, text: string) => void
}

/** 글을 고치는 칸. 고치는 동안만 contentEditable 이고, 벗어나면 [onEditText] 로 넘긴다. */
function EditableText({ id, text, className, editing, onEditText, children }: TextProps & { id: string; text: string; className: string; children?: React.ReactNode }) {
  const isEditing = editing === id
  return (
    <div
      className={className + (isEditing ? ' is-editing' : '')}
      contentEditable={isEditing}
      data-annotation={id}
      key={id + (isEditing ? ':edit' : '')}
      onBlur={(event) => isEditing && onEditText(id, event.currentTarget.innerText.trim())}
      ref={(node) => {
        if (node && isEditing && document.activeElement !== node) {
          node.focus()
          document.getSelection()?.selectAllChildren(node)
        }
      }}
      suppressContentEditableWarning
    >
      {text}
      {!isEditing && children}
    </div>
  )
}

/**
 * 묶음 상자(ARTEL-1245). TS 프레임 밑에 깐다. 왼쪽 위 라벨이 이름이고, 상자를 옮기면 안에 든 것이 함께 옮겨진다.
 */
export function RunMapSections({ annotations, selected, ...text }: TextProps & { annotations: readonly RunMapAnnotation[]; selected: string | null }) {
  return (
    <>
      {annotations.map((a) => {
        if (a.type !== 'section') return null
        return (
          <div className={'rma-section' + (selected === a.id ? ' is-selected' : '')} data-annotation={a.id} key={a.id} style={{ left: a.x, top: a.y, width: a.w, height: a.h }}>
            <EditableText {...text} className="rma-section-label" id={a.id} text={a.text ?? ''} />
          </div>
        )
      })}
    </>
  )
}

/**
 * 맵 위 주석(ARTEL-1245). 도형 · 화살표 · 그림은 한 SVG 에, 메모 · 글과 도형 안의 글은 고칠 수 있게 HTML 로 그린다.
 * TS 프레임 위에 얹는다. 주석은 프레임을 가리키려고 붙이는 것이라 프레임 밑에 깔리면 쓸모가 없다.
 */
export function RunMapAnnotations({
  annotations,
  selected,
  authors,
  k,
  ...text
}: TextProps & {
  annotations: readonly RunMapAnnotation[]
  selected: string | null
  authors: Record<string, string>
  k: number
}) {
  const sel = (id: string) => (selected === id ? ' is-selected' : '')
  return (
    <>
      <svg aria-hidden="true" className="rma-svg" height="1" width="1">
        <defs>
          <marker id="rma-ah" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4" viewBox="0 0 8 8">
            <path className="rma-arrowhead" d="M0 0 L8 4 L0 8 z" />
          </marker>
          <marker id="rma-ah-sel" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4" viewBox="0 0 8 8">
            <path className="rma-arrowhead is-selected" d="M0 0 L8 4 L0 8 z" />
          </marker>
        </defs>
        {annotations.map((a) => {
          if (a.type === 'rect') return <rect className={'rma-shape' + sel(a.id)} data-annotation={a.id} height={a.h} key={a.id} rx={10} width={a.w} x={a.x} y={a.y} />
          if (a.type === 'ellipse') return <ellipse className={'rma-shape' + sel(a.id)} cx={a.x + a.w / 2} cy={a.y + a.h / 2} data-annotation={a.id} key={a.id} rx={a.w / 2} ry={a.h / 2} />
          // 선은 가늘어 맞히기 어렵다. 보이지 않는 굵은 선을 함께 깔아 그쪽으로 누르게 한다.
          if (a.type === 'arrow') {
            const d = arrowPath(a)
            return (
              <g key={a.id}>
                <path className="rma-hit" d={d} data-annotation={a.id} />
                <path className={'rma-arrow' + sel(a.id)} d={d} data-annotation={a.id} markerEnd={selected === a.id ? 'url(#rma-ah-sel)' : 'url(#rma-ah)'} />
              </g>
            )
          }
          if (a.type === 'pen') {
            const d = a.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
            return (
              <g key={a.id}>
                <path className="rma-hit" d={d} data-annotation={a.id} />
                <path className={'rma-pen' + sel(a.id)} d={d} data-annotation={a.id} />
              </g>
            )
          }
          return null
        })}
      </svg>
      {annotations.map((a) => {
        if (a.type === 'rect' || a.type === 'ellipse') {
          // 도형 안의 글. 비어 있으면 고칠 때만 칸을 띄운다.
          if ((a.text ?? '') === '' && text.editing !== a.id) return null
          return (
            <div className="rma-inner" key={a.id + ':text'} style={{ left: a.x, top: a.y, width: a.w, height: a.h }}>
              <EditableText {...text} className="rma-inner-text" id={a.id} text={a.text ?? ''} />
            </div>
          )
        }
        if (a.type !== 'note' && a.type !== 'text') return null
        const by = a.createdBy ? authors[a.createdBy] : undefined
        return (
          <div className="rma-place" key={a.id} style={{ left: a.x, top: a.y, width: a.w, height: a.h }}>
            <EditableText {...text} className={(a.type === 'note' ? `rma-note rma-note--${a.color}` : 'rma-text') + (a.w !== undefined ? ' is-sized' : '') + sel(a.id)} id={a.id} text={a.text}>
              {a.type === 'note' && by !== undefined && <span className="rma-by" contentEditable={false}>{by}</span>}
            </EditableText>
            {selected === a.id && text.editing !== a.id && <SelectionHandles id={a.id} k={k} />}
          </div>
        )
      })}
    </>
  )
}

/**
 * 고른 주석의 영역 테두리와 여덟 손잡이. 자기를 둘러싼 상자 안에 % 로 놓는다. 그래서 크기를 정하지 않은 메모 · 글도
 * 그려진 크기 그대로 테두리가 맞는다. 손잡이는 확대 배율과 상관없이 화면에서 같은 크기로 보이게 [k] 로 나눈다.
 */
export function SelectionHandles({ id, k }: { id: string; k: number }) {
  const size = 9 / k
  const at: Record<(typeof BOX_HANDLES)[number], [number, number]> = {
    nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50],
  }
  return (
    <span className="rma-sel" data-selection={id}>
      <span className="rma-sel-box" style={{ borderWidth: 1.5 / k }} />
      {BOX_HANDLES.map((name) => (
        <span
          className={'rma-h rma-h--' + name}
          data-handle={name}
          key={name}
          style={{ left: `calc(${at[name][0]}% - ${size / 2}px)`, top: `calc(${at[name][1]}% - ${size / 2}px)`, width: size, height: size, borderWidth: 1.5 / k }}
        />
      ))}
    </span>
  )
}

/**
 * 고른 도형 · 그림 · 묶음 상자 · 화살표의 손잡이. 화살표는 시작 · 끝 · 가운데(휘기) 셋, 나머지는 영역 테두리와 여덟.
 * 메모 · 글은 [RunMapAnnotations] 가 자기 자리 안에 [SelectionHandles] 를 그린다.
 */
export function SelectionBox({ annotation, k }: { annotation: RunMapAnnotation; k: number }) {
  if (annotation.type === 'note' || annotation.type === 'text') return null
  if (annotation.type === 'arrow') {
    const size = 11 / k
    const mid = arrowMid(annotation)
    const dot = (name: string, x: number, y: number) => (
      <span className={'rma-h is-round rma-h--' + name} data-handle={name} key={name} style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, borderWidth: 1.5 / k }} />
    )
    return (
      <div className="rma-sel-layer" data-selection={annotation.id}>
        {dot('p1', annotation.x1, annotation.y1)}
        {dot('p2', annotation.x2, annotation.y2)}
        {dot('c', mid.x, mid.y)}
      </div>
    )
  }
  const box = boxOf(annotation)
  return (
    <div className="rma-sel-layer">
      <span className="rma-sel-place" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
        <SelectionHandles id={annotation.id} k={k} />
      </span>
    </div>
  )
}
