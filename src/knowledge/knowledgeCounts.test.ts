/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countBy } from './knowledgeCounts.ts'
import { relationStyle } from './knowledgeTypes.ts'

test('counts every item under its key', () => {
  const counts = countBy(['QA', 'DOCS', 'QA', 'IMPORT'], (source) => source)

  assert.deepEqual([...counts.entries()].sort(), [
    ['DOCS', 1],
    ['IMPORT', 1],
    ['QA', 2],
  ])
})

test('relations the build does not recognise share the UNKNOWN count', () => {
  // The legend draws one row per style, so its count has to be per style too.
  const relations = ['LEADS_TO', 'SUPERSEDES', 'MERGES_WITH', 'LEADS_TO']
  const counts = countBy(relations, (relation) => relationStyle(relation))

  assert.equal(counts.get('LEADS_TO'), 2)
  assert.equal(counts.get('UNKNOWN'), 2)
  assert.equal(counts.get('CONTRADICTS'), undefined)
})

test('an empty list gives an empty map', () => {
  assert.equal(countBy([], () => 'x').size, 0)
})
