import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PlacedEdge, PlacedNode } from './knowledgeLayout'
import {
  createSimulation,
  hold,
  positions,
  REST_ALPHA,
  step,
  wake,
} from './knowledgeSimulation'
import type { KnowledgeEdge, KnowledgeNode } from './knowledgeTypes'

/*
 * The three promises the relaxation makes, and what breaks if it stops keeping
 * them:
 *
 *   settles   — a loop that never ends burns a core behind an idle tab.
 *   returns   — without the pull home, a dragged graph keeps an arrangement
 *               nobody can reproduce, and the deterministic layout was pointless.
 *   separates — nodes stacked on each other are a picture of nothing.
 */

function node(id: string, x: number, y: number): PlacedNode {
  const knowledge: KnowledgeNode = {
    id,
    tag: 'MISC',
    source: 'QA',
    summary: id,
    version: 1,
    createdByQaTryId: null,
    createdAt: '2026-08-11T00:00:00Z',
    anchors: [],
  }
  return { node: knowledge, x, y, component: 0, degree: 0 }
}

function edge(from: string, to: string): PlacedEdge {
  const relation: KnowledgeEdge = { from, to, relation: 'LEADS_TO', note: 'n' }
  return { id: `${from}-${to}`, edge: relation, path: '', midX: 0, midY: 0, selfEdge: from === to }
}

function settle(simulation: ReturnType<typeof createSimulation>, limit = 4000): number {
  let ticks = 0
  while (step(simulation, null)) {
    ticks += 1
    if (ticks > limit) throw new Error('never settled')
  }
  return ticks
}

describe('knowledge simulation', () => {
  it('does nothing until something wakes it', () => {
    const simulation = createSimulation([node('1', 0, 0), node('2', 100, 0)], [])
    assert.equal(step(simulation, null), false)
    assert.equal(simulation.alpha, 0)
  })

  it('settles, and in a bounded number of ticks', () => {
    const simulation = createSimulation([node('1', 0, 0), node('2', 100, 0)], [edge('1', '2')])
    wake(simulation)
    const ticks = settle(simulation)
    assert.ok(ticks > 0)
    assert.ok(simulation.alpha < REST_ALPHA)
  })

  it('leaves a dropped node near where it was dropped', () => {
    // The opposite of snapping back. A reader who drags something has changed
    // the shape of the graph, and undoing that on release would make the
    // gesture pointless — the seed is a starting point, not a place to return to.
    const simulation = createSimulation([node('1', 0, 0), node('2', 200, 0)], [])
    hold(simulation, '1', 400, 400)
    wake(simulation)
    settle(simulation)

    const at = positions(simulation).get('1')
    assert.ok(at !== undefined)
    // The weak centring force still applies, so this is "near", not "exactly".
    // What it must not be is back at the origin it started from.
    assert.ok(Math.hypot(at.x - 400, at.y - 400) < 160, `drifted to ${at.x},${at.y}`)
    assert.ok(Math.hypot(at.x, at.y) > 200, 'it must not have snapped home')
  })

  it('leaves the held node exactly under the pointer', () => {
    const simulation = createSimulation([node('1', 0, 0), node('2', 20, 0)], [edge('1', '2')])
    hold(simulation, '1', 300, 120)
    wake(simulation)
    for (let i = 0; i < 40; i += 1) step(simulation, '1')

    const at = positions(simulation).get('1')
    assert.deepEqual(at, { x: 300, y: 120 })
  })

  it('pushes two nodes off the same point', () => {
    const simulation = createSimulation([node('1', 50, 50), node('2', 50, 50)], [])
    wake(simulation)
    settle(simulation)

    const one = positions(simulation).get('1')
    const two = positions(simulation).get('2')
    assert.ok(one !== undefined && two !== undefined)
    assert.ok(Math.hypot(one.x - two.x, one.y - two.y) > 0, 'they must not stay stacked')
  })

  it('ignores a self edge instead of dividing by its zero length', () => {
    const simulation = createSimulation([node('1', 10, 10)], [edge('1', '1')])
    assert.equal(simulation.links.length, 0)
    wake(simulation)
    settle(simulation)
    const at = positions(simulation).get('1')
    assert.ok(at !== undefined && Number.isFinite(at.x) && Number.isFinite(at.y))
  })

  it('skips an edge naming a node that is not there', () => {
    const simulation = createSimulation([node('1', 0, 0)], [edge('1', 'missing')])
    assert.equal(simulation.links.length, 0)
  })

  it('holds nothing when the id is unknown', () => {
    const simulation = createSimulation([node('1', 0, 0)], [])
    hold(simulation, 'missing', 5, 5)
    assert.deepEqual(positions(simulation).get('1'), { x: 0, y: 0 })
  })

  it('survives an empty graph', () => {
    const simulation = createSimulation([], [])
    wake(simulation)
    assert.doesNotThrow(() => settle(simulation))
  })
})
