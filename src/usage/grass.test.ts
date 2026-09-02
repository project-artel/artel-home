import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildGrass,
  dayAt,
  dayTokens,
  DAYS_PER_WEEK,
  grassWindow,
  levelOf,
  levelThresholds,
  toDateKey,
  WEEKS,
  type DayTotals,
} from './grass'

function totals(tokens: number, over: Partial<DayTotals> = {}): DayTotals {
  return { inputTokens: tokens, outputTokens: 0, costUsd: 0.001, calls: 1, ...over }
}

/** A fixed Wednesday, so nothing here depends on the day the suite runs. */
const TODAY = new Date(2026, 8, 2)

describe('dayTokens', () => {
  it('adds input and output only', () => {
    // 캐시 입력과 reasoning 은 provider 가 세는 입력·출력의 부분집합이라 더하면 두 번 센다.
    assert.equal(dayTokens({ inputTokens: 900, outputTokens: 100, costUsd: null, calls: 2 }), 1000)
  })
})

describe('grassWindow', () => {
  it('ends today and covers exactly twelve weeks', () => {
    const { start, end } = grassWindow(TODAY)
    assert.equal(toDateKey(end), '2026-09-02')
    assert.equal(toDateKey(start), '2026-06-11')
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    assert.equal(spanDays, WEEKS * DAYS_PER_WEEK)
  })
})

describe('levelThresholds', () => {
  it('reads quartiles of the days that had calls', () => {
    // 0 인 날은 눈금을 정하는 데 끼지 않는다. 끼면 조용한 프로젝트일수록 모든 날이 짙어진다.
    const thresholds = levelThresholds([0, 0, 10, 20, 30, 40])
    assert.deepEqual(thresholds, [10, 20, 30])
  })

  it('is all zero when nothing was recorded', () => {
    assert.deepEqual(levelThresholds([]), [0, 0, 0])
    assert.deepEqual(levelThresholds([0, 0]), [0, 0, 0])
  })

  it('repeats the boundary rather than inventing one', () => {
    // 서로 다른 값이 넷보다 적으면 네 단계를 채울 수 없다. 없는 경계를 지어내지 않는다.
    assert.deepEqual(levelThresholds([50, 50, 50]), [50, 50, 50])
  })

  it('spreads two distinct values across two levels', () => {
    const thresholds = levelThresholds([10, 10, 1000, 1000])
    assert.notEqual(levelOf(10, thresholds), levelOf(1000, thresholds))
  })
})

describe('levelOf', () => {
  it('gives an empty day level 0, never a faint one', () => {
    assert.equal(levelOf(0, [10, 20, 30]), 0)
  })

  it('walks up the quartiles', () => {
    assert.equal(levelOf(5, [10, 20, 30]), 1)
    assert.equal(levelOf(10, [10, 20, 30]), 1)
    assert.equal(levelOf(15, [10, 20, 30]), 2)
    assert.equal(levelOf(25, [10, 20, 30]), 3)
    assert.equal(levelOf(9000, [10, 20, 30]), 4)
  })

  it('gives every day one visible shade when they all spent the same', () => {
    // 눈금이 뜻을 실을 수 없는 경우다. 가장 옅은 칸으로 그리면 활동한 날이 빈 날과
    // 구분되지 않아, 그래프가 말하려던 것과 정반대가 된다.
    const thresholds = levelThresholds([50, 50, 50])
    assert.equal(levelOf(50, thresholds), 3)
    assert.equal(levelOf(0, thresholds), 0)
  })

  it('does not let one heavy day flatten the rest', () => {
    // 하루가 나머지의 50배인 것은 이 제품에서 정상이다 — 긴 QA 런 하나가 한가한 한 주보다
    // 많이 쓴다. 최댓값 대비로 나누면 그 하루만 짙고 나머지는 전부 가장 옅은 칸이 되어,
    // 지출이 없는 프로젝트와 같은 그림이 된다.
    const ordinary = [10, 12, 14, 16, 18, 20]
    const thresholds = levelThresholds([...ordinary, 1000])
    const levels = ordinary.map((value) => levelOf(value, thresholds))
    assert.ok(new Set(levels).size >= 3, `평범한 날들이 한 단계로 뭉쳤다: ${levels.join(',')}`)
    assert.equal(levelOf(1000, thresholds), 4)
  })
})

describe('buildGrass', () => {
  it('starts every column on a Sunday and ends on today', () => {
    const grid = buildGrass([], TODAY)
    assert.equal(grid.weeks[0][0].date, '2026-06-07')
    const last = grid.weeks[grid.weeks.length - 1]
    assert.equal(last.some((cell) => cell.date === '2026-09-02'), true)
    assert.ok(grid.weeks.every((week) => week.length === DAYS_PER_WEEK))
  })

  it('marks the leading pad cells out of range', () => {
    const grid = buildGrass([], TODAY)
    // 격자는 일요일에 시작하므로 창(6월 11일 목요일) 앞의 나흘은 어느 날도 아니다.
    // 이 칸을 "0 을 쓴 날"로 그리면 프로젝트가 그때 아무것도 안 썼다고 말하는 것이 된다.
    const padded = grid.weeks[0].filter((cell) => !cell.inRange).map((cell) => cell.date)
    assert.deepEqual(padded, ['2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10'])
  })

  it('keeps the days the server left out as empty cells', () => {
    const grid = buildGrass([{ date: '2026-09-01', totals: totals(500) }], TODAY)
    const cells = grid.weeks.flat().filter((cell) => cell.inRange)

    assert.equal(cells.length, WEEKS * DAYS_PER_WEEK)
    // 서버는 호출이 없던 날에 줄을 주지 않는다. 응답에서 격자를 만들면 달력이 조용히 짧아진다.
    assert.equal(cells.filter((cell) => cell.totals === null).length, WEEKS * DAYS_PER_WEEK - 1)
    // 활동한 날이 하루뿐이라 눈금이 한 값으로 뭉친다 — 가장 옅은 칸이 아니라 중간 칸이다.
    assert.equal(cells.find((cell) => cell.date === '2026-09-01')?.level, 3)
  })

  it('ignores days outside the window', () => {
    const grid = buildGrass(
      [
        { date: '2026-01-01', totals: totals(999) },
        { date: '2026-09-02', totals: totals(10) },
      ],
      TODAY,
    )
    assert.equal(grid.max, 10)
  })

  it('reports the busiest day', () => {
    const grid = buildGrass(
      [
        { date: '2026-08-30', totals: totals(100) },
        { date: '2026-08-31', totals: totals(700) },
      ],
      TODAY,
    )
    assert.equal(grid.max, 700)
  })

  it('is all level 0 for a project that has spent nothing', () => {
    const grid = buildGrass([], TODAY)
    assert.equal(grid.max, 0)
    assert.ok(grid.weeks.flat().every((cell) => cell.level === 0))
  })
})

describe('dayAt', () => {
  it('finds today and yesterday on the same calendar as the grid', () => {
    const grid = buildGrass(
      [
        { date: '2026-09-02', totals: totals(300) },
        { date: '2026-09-01', totals: totals(120) },
      ],
      TODAY,
    )
    assert.equal(dayAt(grid, new Date(2026, 8, 2))?.inputTokens, 300)
    assert.equal(dayAt(grid, new Date(2026, 8, 1))?.inputTokens, 120)
  })

  it('is null for a day with no call, and for a day off the grid', () => {
    const grid = buildGrass([], TODAY)
    // 둘 다 null 이지만 뜻이 다르다 — 화면이 "기록 없음"과 격자 밖을 구분해 쓴다.
    assert.equal(dayAt(grid, new Date(2026, 8, 2)), null)
    assert.equal(dayAt(grid, new Date(2020, 0, 1)), null)
  })
})
