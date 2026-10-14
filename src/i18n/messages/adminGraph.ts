import type { Localized } from '../messages'

/** Strings for `src/admin/graph/*`, the admin graph screen. See `common.ts` for the typing convention. */
export const adminGraphEn = {
  toolbar: {
    nodeLimitLabel: 'Node limit',
    nodeLimitOption: (count: string) => `${count} nodes`,
  },
  noProjects: 'There are no projects on this installation, so there is no knowledge graph to draw.',
  graph: {
    title: 'Knowledge relation graph',
    note: 'Line pattern is the relation, shape is the source. Pick a node or a line to read its evidence on the right.',
  },
  /** Formatted count of edges the parser removed because an endpoint is missing from the response. */
  droppedEdges: (count: string) =>
    `${count} relation(s) could not be drawn because one of their two items is not in the response.`,
  relations: {
    title: 'Relation list',
    note: 'The same relations as the drawing, selectable without the drawing. The note is the only evidence for a relation.',
    columns: {
      relation: 'Relation',
      from: 'From item',
      to: 'To item',
      note: 'Note',
    },
    itself: 'Itself',
    unknownItem: (id: string) => `Item ${id}`,
    noNote: '—',
  },
}

export const adminGraphKo: Localized<typeof adminGraphEn> = {
  toolbar: {
    nodeLimitLabel: '노드 상한',
    nodeLimitOption: (count: string) => `${count}개`,
  },
  noProjects: '이 설치에 프로젝트가 없어 그릴 지식 그래프가 없습니다.',
  graph: {
    title: '지식 관계 그래프',
    note: '선 모양이 관계 종류, 도형이 출처. 노드나 선을 고르면 오른쪽에 근거가 나옵니다',
  },
  droppedEdges: (count: string) => `양 끝 중 한쪽이 응답에 없어 그리지 못한 관계가 ${count}개 있습니다.`,
  relations: {
    title: '관계 목록',
    note: '그림을 집지 않고도 같은 관계를 고를 수 있는 자리 · 메모가 그 관계의 유일한 근거',
    columns: {
      relation: '관계',
      from: '시작 지식',
      to: '끝 지식',
      note: '메모',
    },
    itself: '자기 자신',
    unknownItem: (id: string) => `지식 ${id}`,
    noNote: '—',
  },
}
