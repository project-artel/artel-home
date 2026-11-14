import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BuildSwitcher } from '../../contentMap/BuildSwitcher'
import { newestFirst } from '../../contentMap/latestBuild'
import { ScreenMoveSketch } from '../../emptyStates/sketches'
import { SketchEmpty } from '../../emptyStates/SketchEmpty'
import { useI18n } from '../../i18n/useI18n'
import { fetchGlossaryBook, type GlossaryBook, type GlossaryTerm } from '../../testCases/glossaryApi'
import { fetchGameFactBook, type GameFactBook } from '../gameFactApi'
import { buildDisplayName } from '../buildEnvironment'
import { listGameIdentities, type GameIdentity } from '../gameIdentityApi'
import { GameIdentityPanel } from '../GameIdentityPanel'
import { FactTable, RuleTable } from './GameFactTables'
import { GlossaryStates } from './GlossarySection'
import { linkOf } from './glossaryLinks'
import { gameBuildDetailHref, sectionHref } from './sections'
import { useWorkspace } from './workspaceContext'
import './gameDictionary.css'

type Tab = 'states' | 'exits' | 'variables' | 'facts' | 'rules'
const TABS: readonly Tab[] = ['states', 'exits', 'variables', 'facts', 'rules']
type Loaded<T> = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; value: T }

/**
 * 변수 메타데이터(ARTEL-1396). 게임 사전(TC · QA 실행에서 모은 상태 이름 · 화면 이동, 예전 용어집)과 게임이 SDK 로 알려 준
 * 변수(예전 변수 메타데이터)를 한 화면에 모아 맞춘다(지식 매칭). 탭은 상태 이름 · 화면 이동 · 게임 변수(예전 화면 그대로)다. 상태 이름은 프로젝트
 * 단위고, 게임 변수는 빌드마다 달라 빌드 고르기를 따른다. 고른 탭은 주소(`?tab=`)에 남는다.
 *
 * 게임 정보(`fact`) · 규칙(`rule`) 탭은 코딩 에이전트가 MCP 로 선언한 fact · rule 을 읽기 전용으로 보여 준다. 프로젝트 단위라 빌드 고르기와 상관없다.
 */
export function GameIdentitiesSection() {
  const { projectId, builds } = useWorkspace()
  const { t } = useI18n()
  const messages = t.gameIdentities
  const [search, setSearch] = useSearchParams()
  const requested = search.get('build')
  const selected = requested === null ? newestFirst(builds)[0] : builds.find((build) => build.id === requested)
  const tab: Tab = TABS.find((value) => value === search.get('tab')) ?? 'states'
  const [book, setBook] = useState<{ key: string; value: Loaded<GlossaryBook> }>({ key: '', value: { status: 'loading' } })
  const [variables, setVariables] = useState<{ key: string; value: GameIdentity[] }>({ key: '', value: [] })
  const [reload, setReload] = useState(0)
  const [factBook, setFactBook] = useState<{ key: string; value: Loaded<GameFactBook> }>({ key: '', value: { status: 'loading' } })
  const [factReload, setFactReload] = useState(0)
  const [focusFact, setFocusFact] = useState<string | null>(null)
  const factBookKey = `${projectId}#${factReload}`
  const bookKey = `${projectId}#${reload}`
  const selectedId = selected?.id ?? null
  // 게임 변수 탭에서 등록 · 고치면 다른 탭으로 올 때 다시 읽는다(그 탭의 표는 `GameIdentityPanel` 이 따로 읽는다).
  const variablesKey = `${projectId}#${selectedId ?? ''}#${tab === 'variables' ? 'v' : 'n'}`

  useEffect(() => {
    const controller = new AbortController()
    fetchGlossaryBook(projectId, controller.signal)
      .then((value) => setBook({ key: bookKey, value: { status: 'ready', value } }))
      .catch(() => { if (!controller.signal.aborted) setBook({ key: bookKey, value: { status: 'failed' } }) })
    return () => controller.abort()
  }, [projectId, bookKey])

  useEffect(() => {
    const controller = new AbortController()
    fetchGameFactBook(projectId, controller.signal)
      .then((value) => setFactBook({ key: factBookKey, value: { status: 'ready', value } }))
      .catch(() => { if (!controller.signal.aborted) setFactBook({ key: factBookKey, value: { status: 'failed' } }) })
    return () => controller.abort()
  }, [projectId, factBookKey])

  useEffect(() => {
    if (selectedId === null) return
    const controller = new AbortController()
    listGameIdentities(projectId, selectedId, controller.signal)
      .then((value) => setVariables({ key: variablesKey, value }))
      .catch(() => { if (!controller.signal.aborted) setVariables({ key: variablesKey, value: [] }) })
    return () => controller.abort()
  }, [projectId, selectedId, variablesKey])

  const saved = useCallback((term: GlossaryTerm) => {
    setBook((current) => current.value.status === 'ready'
      ? { ...current, value: { status: 'ready', value: { ...current.value.value, terms: current.value.value.terms.map((item) => (item.name === term.name ? term : item)) } } }
      : current)
  }, [])

  if (builds.length === 0) return (
    <section className="panel">
      <p>{messages.noBuilds}</p>
      <Link to={sectionHref(projectId, 'game-builds')}>{messages.openBuilds}</Link>
    </section>
  )

  if (selected === undefined) return (
    <section className="panel">
      <p role="alert">{messages.buildNotFound}</p>
      <Link to={sectionHref(projectId, 'game-identities')}>{messages.chooseLatestBuild}</Link>
    </section>
  )

  const m = messages.dictionary
  const loaded = book.key === bookKey ? book.value : { status: 'loading' as const }
  const shownVariables = variables.key === variablesKey ? variables.value.filter((item) => !item.deleted) : []
  const terms = loaded.status === 'ready' ? loaded.value.terms : []
  const exits = loaded.status === 'ready' ? loaded.value.exits : []
  const linked = terms.filter((term) => linkOf(term, shownVariables).kind === 'found').length
  const flagged = terms.filter((term) => term.issues.length > 0).length
  const named = terms.filter((term) => term.usedBy > 0).length
  const noWay = exits.filter((exit) => exit.by.trim().length === 0).length
  const ready = loaded.status === 'ready'
  const facts = factBook.key === factBookKey ? factBook.value : { status: 'loading' as const }
  // 게임 정보 · 규칙을 아직 못 읽었거나 읽지 못했을 때는 0 이 아니라 모른다고 보여 준다.
  const factCount = facts.status === 'ready' ? String(facts.value.facts.length) : '—'
  const ruleCount = facts.status === 'ready' ? String(facts.value.rules.length) : '—'
  const counts: Record<Tab, string> = { states: String(terms.length), exits: String(exits.length), variables: String(shownVariables.length), facts: factCount, rules: ruleCount }
  const pick = (next: Tab) => {
    const params = new URLSearchParams(search)
    if (next === 'states') params.delete('tab')
    else params.set('tab', next)
    setSearch(params, { replace: true })
  }
  const openFact = (name: string) => {
    setFocusFact(name)
    pick('facts')
  }

  return (
    <div className="section-single gd">
      <div className="gd-head">
        <p className="section-intro">{m.intro}</p>
        <div className="gi-build-toolbar">
          <BuildSwitcher builds={builds} selected={selected} onSelect={(buildId) => {
            const next = new URLSearchParams(search)
            next.set('build', buildId)
            setSearch(next)
          }} />
          <Link className="button button--secondary button--compact" to={gameBuildDetailHref(projectId, selected.id)}>{messages.openBuild}</Link>
        </div>
      </div>

      <ul className="gd-results">
        <Result icon="book" label={m.results.states} sub={m.results.statesSub(named)} value={ready ? String(terms.length) : '—'} />
        <Result
          icon="link"
          label={m.results.linked}
          sub={m.results.linkedSub(buildDisplayName(selected), shownVariables.length)}
          tone={ready && terms.length > 0 && linked === terms.length ? 'good' : undefined}
          unit={ready ? `/${terms.length}` : undefined}
          value={ready ? String(linked) : '—'}
        />
        <Result icon="alert" label={m.results.flagged} sub={m.results.flaggedSub} tone={!ready ? undefined : flagged > 0 ? 'warn' : 'good'} value={ready ? String(flagged) : '—'} />
        <Result icon="route" label={m.results.exits} sub={noWay > 0 ? m.results.exitsNoWay(noWay) : m.results.exitsSub} value={ready ? String(exits.length) : '—'} />
      </ul>

      <div aria-label={m.tabsLabel} className="qa-log-tabs gd-tabs" role="tablist">
        {TABS.map((value) => (
          <button aria-selected={tab === value} className={tab === value ? 'on' : ''} key={value} onClick={() => pick(value)} role="tab" type="button">
            {m.tabs[value]}
            <span className="gd-tab-count">{counts[value]}</span>
          </button>
        ))}
      </div>

      {tab === 'variables' ? (
        <GameIdentityPanel key={`${projectId}/${selected.id}`} projectId={projectId} buildId={selected.id} layout="table" />
      ) : tab === 'facts' || tab === 'rules' ? (
        facts.status === 'loading' ? (
          <Skeleton />
        ) : facts.status === 'failed' ? (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {m.factsLoadFailed}
            <button className="button button--secondary button--compact" onClick={() => setFactReload((value) => value + 1)} type="button">{t.testCases.glossary.retry}</button>
          </div>
        ) : tab === 'facts' ? (
          <FactTable book={facts.value} focus={focusFact} />
        ) : (
          <RuleTable book={facts.value} onOpenFact={openFact} />
        )
      ) : loaded.status === 'loading' ? (
        <Skeleton />
      ) : loaded.status === 'failed' ? (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {t.testCases.glossary.loadFailed}
          <button className="button button--secondary button--compact" onClick={() => setReload((value) => value + 1)} type="button">{t.testCases.glossary.retry}</button>
        </div>
      ) : tab === 'states' ? (
        <GlossaryStates buildName={buildDisplayName(selected)} onSaved={saved} projectId={projectId} terms={terms} variables={shownVariables} />
      ) : (
        <ExitTable exits={exits} />
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <section aria-busy="true" className="panel panel--flush gd-skeleton">
      {[0, 1, 2, 3, 4].map((row) => <span aria-hidden="true" className="skeleton-line" key={row} />)}
    </section>
  )
}

const ICONS: Record<string, string[]> = {
  book: ['M6 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-11a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2', 'M8 8h6', 'M8 12h6'],
  link: ['M9 15l6 -6', 'M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464', 'M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463'],
  alert: ['M12 9v4', 'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z', 'M12 16h.01'],
  route: ['M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0', 'M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4z', 'M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5'],
}

/** 맨 위 숫자 칸. 아이콘은 Tabler Icons(MIT) outline — 시나리오 스튜디오 아이콘과 같은 세트. */
function Result({ icon, label, value, unit, sub, tone }: { icon: string; label: string; value: string; unit?: string; sub: ReactNode; tone?: 'good' | 'warn' }) {
  return (
    <li className={tone ? `gd-result is-${tone}` : 'gd-result'}>
      <span aria-hidden="true" className="gd-result-icon">
        <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
          {ICONS[icon].map((d) => <path d={d} key={d} />)}
        </svg>
      </span>
      <span className="gd-result-text">
        <span className="gd-result-label">{label}</span>
        <span className="gd-result-value"><b>{value}</b>{unit}</span>
        <span className="gd-result-sub">{sub}</span>
      </span>
    </li>
  )
}

/** 화면 이동 탭. 어디서 → 어디로, 어떻게, 알려 준 쪽. 방법을 모르는 이동은 표시한다. */
function ExitTable({ exits }: { exits: GlossaryBook['exits'] }) {
  const { t } = useI18n()
  const m = t.gameIdentities.dictionary
  if (exits.length === 0) return (
    <section className="panel">
      <SketchEmpty body={m.exitsEmpty} compact surface sketch={<ScreenMoveSketch />} title={m.exitsEmptyTitle} />
    </section>
  )
  return (
    <section aria-label={m.tabs.exits} className="panel panel--flush">
      <div aria-label={m.tabs.exits} className="gb-table-scroll" role="region" tabIndex={0}>
        <table className="data-table gb-table gd-exits">
          <thead>
            <tr>
              <th scope="col">{m.exitRoute}</th>
              <th scope="col">{m.exitHow}</th>
              <th scope="col">{m.exitBy}</th>
            </tr>
          </thead>
          <tbody>
            {exits.map((exit) => (
              <tr key={`${exit.from}>${exit.to}`}>
                <td>
                  <span className="gd-route">
                    <b>{exit.from}</b>
                    <span aria-label={m.to} className="gd-route-arrow">→</span>
                    <b>{exit.to}</b>
                  </span>
                </td>
                <td className={exit.by ? undefined : 'table-meta'}>{exit.by || <span className="gls-flag">{m.noWay}</span>}</td>
                <td className={`gls-by gls-by--${exit.source ?? 'ai'}`}>{exit.source === null ? m.seenByQa : t.testCases.glossary.source[exit.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
