/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseKnowledgeGraph, parseKnowledgeItemDetail, parseKnowledgeNode } from './knowledgeApi.ts'
import { KNOWLEDGE_NODE_LIMIT, relationStyle } from './knowledgeTypes.ts'

/*
 * Parsing is where an unfamiliar server value turns into either a screen or a
 * blank page. The rule these cases pin down: one bad row never costs the user
 * the whole graph, and a value this build does not recognise still arrives on
 * screen intact rather than being dropped or renamed.
 */

const sample = {
  projectId: '1',
  nodes: [
    {
      id: '1',
      tag: 'MISC',
      source: 'QA',
      summary: '지식 카운터',
      version: 1,
      createdByQaTryId: '36',
      createdByQaRunId: '9',
      createdAt: '2026-08-11T06:00:00Z',
    },
    {
      id: '2',
      tag: 'UI',
      source: 'DOCS',
      summary: '상점 화면',
      version: 3,
      createdByQaTryId: null,
      createdByQaRunId: null,
      createdAt: '2026-08-10T06:00:00Z',
    },
  ],
  edges: [{ from: '1', to: '2', relation: 'LEADS_TO', note: '마을 상단바의 상점 버튼' }],
  truncated: false,
  nodeLimit: 200,
}

test('the documented response is read field for field', () => {
  const parsed = parseKnowledgeGraph(sample, '1')

  assert.equal(parsed.projectId, '1')
  assert.equal(parsed.truncated, false)
  assert.equal(parsed.nodeLimit, 200)
  assert.deepEqual(parsed.nodes[0], {
    id: '1',
    tag: 'MISC',
    source: 'QA',
    summary: '지식 카운터',
    version: 1,
    createdByQaTryId: '36',
    createdByQaRunId: '9',
    createdAt: '2026-08-11T06:00:00Z',
    // 앵커가 없는 항목은 게임 전체에서 참인 사실이다. 서버가 `anchors` 를 아직 싣지
    // 않는 지금의 응답과, 빈 배열을 실은 응답이 여기서 같은 값이 되어야 한다.
    anchors: [],
  })
  // A document-derived item has no run behind it, and that has to stay null
  // rather than becoming an empty string that renders as a broken link.
  assert.equal(parsed.nodes[1].createdByQaTryId, null)
  assert.equal(parsed.nodes[1].createdByQaRunId, null)
  assert.deepEqual(parsed.edges, [
    { from: '1', to: '2', relation: 'LEADS_TO', note: '마을 상단바의 상점 버튼' },
  ])
})

test('an empty knowledge base parses as an empty graph, not as a failure', () => {
  const parsed = parseKnowledgeGraph(
    { projectId: '7', nodes: [], edges: [], truncated: false, nodeLimit: 200 },
    '7',
  )

  assert.deepEqual(parsed.nodes, [])
  assert.deepEqual(parsed.edges, [])
})

test('items with no relations parse as a graph with no edges', () => {
  const parsed = parseKnowledgeGraph({ ...sample, edges: [] }, '1')

  assert.equal(parsed.nodes.length, 2)
  assert.deepEqual(parsed.edges, [])
})

test('an unrecognised relation survives verbatim', () => {
  const parsed = parseKnowledgeGraph(
    { ...sample, edges: [{ from: '1', to: '2', relation: 'SUPERSEDES_SOMEHOW', note: null }] },
    '1',
  )

  assert.equal(parsed.edges.length, 1)
  assert.equal(parsed.edges[0].relation, 'SUPERSEDES_SOMEHOW')
  // Only the styling generalises it; the value itself is untouched above.
  assert.equal(relationStyle('SUPERSEDES_SOMEHOW'), 'UNKNOWN')
  assert.equal(relationStyle('CONTRADICTS'), 'CONTRADICTS')
})

test('an unrecognised tag or source does not drop the item', () => {
  const parsed = parseKnowledgeGraph(
    { ...sample, nodes: [{ ...sample.nodes[0], tag: 'ECONOMY', source: 'IMPORT' }] },
    '1',
  )

  assert.equal(parsed.nodes.length, 1)
  assert.equal(parsed.nodes[0].tag, 'ECONOMY')
  assert.equal(parsed.nodes[0].source, 'IMPORT')
})

test('a self relation is kept', () => {
  const parsed = parseKnowledgeGraph(
    { ...sample, edges: [{ from: '1', to: '1', relation: 'CONTRADICTS', note: 'against itself' }] },
    '1',
  )

  assert.deepEqual(parsed.edges, [
    { from: '1', to: '1', relation: 'CONTRADICTS', note: 'against itself' },
  ])
})

test('a row missing its id is dropped and the rest still renders', () => {
  const parsed = parseKnowledgeGraph(
    { ...sample, nodes: [{ tag: 'MISC' }, null, 'nonsense', sample.nodes[1]] },
    '1',
  )

  assert.deepEqual(
    parsed.nodes.map((entry) => entry.id),
    ['2'],
  )
})

test('missing optional fields degrade instead of dropping the item', () => {
  const parsed = parseKnowledgeNode({ id: '9' })

  assert.deepEqual(parsed, {
    id: '9',
    tag: '',
    source: '',
    summary: '',
    version: null,
    createdByQaTryId: null,
    createdByQaRunId: null,
    createdAt: '',
    anchors: [],
  })
})

/**
 * `createdByQaRunId` (ARTEL-723) is validated as a decimal id, unlike its
 * sibling `createdByQaTryId` above — it feeds `qaRunPath` directly, and a
 * malformed value has to degrade to the muted row rather than build a broken
 * link out of garbage input.
 */
test('a malformed createdByQaRunId reads as null, not as a broken link', () => {
  assert.equal(
    parseKnowledgeNode({ id: '9', createdByQaRunId: 'not-a-decimal-id' })?.createdByQaRunId,
    null,
  )
  assert.equal(parseKnowledgeNode({ id: '9', createdByQaRunId: 9 })?.createdByQaRunId, null)
})

test('an edge pointing at an item that is not in the response is dropped', () => {
  // Exactly what truncation produces, and drawing it would mean inventing a
  // node the user has no way to inspect.
  const parsed = parseKnowledgeGraph(
    { ...sample, edges: [{ from: '1', to: '999', relation: 'LEADS_TO', note: null }] },
    '1',
  )

  assert.deepEqual(parsed.edges, [])
})

test('duplicate ids and duplicate relations collapse', () => {
  const parsed = parseKnowledgeGraph(
    {
      ...sample,
      nodes: [sample.nodes[0], { ...sample.nodes[0], summary: 'a second copy' }, sample.nodes[1]],
      edges: [
        { from: '1', to: '2', relation: 'LEADS_TO', note: 'first' },
        { from: '1', to: '2', relation: 'LEADS_TO', note: 'second' },
        { from: '1', to: '2', relation: 'REFINES', note: 'a different relation' },
      ],
    },
    '1',
  )

  assert.equal(parsed.nodes.length, 2)
  assert.equal(parsed.nodes[0].summary, '지식 카운터', 'the first copy wins')
  assert.deepEqual(
    parsed.edges.map((entry) => entry.relation),
    ['LEADS_TO', 'REFINES'],
  )
})

test('truncation is only believed when the server says true', () => {
  assert.equal(parseKnowledgeGraph({ ...sample, truncated: true }, '1').truncated, true)
  assert.equal(parseKnowledgeGraph({ ...sample, truncated: 'true' }, '1').truncated, false)
  assert.equal(parseKnowledgeGraph({ ...sample, truncated: undefined }, '1').truncated, false)
})

test('a missing or nonsensical node limit falls back to what was asked for', () => {
  assert.equal(parseKnowledgeGraph({ ...sample, nodeLimit: undefined }, '1').nodeLimit, KNOWLEDGE_NODE_LIMIT)
  assert.equal(parseKnowledgeGraph({ ...sample, nodeLimit: 0 }, '1').nodeLimit, KNOWLEDGE_NODE_LIMIT)
  assert.equal(parseKnowledgeGraph({ ...sample, nodeLimit: 50 }, '1').nodeLimit, 50)
})

test('an unreadable body becomes an empty graph for the project that was asked about', () => {
  for (const body of [null, undefined, 'nope', 42, [], { nodes: 'nope', edges: 7 }]) {
    const parsed = parseKnowledgeGraph(body, '12')
    assert.deepEqual(parsed.nodes, [])
    assert.deepEqual(parsed.edges, [])
    // Never the id of some other project, and never blank.
    assert.equal(parsed.projectId, '12')
  }
})

/*
 * Anchors (ARTEL-593). 지식 항목은 두 종류다. 앵커가 없으면 게임 어디서나 참인 사실이고
 * 이쪽이 보통이다. 앵커가 있으면 그 씬(그리고 정해졌다면 그 화면)에서만 참이다.
 *
 * 이 묶음이 못 박는 것: `anchors` 키가 없는 응답과 빈 배열을 실은 응답이 구분되지 않는다는
 * 것, 그리고 앵커 하나가 깨져도 항목은 살아남는다는 것.
 */

test('one anchor is read scene and screen', () => {
  const parsed = parseKnowledgeNode({
    id: '1',
    anchors: [{ sceneName: 'BattleScene', screenId: '4242' }],
  })

  assert.deepEqual(parsed?.anchors, [{ sceneName: 'BattleScene', screenId: '4242' }])
})

test('several anchors are all kept, in the order the server sent them', () => {
  const parsed = parseKnowledgeNode({
    id: '1',
    anchors: [
      { sceneName: 'BattleScene', screenId: '4242' },
      { sceneName: 'ShopScene', screenId: null },
      { sceneName: 'BattleScene', screenId: '77' },
    ],
  })

  assert.deepEqual(parsed?.anchors, [
    { sceneName: 'BattleScene', screenId: '4242' },
    { sceneName: 'ShopScene', screenId: null },
    { sceneName: 'BattleScene', screenId: '77' },
  ])
})

test('a null screen id is the ordinary anchor, not a missing value', () => {
  // 화면은 관측으로 정해지고 대개 정해지지 않는다. 씬까지만 아는 앵커는 온전한 앵커다.
  const parsed = parseKnowledgeNode({ id: '1', anchors: [{ sceneName: 'TitleScene' }] })

  assert.deepEqual(parsed?.anchors, [{ sceneName: 'TitleScene', screenId: null }])
})

test('a response with no anchors key reads exactly like one with an empty array', () => {
  // 오늘의 서버가 보내는 모양이다. 이 둘이 갈리면 앵커를 싣기 전의 모든 항목이 화면에서
  // "불러오지 못함"으로 보이게 된다.
  const withoutKey = parseKnowledgeGraph({ ...sample, nodes: [{ id: '1' }] }, '1')
  const withEmptyArray = parseKnowledgeGraph({ ...sample, nodes: [{ id: '1', anchors: [] }] }, '1')

  assert.deepEqual(withoutKey.nodes, withEmptyArray.nodes)
  assert.deepEqual(withoutKey.nodes[0].anchors, [])
})

test('an anchor with no scene name is dropped without dropping its item', () => {
  const parsed = parseKnowledgeNode({
    id: '1',
    summary: '전투 중에는 상점을 열 수 없다',
    anchors: [{ screenId: '4242' }, null, 'nonsense', { sceneName: 'BattleScene', screenId: null }],
  })

  assert.equal(parsed?.id, '1')
  assert.equal(parsed?.summary, '전투 중에는 상점을 열 수 없다')
  assert.deepEqual(parsed?.anchors, [{ sceneName: 'BattleScene', screenId: null }])
})

test('an anchors field that is not a list leaves the item game-wide', () => {
  assert.deepEqual(parseKnowledgeNode({ id: '1', anchors: 'BattleScene' })?.anchors, [])
  assert.deepEqual(parseKnowledgeNode({ id: '1', anchors: null })?.anchors, [])
})

test('the same scene and screen twice collapses to one anchor', () => {
  // 두 줄로 보이면 서버가 하나라고 말한 것을 사람이 둘로 읽는다.
  const parsed = parseKnowledgeNode({
    id: '1',
    anchors: [
      { sceneName: 'BattleScene', screenId: '4242' },
      { sceneName: 'BattleScene', screenId: '4242' },
      { sceneName: 'BattleScene', screenId: null },
    ],
  })

  assert.deepEqual(parsed?.anchors, [
    { sceneName: 'BattleScene', screenId: '4242' },
    { sceneName: 'BattleScene', screenId: null },
  ])
})

test('a numeric screen id is accepted rather than read as no screen', () => {
  // 계약은 문자열이지만 서버가 아직 머지되지 않았다. 숫자를 못 읽으면 화면은 오류가 아니라
  // "화면 기록 없음"이라는 틀린 사실을 조용히 말한다.
  assert.deepEqual(parseKnowledgeNode({ id: '1', anchors: [{ sceneName: 'S', screenId: 4242 }] })?.anchors, [
    { sceneName: 'S', screenId: '4242' },
  ])
  // 빈 문자열은 id 가 아니다.
  assert.deepEqual(parseKnowledgeNode({ id: '1', anchors: [{ sceneName: 'S', screenId: '  ' }] })?.anchors, [
    { sceneName: 'S', screenId: null },
  ])
})

/*
 * 단건 조회(ARTEL-753/754). 여기서 못 박는 것: `description` 의 줄바꿈이 그대로 살아남는다는
 * 것, 그리고 `id` 없는 응답만 실패로 다룬다는 것 — 나머지 필드는 `parseKnowledgeNode` 와 같은
 * 관용구로 빈 문자열까지 낮아진다.
 */

test('the documented single-item response is read field for field', () => {
  const parsed = parseKnowledgeItemDetail({
    id: '2',
    summary: '상점 화면',
    description: '상점에서는 전투 중 얻은 재화로 장비를 산다',
  })

  assert.deepEqual(parsed, {
    id: '2',
    summary: '상점 화면',
    description: '상점에서는 전투 중 얻은 재화로 장비를 산다',
  })
})

test('a multi-line body keeps its line breaks', () => {
  // 문서에서 뽑힌 항목의 본문은 `genre: …` 식으로 줄 단위 이어 붙은 여러 줄이다. 트림도
  // 치환도 없이 그대로 통과해야 화면에서 줄바꿈을 살릴 수 있다.
  const parsed = parseKnowledgeItemDetail({
    id: '9',
    summary: '장르',
    description: 'genre: RPG\nplatform: PC\ntone: dark fantasy',
  })

  assert.equal(parsed?.description, 'genre: RPG\nplatform: PC\ntone: dark fantasy')
})

test('a row missing its id fails to parse', () => {
  assert.equal(parseKnowledgeItemDetail({ summary: '이름 없음', description: '본문' }), null)
})

test('missing summary or description degrades to an empty string, not a dropped item', () => {
  assert.deepEqual(parseKnowledgeItemDetail({ id: '3' }), { id: '3', summary: '', description: '' })
})

test('a body that is not an object fails to parse', () => {
  for (const body of [null, undefined, 'nope', 42, [], 'genre: RPG']) {
    assert.equal(parseKnowledgeItemDetail(body), null)
  }
})
