import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ALL_PROJECTS, entriesFor, matching, nextIndex } from './pick'
import type { ProjectSummary } from './projectsApi'

/**
 * 선택기 목록을 만드는 규칙.
 *
 * 개발자 등급이 전 프로젝트를 받으면서 이 목록이 두어 개에서 백 개까지 늘었다. 그래서 여기서
 * 지키는 것은 "다 보인다"가 아니라 **찾을 수 있다**이다 — 순서와 좁히기 둘 다 틀리면 목록이
 * 있어도 고를 수 없다.
 */

function project(name: string, mine: boolean): ProjectSummary {
  return { id: name, name, mine }
}

describe('entriesFor', () => {
  it('참여 중인 프로젝트를 위로 올린다', () => {
    // 남의 것이 훨씬 많아서, 순서를 그대로 두면 매일 여는 자기 프로젝트가 가운데 파묻힌다.
    const entries = entriesFor([
      project('남의 것 A', false),
      project('내 것', true),
      project('남의 것 B', false),
    ])

    assert.deepEqual(entries.map((entry) => entry.name), ['내 것', '남의 것 A', '남의 것 B'])
  })

  it('같은 무리 안에서는 서버가 준 순서를 지킨다', () => {
    // 서버가 최근 수정순으로 준다. 여기서 이름으로 다시 정렬하면 검색어를 지웠을 때 목록이
    // 처음과 다른 순서로 돌아온다.
    const entries = entriesFor([
      project('나중', false),
      project('먼저', false),
      project('내 것 나중', true),
      project('내 것 먼저', true),
    ])

    assert.deepEqual(entries.map((entry) => entry.name), [
      '내 것 나중',
      '내 것 먼저',
      '나중',
      '먼저',
    ])
  })

  it('전체 항목은 맨 위에 서고 내 프로젝트가 아니다', () => {
    const entries = entriesFor([project('내 것', true)], {
      allowAll: true,
      allLabel: '전체 프로젝트',
    })

    assert.deepEqual(entries[0], { id: ALL_PROJECTS, name: '전체 프로젝트', mine: false })
    assert.equal(entries.length, 2)
  })

  it('전체 항목을 안 켜면 프로젝트만 남는다', () => {
    // 지식 그래프와 기대 판정 라벨은 프로젝트가 있어야 그릴 것이 정해진다.
    const entries = entriesFor([project('내 것', true)])

    assert.deepEqual(entries.map((entry) => entry.id), ['내 것'])
  })
})

describe('matching', () => {
  const entries = entriesFor([
    project('던전 러너', true),
    project('상점 시뮬', false),
    project('Dungeon Crawler', false),
  ])

  it('이름 가운데 있어도 찾는다', () => {
    // 사람은 기억나는 조각으로 찾는다. 앞글자만 보면 `상점 시뮬`을 `시뮬`로 못 찾는다.
    assert.deepEqual(matching(entries, '시뮬').map((entry) => entry.name), ['상점 시뮬'])
  })

  it('대소문자를 가리지 않는다', () => {
    assert.deepEqual(matching(entries, 'dungeon').map((entry) => entry.name), ['Dungeon Crawler'])
  })

  it('빈 입력과 공백은 안 고른 것과 같다', () => {
    // 검색어를 지우는 순간 목록이 비면 고를 것이 사라진 것처럼 보인다.
    assert.equal(matching(entries, '').length, 3)
    assert.equal(matching(entries, '   ').length, 3)
  })

  it('찾는 것이 없으면 빈 목록이다', () => {
    assert.deepEqual(matching(entries, '없는 이름'), [])
  })
})

describe('nextIndex', () => {
  it('끝에서 반대쪽으로 감는다', () => {
    // 끝에 걸려 멈추면 반대쪽 끝으로 가는 데 목록 길이만큼 눌러야 한다.
    assert.equal(nextIndex(2, 1, 3), 0)
    assert.equal(nextIndex(0, -1, 3), 2)
  })

  it('빈 목록에서는 0이다', () => {
    assert.equal(nextIndex(0, 1, 0), 0)
    assert.equal(nextIndex(5, -1, 0), 0)
  })
})
