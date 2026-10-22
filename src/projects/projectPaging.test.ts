import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { arrangeProjects, pageCount, pageSlice, PROJECTS_PER_PAGE } from './projectPaging'
import type { ProjectSummary } from './projectTypes'

function project(id: string, name: string, updatedAt: string, description: string | null = null): ProjectSummary {
  return { id, name, genre: 'OTHER', description, documentCount: 0, latestDocument: null, myRole: 'OWNER', updatedAt } as ProjectSummary
}

const projects = [
  project('1', 'wordventure', '2026-09-01T00:00:00Z', 'word puzzle'),
  project('2', 'new world', '2026-09-15T00:00:00Z'),
  project('3', 'ds', '2026-10-21T00:00:00Z'),
]

describe('arrangeProjects', () => {
  it('puts favorites first, then sorts the rest', () => {
    const arranged = arrangeProjects(projects, { query: '', sort: 'recent', favorites: new Set(['1']) })
    assert.deepEqual(arranged.map((one) => one.id), ['1', '3', '2'])
  })

  it('sorts by name', () => {
    const arranged = arrangeProjects(projects, { query: '', sort: 'name', favorites: new Set() })
    assert.deepEqual(arranged.map((one) => one.name), ['ds', 'new world', 'wordventure'])
  })

  it('keeps only favorites when asked', () => {
    const arranged = arrangeProjects(projects, { query: '', sort: 'recent', favorites: new Set(['2', '1']), favoritesOnly: true })
    assert.deepEqual(arranged.map((one) => one.id), ['2', '1'])
  })

  it('finds by name or description, ignoring case', () => {
    assert.deepEqual(arrangeProjects(projects, { query: 'PUZZLE', sort: 'recent', favorites: new Set() }).map((one) => one.id), ['1'])
  })
})

describe('paging', () => {
  it('keeps one page for no projects and seven per page', () => {
    assert.equal(PROJECTS_PER_PAGE, 7)
    assert.equal(pageCount(0), 1)
    assert.equal(pageCount(7), 1)
    assert.equal(pageCount(8), 2)
    assert.deepEqual(pageSlice([1, 2, 3, 4, 5, 6, 7, 8, 9], 1), [8, 9])
  })
})
