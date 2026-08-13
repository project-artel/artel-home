/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseKnowledgeGraph, parseKnowledgeNode } from './knowledgeApi.ts'
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
      createdAt: '2026-08-11T06:00:00Z',
    },
    {
      id: '2',
      tag: 'UI',
      source: 'DOCS',
      summary: '상점 화면',
      version: 3,
      createdByQaTryId: null,
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
    createdAt: '2026-08-11T06:00:00Z',
  })
  // A document-derived item has no run behind it, and that has to stay null
  // rather than becoming an empty string that renders as a broken link.
  assert.equal(parsed.nodes[1].createdByQaTryId, null)
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
    createdAt: '',
  })
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
