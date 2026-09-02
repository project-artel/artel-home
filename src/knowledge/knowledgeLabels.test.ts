/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { messages } from '../i18n/messages.ts'
import { relationLabel, relationLabelForDirection } from './knowledgeLabels.ts'

/*
 * `PART_OF` is the one relation whose name depends on which endpoint is
 * asking — see the doc comment on `relationLabelForDirection`. Every other
 * relation must read exactly as `relationLabel` already reads it, regardless
 * of direction, so a caller cannot tell the two functions apart by accident.
 */

for (const [locale, t] of Object.entries(messages)) {
  test(`[${locale}] PART_OF reads as belonging, from the item's own side`, () => {
    assert.equal(relationLabelForDirection(t, 'PART_OF', 'out'), t.knowledge.relations.PART_OF)
    assert.notEqual(t.knowledge.relations.PART_OF, t.knowledge.relations.PART_OF_CONTAINS)
  })

  test(`[${locale}] PART_OF reads as containing, from the document's side`, () => {
    assert.equal(
      relationLabelForDirection(t, 'PART_OF', 'in'),
      t.knowledge.relations.PART_OF_CONTAINS,
    )
  })

  test(`[${locale}] a self edge falls back to the ordinary PART_OF reading`, () => {
    assert.equal(relationLabelForDirection(t, 'PART_OF', 'self'), t.knowledge.relations.PART_OF)
  })

  test(`[${locale}] a relation other than PART_OF reads the same on every direction`, () => {
    for (const direction of ['out', 'in', 'self'] as const) {
      assert.equal(
        relationLabelForDirection(t, 'DEPENDS_ON', direction),
        relationLabel(t, 'DEPENDS_ON'),
      )
    }
  })

  test(`[${locale}] a relation the server invented reads the same on every direction`, () => {
    for (const direction of ['out', 'in', 'self'] as const) {
      assert.equal(
        relationLabelForDirection(t, 'SOMETHING_NEW', direction),
        relationLabel(t, 'SOMETHING_NEW'),
      )
    }
  })
}
