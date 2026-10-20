import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from './formatters'
import {
  describeParam,
  isCatalogEmpty,
  type GameFunction,
} from './gameFunctions'
import { useGameFunctionCatalog } from './useGameFunctionCatalog'

/**
 * 한 빌드가 보고한 cheat 와 behavior 목록(ARTEL-1051).
 *
 * 빌드 행을 펼쳤을 때만 마운트되므로 요청도 그때 한 번 나간다. 읽기 전용이다 — 이 목록은 게임의 코드가
 * 등록한 것이고 여기서 고칠 수 있는 값이 없다.
 */
export function GameFunctionPanel({ buildId, projectId }: { buildId: string; projectId: string }) {
  const { t } = useI18n()
  const m = t.gameFunctions.build
  const { catalog, reload, status } = useGameFunctionCatalog(projectId, buildId)

  return (
    <section className="gf-panel" aria-label={m.title}>
      <h3 className="gf-title">{m.title}</h3>

      {status === 'loading' && <p className="gf-note">{m.loading}</p>}

      {status === 'error' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {m.loadFailed}
          <button className="button button--secondary button--compact" onClick={reload} type="button">
            {m.retry}
          </button>
        </div>
      )}

      {status === 'ready' && catalog !== null && (
        isCatalogEmpty(catalog) ? (
          <p className="gf-note">{m.empty}</p>
        ) : (
          <>
            <p className="gf-meta mono">
              <span>{m.revision(catalog.revision)}</span>
              {catalog.receivedAt !== null && <span>{m.receivedAt(formatDateTime(catalog.receivedAt))}</span>}
            </p>
            <GameFunctionGroup empty={m.noCheats} entries={catalog.cheats} title={m.cheatsTitle(catalog.cheats.length)} />
            <GameFunctionGroup empty={m.noBehaviors} entries={catalog.behaviors} title={m.behaviorsTitle(catalog.behaviors.length)} />
          </>
        )
      )}
    </section>
  )
}

function GameFunctionGroup({
  empty,
  entries,
  title,
}: {
  empty: string
  entries: GameFunction[]
  title: string
}) {
  return (
    <div className="gf-group">
      <h4 className="gf-group-title">{title}</h4>
      {entries.length === 0 ? (
        <p className="gf-note">{empty}</p>
      ) : (
        <ul className="gf-list">
          {entries.map((entry) => <GameFunctionItem entry={entry} key={entry.name} />)}
        </ul>
      )}
    </div>
  )
}

function GameFunctionItem({ entry }: { entry: GameFunction }) {
  const { t } = useI18n()
  const m = t.gameFunctions.build

  return (
    <li className="gf-item">
      <div className="gf-item-head">
        <span className="gf-name mono" translate="no">{entry.name}</span>
        {/* 대상과 그룹은 칩 글자로 말한다. 색에 기대지 않는다. */}
        <span className="gf-chip">
          {entry.targetComponent === null ? m.staticTarget : m.targetComponent(entry.targetComponent)}
        </span>
        {entry.group !== null && <span className="gf-chip">{m.group(entry.group)}</span>}
      </div>
      <p className="gf-description">{entry.description.length > 0 ? entry.description : m.noDescription}</p>
      {entry.params.length === 0 ? (
        <p className="gf-params-empty">{m.noParams}</p>
      ) : (
        <ul className="gf-params" aria-label={m.paramsLabel}>
          {entry.params.map((param) => (
            <li className="mono" key={param.name} translate="no">
              {describeParam(param)}
              {param.defaultValue !== null && (
                <span className="gf-default"> · {m.defaultValue(String(param.defaultValue))}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
