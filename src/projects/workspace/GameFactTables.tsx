import { useEffect } from 'react'
import { GameVariableSketch, StateNameSketch } from '../../emptyStates/sketches'
import { SketchEmpty } from '../../emptyStates/SketchEmpty'
import { useI18n } from '../../i18n/useI18n'
import { rulesPerFact, type GameFactBook } from '../gameFactApi'

/**
 * 게임 정보 탭. 코딩 에이전트가 MCP 로 선언한 fact — 엔진이 읽는 게임 값(`Type.member`)과 플레이어 말로 쓴 이름 · 뜻.
 * 읽기 전용이다. 선언과 수정은 MCP(`modify_facts`)가 한다.
 */
export function FactTable({ book, focus = null }: { book: GameFactBook; focus?: string | null }) {
  const { t } = useI18n()
  const m = t.gameIdentities.dictionary
  // 규칙 탭에서 fact 이름을 누르고 온 경우 그 줄을 보이게 한다.
  useEffect(() => {
    if (focus) document.getElementById(`fact-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus])
  if (book.facts.length === 0) return (
    <section className="panel">
      <SketchEmpty body={m.factsEmpty} compact surface sketch={<GameVariableSketch />} title={m.factsEmptyTitle} />
    </section>
  )
  const ruleCounts = rulesPerFact(book)
  return (
    <section aria-label={m.tabs.facts} className="panel panel--flush">
      <p className="gd-tab-hint">{m.factsHint}</p>
      <div aria-label={m.tabs.facts} className="gb-table-scroll" role="region" tabIndex={0}>
        <table className="data-table gb-table gd-facts">
          <thead>
            <tr>
              <th scope="col">{m.factName}</th>
              <th scope="col">{m.factReads}</th>
              <th scope="col">{m.factType}</th>
              <th scope="col">{m.factMeans}</th>
              <th className="gls-num" scope="col">{m.factRules}</th>
            </tr>
          </thead>
          <tbody>
            {book.facts.map((fact) => (
              <tr className={fact.name === focus ? 'gb-row is-selected' : undefined} id={`fact-${fact.name}`} key={fact.id}>
                <td><b className="mono">{fact.name}</b></td>
                <td>
                  <span className="gd-fact-source">
                    <span className="gls-kind">{m.factScope[fact.scope]}</span>
                    <span className="mono">{fact.member}</span>
                  </span>
                </td>
                <td className="gd-fact-type">
                  <span className="mono">{fact.type}</span>
                  {fact.unit && <span className="table-meta"> · {fact.unit}</span>}
                </td>
                <td className="gd-fact-means">{fact.means}</td>
                <td className="gls-num">{ruleCounts.get(fact.name) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * 규칙 탭. 게임이 어떻게 도는지 한 문장과 그 문장이 다루는 fact. fact 이름은 게임 정보 탭의 줄로 이어 준다.
 * 서버는 선언된 fact 만 받지만, 그 뒤에 fact 가 지워졌을 수 있어 목록에 없는 이름은 표시를 붙인다.
 */
export function RuleTable({ book, onOpenFact }: { book: GameFactBook; onOpenFact: (name: string) => void }) {
  const { t } = useI18n()
  const m = t.gameIdentities.dictionary
  if (book.rules.length === 0) return (
    <section className="panel">
      <SketchEmpty body={m.rulesEmpty} compact surface sketch={<StateNameSketch />} title={m.rulesEmptyTitle} />
    </section>
  )
  const declared = new Set(book.facts.map((fact) => fact.name))
  return (
    <section aria-label={m.tabs.rules} className="panel panel--flush">
      <p className="gd-tab-hint">{m.factsHint}</p>
      <div aria-label={m.tabs.rules} className="gb-table-scroll" role="region" tabIndex={0}>
        <table className="data-table gb-table gd-rules">
          <thead>
            <tr>
              <th scope="col">{m.ruleName}</th>
              <th scope="col">{m.ruleSays}</th>
              <th scope="col">{m.ruleFacts}</th>
            </tr>
          </thead>
          <tbody>
            {book.rules.map((rule) => (
              <tr key={rule.id}>
                <td><b className="mono">{rule.name}</b></td>
                <td className="gd-rule-says">{rule.says}</td>
                <td>
                  <ul className="gd-rule-facts">
                    {rule.facts.map((name) => (
                      <li key={name}>
                        {declared.has(name) ? (
                          <button className="gd-fact-chip mono" onClick={() => onOpenFact(name)} type="button">{name}</button>
                        ) : (
                          <span className="gd-fact-chip is-missing mono" title={m.unknownFact}>
                            <span aria-hidden="true">!</span> {name}
                            <span className="visually-hidden">({m.unknownFact})</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
