/**
 * 지도를 처음 받는 동안의 화면 모양. 진짜 화면과 같은 틀(스캔 줄, 왼쪽 tree, 가운데 캔버스)과 같은 class 를 써서
 * 칸의 크기는 진짜 규칙이 정한다. 다 받은 뒤 칸이 움직이지 않는다.
 */
export function ContentMapSkeleton({ treeTitle }: { treeTitle: string }) {
  return (
    <>
      <section aria-hidden="true" className="cm-scan cm-skel">
        <div className="cm-scan-bar">
          {[72, 120, 96, 140, 88].map((width, chip) => (
            <span className="skeleton-line" key={chip} style={{ width }} />
          ))}
        </div>
        <span className="skeleton-line cm-skel-note" />
      </section>

      <div aria-hidden="true" className="cm-workspace cm-skel">
        <aside className="panel cm-tree-pane">
          <div className="cm-tree-panel">
            <h3 className="cm-tree-title">{treeTitle}</h3>
            <ul className="cm-tree">
              {Array.from({ length: 8 }, (_, row) => (
                <li className="cm-skel-tree-row" key={row}>
                  <span className="cm-skel-thumb" />
                  <span className="cm-skel-lines">
                    <span className="skeleton-line" style={{ width: `${45 + ((row * 17) % 35)}%` }} />
                    <span className="skeleton-line skeleton-line--short" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="panel cm-canvas-panel">
          <header className="cm-canvas-head">
            <span className="skeleton-line" style={{ width: 96 }} />
            <span className="skeleton-line" style={{ width: 220 }} />
          </header>
          <div className="cm-canvas-frame cm-skel-canvas">
            {/* 씬 카드 자리. 진짜 지도처럼 왼쪽에서 오른쪽으로 흐르게 놓는다. */}
            {[
              [0, 1],
              [1, 0],
              [1, 2],
              [2, 1],
              [3, 0],
              [3, 2],
              [4, 1],
            ].map(([column, row]) => (
              <span
                className="cm-skel-node"
                key={`${column}-${row}`}
                style={{ left: `${6 + column * 19}%`, top: `${18 + row * 26}%` }}
              />
            ))}
          </div>
          <footer className="cm-canvas-foot">
            <span className="skeleton-line" style={{ width: 280 }} />
          </footer>
        </section>
      </div>
    </>
  )
}
