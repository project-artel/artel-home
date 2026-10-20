import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isDeepPath, isSectionPath, projectPathSegments } from './sections'

describe('isDeepPath', () => {
  it('깊은 화면 일곱 개를 깊은 경로로 본다', () => {
    for (const rest of [
      'instances/i1',
      'test-scenarios/s1',
      'test-runs/r1',
      'test-runs/r1/edit',
      'qa-runs/q1',
      'qa-runs/q1/performance',
      'game-builds/b1/performance',
    ]) {
      assert.equal(isDeepPath('p1', `/projects/p1/${rest}`), true, rest)
    }
  })

  it('끝의 슬래시는 무시한다', () => {
    assert.equal(isDeepPath('p1', '/projects/p1/qa-runs/q1/'), true)
  })

  it('section 경로는 깊지 않다', () => {
    for (const rest of ['', 'documents', 'test-runs', 'qa-history', 'settings']) {
      assert.equal(isDeepPath('p1', `/projects/p1/${rest}`), false, rest)
    }
  })

  it('content-map 으로 넘기는 옛 경로와 다른 project 의 경로는 깊지 않다', () => {
    assert.equal(isDeepPath('p1', '/projects/p1/game-builds/b1/content-map'), false)
    assert.equal(isDeepPath('p1', '/projects/p2/qa-runs/q1'), false)
  })
})

describe('projectPathSegments', () => {
  it('index 는 빈 배열, 다른 project 는 null 이다', () => {
    assert.deepEqual(projectPathSegments('p1', '/projects/p1'), [])
    assert.deepEqual(projectPathSegments('p1', '/projects/p1/'), [])
    assert.equal(projectPathSegments('p1', '/projects/p10/qa'), null)
  })

  it('인코딩이 필요한 projectId 도 인코딩된 pathname 과 맞춘다', () => {
    assert.deepEqual(projectPathSegments('a b', '/projects/a%20b/test-runs/r1/edit'), ['test-runs', 'r1', 'edit'])
    assert.equal(isDeepPath('a b', '/projects/a%20b/qa-runs/q1'), true)
  })
})

describe('isSectionPath', () => {
  it('reads the index and every section as a section screen', () => {
    for (const rest of ['', 'qa', 'macros', 'issues', 'settings', 'members', 'test-runs'])
      assert.equal(isSectionPath('p1', `/projects/p1/${rest}`), true, rest)
    assert.equal(isSectionPath('p1', '/projects/p1'), true)
    assert.equal(isSectionPath('p1', '/projects/p1/macros/'), true)
  })

  it('does not read an unknown or deeper path as a section', () => {
    for (const rest of ['whatever', 'qa/extra', 'test-runs/r1', 'macro'])
      assert.equal(isSectionPath('p1', `/projects/p1/${rest}`), false, rest)
    assert.equal(isSectionPath('p1', '/projects/p2/qa'), false)
  })
})
