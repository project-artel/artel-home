/**
 * 표를 받는 동안 그 자리에 놓는 빈 줄. 진짜 표와 같은 칸 · 같은 줄 높이를 써서, 다 받은 뒤 화면이 밀리지 않는다.
 * 줄마다 막대 길이를 조금씩 달리해 글이 들어갈 자리처럼 보이게 한다.
 */
export function CaseSkeletonRows({ columns, count = 14 }: { columns: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, row) => (
        <tr aria-hidden="true" className="tct-skel" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              {column > 0 && <span className="skeleton-line" style={{ width: `${widthOf(row, column)}%` }} />}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** 화면을 처음 열 때, 버전 목록도 아직 없을 때 쓰는 표 모양 전체. */
export function CaseTableSkeleton({ label }: { label: string }) {
  return (
    <section aria-busy="true" className="panel tcl-skeleton">
      <p className="visually-hidden" role="status">{label}</p>
      <table className="tcl-table">
        <tbody>
          <CaseSkeletonRows columns={7} />
        </tbody>
      </table>
    </section>
  )
}

// 첫 칸(단계)은 길게, 나머지는 짧게. 같은 줄이 반복돼 보이지 않도록 줄 번호로 흔든다.
function widthOf(row: number, column: number): number {
  const base = column === 1 ? 70 : 45
  return base + ((row * 7 + column * 13) % 30)
}
