/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { documentNodeIds, isKnownRelation } from './knowledgeTypes.ts'
import type { KnowledgeEdge } from './knowledgeTypes.ts'

function edge(from: string, to: string, relation: string): KnowledgeEdge {
  return { from, to, relation, note: null }
}

test('PART_OF is a known relation', () => {
  assert.equal(isKnownRelation('PART_OF'), true)
})

test('an unrelated string is still not known', () => {
  assert.equal(isKnownRelation('PART_OF_SOMETHING_ELSE'), false)
})

/*
 * `documentNodeIds` is the whole point of the structural read: `source` alone
 * cannot tell a document node from one of its own items, because both carry
 * `DOCS`. What actually marks the document node is being the `to` of a
 * `PART_OF` edge.
 */
test('a document node is whatever a PART_OF edge points at', () => {
  const edges = [edge('item-1', 'doc-1', 'PART_OF'), edge('item-2', 'doc-1', 'PART_OF')]

  assert.deepEqual([...documentNodeIds(edges)], ['doc-1'])
})

test('an item on the sending end of PART_OF is not counted as a document', () => {
  const edges = [edge('item-1', 'doc-1', 'PART_OF')]
  const ids = documentNodeIds(edges)

  assert.equal(ids.has('item-1'), false)
  assert.equal(ids.has('doc-1'), true)
})

test('a relation this build does not know as PART_OF names no document', () => {
  const edges = [edge('a', 'b', 'LEADS_TO')]

  assert.equal(documentNodeIds(edges).size, 0)
})

test('no edges at all names no document', () => {
  assert.equal(documentNodeIds([]).size, 0)
})

test('two documents each collect their own items', () => {
  const edges = [
    edge('item-1', 'doc-1', 'PART_OF'),
    edge('item-2', 'doc-2', 'PART_OF'),
    edge('item-3', 'doc-2', 'PART_OF'),
  ]

  assert.deepEqual([...documentNodeIds(edges)].sort(), ['doc-1', 'doc-2'])
})
