import { useI18n } from '../i18n/useI18n'
import { edgeSourceStyle, type EdgeSourceStyle } from './contentMapTypes'
import type { SceneGraphModel } from './sceneGraphLayout'
import { sceneKind, type SceneKind } from './sceneLabels'

/**
 * 마크가 무슨 뜻인지.
 *
 * 화면에 실제로 있는 것만 적는다 — 이 빌드에 한 번도 나온 적 없는 출처를
 * 설명하는 범례는 없는 것을 찾게 만든다. 모든 줄이 패턴을 그리는 동시에
 * 말로도 부르므로, 색을 구분하지 못해도 범례가 그대로 작동한다.
 */
export function SceneGraphLegend({ model }: { model: SceneGraphModel }) {
  const { t } = useI18n()
  const copy = t.contentMap.graph

  // 스타일별로 한 줄이지만 서버가 쓴 원래 이름은 남겨 둔다. 처음 보는 출처가
  // "알 수 없음" 세 줄로 겹쳐 나오는 대신 서버가 쓴 철자로 나온다.
  const bySource = new Map<EdgeSourceStyle, Set<string>>()
  for (const edge of model.edges) {
    const style = edgeSourceStyle(edge.transition.source)
    const names = bySource.get(style)
    if (names === undefined) bySource.set(style, new Set([edge.transition.source]))
    else names.add(edge.transition.source)
  }

  const kinds = new Set<SceneKind>(model.nodes.map(sceneKind))

  return (
    <div className="cm-legend">
      {bySource.size > 0 && (
        <section className="cm-legend-group">
          <h3>{copy.legendSourceTitle}</h3>
          <ul>
            {[...bySource.entries()].map(([style, names]) => (
              <li key={style}>
                <svg aria-hidden="true" className="cm-legend-line" viewBox="0 0 44 12">
                  <path className={`cm-edge-line cm-edge--${style}`} d="M 2 6 L 42 6" />
                </svg>
                <span className="cm-legend-name">
                  {style === 'unknown'
                    ? [...names].filter((name) => name.length > 0).sort().join(' · ') ||
                      copy.sources.unknown
                    : copy.sources[style]}
                </span>
                <span className="cm-legend-shape">{copy.sourceShapes[style]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {kinds.size > 0 && (
        <section className="cm-legend-group">
          <h3>{copy.legendSceneTitle}</h3>
          <ul>
            {(['walked', 'notWalked', 'unmapped'] as const)
              .filter((kind) => kinds.has(kind))
              .map((kind) => (
                <li key={kind}>
                  <svg aria-hidden="true" className="cm-legend-line" viewBox="0 0 44 12">
                    {kind === 'walked' && (
                      <circle className="cm-legend-mark cm-legend-mark--walked" cx="22" cy="6" r="5" />
                    )}
                    {kind === 'notWalked' && (
                      <rect
                        className="cm-legend-mark cm-legend-mark--notWalked"
                        height="9"
                        rx="1"
                        width="9"
                        x="17.5"
                        y="1.5"
                      />
                    )}
                    {kind === 'unmapped' && (
                      <rect
                        className="cm-legend-mark cm-legend-mark--unmapped"
                        height="8"
                        transform="rotate(45 22 6)"
                        width="8"
                        x="18"
                        y="2"
                      />
                    )}
                  </svg>
                  <span className="cm-legend-name">{copy.sceneKinds[kind]}</span>
                  <span className="cm-legend-shape">{copy.sceneShapes[kind]}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}
