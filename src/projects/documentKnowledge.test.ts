/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { KnowledgeEdge, KnowledgeNode } from '../knowledge/knowledgeTypes.ts'
import { documentKnowledge } from './documentKnowledge.ts'

function node(id: string, overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id,
    tag: 'INFO',
    source: 'DOCS',
    summary: `item ${id}`,
    version: 1,
    createdByQaTryId: null,
    createdByQaRunId: null,
    createdAt: '2026-10-16T01:00:30Z',
    anchors: [],
    ...overrides,
  }
}

const partOf = (from: string, to: string): KnowledgeEdge => ({ from, to, relation: 'PART_OF', note: null })

const document = { fileName: 'design.pdf', uploadedAt: '2026-10-16T01:00:00Z' }

test('collects the items that hang off this version’s document node, rule first', () => {
  const nodes = [
    node('doc', { tag: 'MISC', summary: 'design.pdf' }),
    node('a', { tag: 'UI' }),
    node('b', { tag: 'RULE' }),
    node('qa', { source: 'QA' }),
  ]
  const items = documentKnowledge({ nodes, edges: [partOf('a', 'doc'), partOf('b', 'doc')] }, document)

  assert.deepEqual(items?.map((item) => item.id), ['b', 'a'])
})

test('a re-upload under the same name picks the node made after this version went up', () => {
  const nodes = [
    node('old-doc', { tag: 'MISC', summary: 'design.pdf', createdAt: '2026-10-10T09:00:00Z' }),
    node('new-doc', { tag: 'MISC', summary: 'design.pdf', createdAt: '2026-10-16T01:00:40Z' }),
    node('old-item'),
    node('new-item'),
  ]
  const edges = [partOf('old-item', 'old-doc'), partOf('new-item', 'new-doc')]

  assert.deepEqual(documentKnowledge({ nodes, edges }, document)?.map((item) => item.id), ['new-item'])
})

test('no document node means nothing came out of this version', () => {
  const nodes = [node('doc', { summary: 'other.pdf' }), node('a')]

  assert.equal(documentKnowledge({ nodes, edges: [partOf('a', 'doc')] }, document), null)
  assert.equal(documentKnowledge({ nodes: [], edges: [] }, document), null)
})

test('a node that was made before this version went up belongs to an earlier version', () => {
  const nodes = [node('doc', { summary: 'design.pdf', createdAt: '2026-10-15T00:00:00Z' }), node('a')]

  assert.equal(documentKnowledge({ nodes, edges: [partOf('a', 'doc')] }, document), null)
})
