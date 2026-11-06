import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  breakdown,
  citationCoverage,
  citationRate,
  currentRate,
  repudiationRate,
  sumCells,
} from './pivot'
import type { KnowledgeStatsCell } from './knowledgeStatsTypes'

/**
 * 이 파일이 지키는 것은 **분모**다.
 *
 * 지식 지표가 조용히 틀리는 자리는 전부 분모에 있다. 인용률을 검색 노출로 나누면 인용 보고
 * 기능이 없던 시절의 검색이 전부 "아무도 안 씀"이 되고, 판정할 수 없는 경우를 0%로 쓰면
 * "전부 사장됐다"와 같은 글자가 된다. 둘 다 숫자는 그럴듯해 보이고 화면만 봐서는 안 잡힌다.
 */

function cell(overrides: Partial<KnowledgeStatsCell>): KnowledgeStatsCell {
  return {
    model: 'sonnet-5',
    reasoningEffort: 'high',
    promptVersion: 'v3',
    agentArch: 'v2-tool-loop',
    entryVersions: 0,
    currentVersions: 0,
    deletedVersions: 0,
    repudiatedVersions: 0,
    retrievalTotal: 0,
    citationTotal: 0,
    citationKnownTotal: 0,
    ...overrides,
  }
}

describe('citationRate', () => {
  it('검색 노출이 아니라 판정 가능 건수로 나눈다', () => {
    // 100번 검색됐지만 인용 여부를 알 수 있는 것은 10번뿐이고 그중 5번 인용됐다.
    // 노출로 나누면 5%가 되어 지식창고가 실제보다 훨씬 쓸모없어 보인다.
    const rate = citationRate(
      cell({ retrievalTotal: 100, citationKnownTotal: 10, citationTotal: 5 }),
    )
    assert.ok(Math.abs(rate! - (0.5)) < 1e-2)
  })

  it('판정 가능한 검색이 없으면 0%가 아니라 미상이다', () => {
    const rate = citationRate(cell({ retrievalTotal: 100, citationKnownTotal: 0 }))
    assert.equal(rate, null)
  })
})

describe('citationCoverage', () => {
  it('인용률을 얼마나 믿을 수 있는지 알려 준다', () => {
    const coverage = citationCoverage(cell({ retrievalTotal: 100, citationKnownTotal: 10 }))
    assert.ok(Math.abs(coverage! - (0.1)) < 1e-2)
  })

  it('검색 기록이 없으면 미상이다', () => {
    assert.equal(citationCoverage(cell({})), null)
  })
})

describe('repudiationRate', () => {
  it('만든 버전을 분모로 쓴다', () => {
    const rate = repudiationRate(cell({ entryVersions: 8, repudiatedVersions: 2 }))
    assert.ok(Math.abs(rate! - (0.25)) < 1e-2)
  })

  it('만든 버전이 없으면 미상이다', () => {
    // 0/0을 0%로 쓰면 아무것도 안 만든 설정이 "아무것도 안 지워졌다"로 제일 좋아 보인다.
    assert.equal(repudiationRate(cell({})), null)
  })
})

describe('currentRate', () => {
  it('밀린 버전과 지워진 버전을 함께 뺀다', () => {
    // 최신이 아닌 4개 중 1개만 폐기다. 이 값만으로 품질을 읽으면 안 된다는 근거.
    const rate = currentRate(cell({ entryVersions: 10, currentVersions: 6, repudiatedVersions: 1 }))
    assert.ok(Math.abs(rate! - (0.6)) < 1e-2)
  })
})

describe('sumCells', () => {
  it('셀을 더해도 판정 가능 건수와 인용 건수가 따로 보존된다', () => {
    const summed = sumCells([
      cell({ retrievalTotal: 10, citationKnownTotal: 10, citationTotal: 4 }),
      cell({ retrievalTotal: 10, citationKnownTotal: 0, citationTotal: 0 }),
    ])
    assert.equal(summed.retrievalTotal, 20)
    assert.equal(summed.citationKnownTotal, 10)
    // 판정 가능한 절반만 분모다. 20으로 나누면 20%로 반토막 난다.
    assert.ok(Math.abs(citationRate(summed)! - (0.4)) < 1e-2)
  })
})

describe('breakdown', () => {
  it('만든 버전 수 내림차순이고 미상은 끝이다', () => {
    const groups = breakdown(
      [
        cell({ model: 'haiku-4-5', entryVersions: 2 }),
        cell({ model: null, entryVersions: 99 }),
        cell({ model: 'sonnet-5', entryVersions: 7 }),
      ],
      'model',
    )
    assert.deepEqual(groups.map((group) => group.value), ['sonnet-5', 'haiku-4-5', null])
  })

  it('같은 축 값의 셀을 하나로 접는다', () => {
    const groups = breakdown(
      [
        cell({ model: 'sonnet-5', promptVersion: 'v3', entryVersions: 3, repudiatedVersions: 1 }),
        cell({ model: 'sonnet-5', promptVersion: 'v4', entryVersions: 5, repudiatedVersions: 1 }),
      ],
      'model',
    )
    assert.equal(groups.length, 1)
    assert.equal(groups[0].entryVersions, 8)
    assert.ok(Math.abs(repudiationRate(groups[0])! - (0.25)) < 1e-2)
  })
})
