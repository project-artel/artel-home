/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { incidentEdges, layoutKnowledgeGraph, NODE_RADIUS } from './knowledgeLayout.ts'
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from './knowledgeTypes.ts'

/*
 * The layout is the part of this feature with no visual test to fall back on:
 * a wrong number here does not throw, it silently draws two relations on top of
 * each other or puts a node outside the view box. So the cases below are the
 * ones a person cannot see going wrong — reversed pairs, parallel edges, self
 * edges — plus the two empty states that are normal rather than exceptional.
 */

function node(id: string, over: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id,
    tag: 'MISC',
    source: 'QA',
    summary: `item ${id}`,
    version: 1,
    createdByQaTryId: null,
    createdAt: '2026-08-11T06:00:00Z',
    anchors: [],
    ...over,
  }
}

function edge(from: string, to: string, relation = 'LEADS_TO', note: string | null = null): KnowledgeEdge {
  return { from, to, relation, note }
}

function graph(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): KnowledgeGraph {
  return { projectId: '1', nodes, edges, truncated: false, nodeLimit: 200 }
}

test('an empty graph lays out without producing a degenerate view box', () => {
  const layout = layoutKnowledgeGraph(graph([], []))

  assert.deepEqual(layout.nodes, [])
  assert.deepEqual(layout.edges, [])
  assert.equal(layout.clusterCount, 0)
  assert.equal(layout.isolatedCount, 0)
  // A zero-sized view box makes the browser scale nothing to everything.
  assert.ok(layout.width > 0)
  assert.ok(layout.height > 0)
  assert.notEqual(layout.viewBox, '0 0 0 0')
})

test('items with no relations are all placed, on distinct points', () => {
  const layout = layoutKnowledgeGraph(graph([node('1'), node('2'), node('3')], []))

  assert.equal(layout.nodes.length, 3)
  assert.equal(layout.edges.length, 0)
  assert.equal(layout.clusterCount, 0)
  assert.equal(layout.isolatedCount, 3)

  const points = new Set(layout.nodes.map((placed) => `${placed.x},${placed.y}`))
  assert.equal(points.size, 3, 'unlinked items must not be stacked on one another')
})

test('every node lands inside the view box', () => {
  const nodes = Array.from({ length: 40 }, (_, index) => node(String(index + 1)))
  const edges = nodes.slice(1).map((target, index) => edge(nodes[index].id, target.id))
  const layout = layoutKnowledgeGraph(graph(nodes, edges))

  const [x, y, width, height] = layout.viewBox.split(' ').map(Number)
  for (const placed of layout.nodes) {
    assert.ok(placed.x >= x && placed.x <= x + width, `${placed.node.id} outside horizontally`)
    assert.ok(placed.y >= y && placed.y <= y + height, `${placed.node.id} outside vertically`)
  }
})

test('a self edge becomes a loop rather than a zero-length line', () => {
  const layout = layoutKnowledgeGraph(graph([node('1')], [edge('1', '1', 'CONTRADICTS')]))

  assert.equal(layout.edges.length, 1)
  const [placed] = layout.edges
  assert.equal(placed.selfEdge, true)
  // An arc command, and no NaN anywhere in it.
  assert.match(placed.path, /^M [-\d.]+ [-\d.]+ A /)
  assert.ok(!placed.path.includes('NaN'))
  // The loop's glyph sits clear of the node it hangs off.
  assert.ok(placed.midY < layout.nodes[0].y - NODE_RADIUS)
  // A self relation is a relation: this item is not "unlinked".
  assert.equal(layout.isolatedCount, 0)
})

test('several self edges on one node are drawn as separate loops', () => {
  const layout = layoutKnowledgeGraph(
    graph([node('1')], [edge('1', '1', 'LEADS_TO'), edge('1', '1', 'CONTRADICTS')]),
  )

  assert.equal(layout.edges.length, 2)
  assert.notEqual(layout.edges[0].path, layout.edges[1].path)
})

test('parallel relations between the same pair are fanned apart', () => {
  const layout = layoutKnowledgeGraph(
    graph(
      [node('1'), node('2')],
      [edge('1', '2', 'LEADS_TO'), edge('1', '2', 'REFINES'), edge('1', '2', 'CONTRADICTS')],
    ),
  )

  const paths = new Set(layout.edges.map((placed) => placed.path))
  assert.equal(paths.size, 3, 'three relations must be three visible curves')

  const mids = new Set(layout.edges.map((placed) => `${placed.midX},${placed.midY}`))
  assert.equal(mids.size, 3, 'their glyphs and labels must not collide either')
})

test('a reversed pair does not collapse onto one curve', () => {
  // The failure this guards is silent and total: applying the same offset along
  // each edge's own perpendicular puts both curves in exactly the same place.
  const layout = layoutKnowledgeGraph(
    graph([node('1'), node('2')], [edge('1', '2', 'LEADS_TO'), edge('2', '1', 'DEPENDS_ON')]),
  )

  assert.equal(layout.edges.length, 2)
  assert.notEqual(layout.edges[0].midX + layout.edges[0].midY, layout.edges[1].midX + layout.edges[1].midY)
  assert.notEqual(layout.edges[0].path, layout.edges[1].path)
})

test('a lone relation between two items is drawn straight and clear of both marks', () => {
  const layout = layoutKnowledgeGraph(graph([node('1'), node('2')], [edge('1', '2')]))

  const [from, to] = layout.nodes
  const [placed] = layout.edges
  const [, startX, startY] = /^M ([-\d.]+) ([-\d.]+)/.exec(placed.path)?.map(Number) ?? []

  const distance = Math.hypot(startX - from.x, startY - from.y)
  assert.ok(distance >= NODE_RADIUS - 0.01, 'the line must start on the node boundary, not its centre')
  assert.ok(Math.hypot(to.x - from.x, to.y - from.y) > NODE_RADIUS * 2)
})

test('an unrecognised relation is laid out like any other', () => {
  // Layout must not have an opinion about the relation vocabulary; only styling
  // does, and a value invented after this build must still reach the screen.
  const known = layoutKnowledgeGraph(graph([node('1'), node('2')], [edge('1', '2', 'LEADS_TO')]))
  const unknown = layoutKnowledgeGraph(graph([node('1'), node('2')], [edge('1', '2', 'SMELLS_LIKE')]))

  assert.equal(unknown.edges.length, 1)
  assert.equal(unknown.edges[0].path, known.edges[0].path)
})

test('an edge naming an absent node is skipped instead of poisoning the geometry', () => {
  const layout = layoutKnowledgeGraph(graph([node('1')], [edge('1', '404')]))

  assert.equal(layout.edges.length, 0)
  assert.ok(!layout.viewBox.includes('NaN'))
})

test('the same graph always draws the same picture', () => {
  const nodes = [node('1'), node('2'), node('3'), node('4'), node('5')]
  const edges = [edge('1', '2'), edge('2', '3', 'REFINES'), edge('3', '1'), edge('4', '5', 'REPLACES')]

  const first = layoutKnowledgeGraph(graph(nodes, edges))
  const second = layoutKnowledgeGraph(graph(nodes, edges))

  assert.deepEqual(second.nodes, first.nodes)
  assert.deepEqual(second.edges, first.edges)
  assert.equal(second.viewBox, first.viewBox)
})

test('separate groups of items are counted and kept apart', () => {
  const layout = layoutKnowledgeGraph(
    graph(
      [node('1'), node('2'), node('3'), node('4'), node('5')],
      [edge('1', '2'), edge('3', '4')],
    ),
  )

  assert.equal(layout.clusterCount, 2)
  assert.equal(layout.isolatedCount, 1)

  const components = new Map(layout.nodes.map((placed) => [placed.node.id, placed.component]))
  assert.equal(components.get('1'), components.get('2'))
  assert.equal(components.get('3'), components.get('4'))
  assert.notEqual(components.get('1'), components.get('3'))
  assert.notEqual(components.get('1'), components.get('5'))
})

test('incident edges resolve both directions and the item at the far end', () => {
  const nodes = [node('1'), node('2'), node('3')]
  const layout = layoutKnowledgeGraph(
    graph(nodes, [edge('1', '2'), edge('3', '1', 'CONTRADICTS'), edge('1', '1', 'REFINES')]),
  )
  const nodesById = new Map(nodes.map((entry) => [entry.id, entry]))

  const incidence = incidentEdges(layout, '1', nodesById)
  assert.deepEqual(
    incidence.map(({ direction, other }) => [direction, other.id]),
    [
      ['out', '2'],
      ['in', '3'],
      ['self', '1'],
    ],
  )

  assert.deepEqual(incidentEdges(layout, '2', nodesById).map(({ direction }) => direction), ['in'])
})
