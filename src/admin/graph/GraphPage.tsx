import { useEffect, useId, useMemo, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { KnowledgeGraphContent, type KnowledgeGraphDiagnostics } from '../../knowledge/KnowledgeGraphPage'
import { KNOWLEDGE_NODE_LIMIT } from '../../knowledge/knowledgeTypes'
import { useKnowledgeGraph } from '../../knowledge/useKnowledgeGraph'
import { UnauthorizedError } from '../shared/adminApi'
import { adminFormat } from '../shared/format'
import { ProjectPicker } from '../shared/projects/ProjectPicker'
import { listProjects, type ProjectSummary } from '../shared/projects/projectsApi'
import './graph.css'
import { InfoHint } from '../../design-system/primitives/InfoHint'

/**
 * 지식창고 그래프.
 *
 * 지표 화면과 나란히 서지만 묻는 것이 다르다 — 지표는 "지식이 쓸모 있나"를, 여기는 "지식이 서로
 * 어떻게 얽혀 있나"를 묻는다. 그래서 기간도 축도 없고, 대신 그래프 한 장이 전부다.
 *
 * The drawing, inspector and legend are the project route's own (`src/knowledge`);
 * this screen adds a project picker, a node limit, and the diagnostics only an
 * administrator needs: legend counts, the dropped-edge notice and the relation
 * table.
 */

/** 그래프가 읽히는 한계 안에서 고르게 한다. 기본값은 서버 기본값과 같다. */
const NODE_LIMITS = [100, 200, 500]

export default function GraphPage() {
  const { t } = useI18n()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [projectsFailed, setProjectsFailed] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [nodeLimit, setNodeLimit] = useState(KNOWLEDGE_NODE_LIMIT)

  useEffect(() => {
    const controller = new AbortController()
    listProjects(controller.signal)
      .then((items) => {
        setProjects(items)
        setProjectId((current) => current ?? items[0]?.id ?? null)
      })
      .catch((cause: unknown) => {
        // A 401 has already signed the user out; this screen is about to go away.
        if (controller.signal.aborted || cause instanceof UnauthorizedError) return
        setProjects([])
        setProjectsFailed(true)
      })
    return () => controller.abort()
  }, [])

  const toolbar = {
    projects,
    projectId,
    nodeLimit,
    onProjectChange: setProjectId,
    onNodeLimitChange: setNodeLimit,
  }

  return (
    <div className="shell">
      {projectId === null ? (
        <>
          <GraphToolbar {...toolbar} />
          <main className="main">
            {projectsFailed && (
              <div className="notice notice--critical" role="alert">
                <p className="notice__title">{t.admin.states.loadFailed}</p>
              </div>
            )}
            {projects?.length === 0 && !projectsFailed && (
              <div className="notice">{t.adminGraph.noProjects}</div>
            )}
          </main>
        </>
      ) : (
        <ProjectGraph {...toolbar} projectId={projectId} />
      )}
    </div>
  )
}

type ToolbarProps = {
  projects: ProjectSummary[] | null
  projectId: string | null
  nodeLimit: number
  onProjectChange: (projectId: string) => void
  onNodeLimitChange: (nodeLimit: number) => void
}

/** The read lives here, below the picker, because the hook needs a project to read. */
function ProjectGraph(props: ToolbarProps & { projectId: string }) {
  const { t, locale } = useI18n()
  const { graph, status, reload } = useKnowledgeGraph(props.projectId, props.nodeLimit)
  const diagnostics = useMemo<KnowledgeGraphDiagnostics>(
    () => ({ formatCount: adminFormat(locale).count }),
    [locale],
  )

  return (
    <>
      <GraphToolbar {...props} />
      <main className="main">
        <section aria-labelledby="graph-title" className="kg-admin-graph">
          <div className="section__head">
            <h2 className="section__title" id="graph-title">
              {t.adminGraph.graph.title}
              <InfoHint>{t.adminGraph.graph.note}</InfoHint>
            </h2>
          </div>
          <KnowledgeGraphContent
            diagnostics={diagnostics}
            graph={graph}
            projectId={props.projectId}
            reload={reload}
            status={status}
          />
        </section>
      </main>
    </>
  )
}

function GraphToolbar({
  projects,
  projectId,
  nodeLimit,
  onProjectChange,
  onNodeLimitChange,
}: ToolbarProps) {
  const { t, locale } = useI18n()
  const limitFieldId = useId()
  const format = adminFormat(locale)

  return (
    <header className="topbar">
      <ProjectPicker onChange={onProjectChange} projects={projects} value={projectId} />

      <span className="field">
        <label className="field__label" htmlFor={limitFieldId}>
          {t.adminGraph.toolbar.nodeLimitLabel}
        </label>
        <select
          className="control"
          id={limitFieldId}
          onChange={(event) => onNodeLimitChange(Number(event.target.value))}
          value={String(nodeLimit)}
        >
          {NODE_LIMITS.map((limit) => (
            <option key={limit} value={limit}>
              {t.adminGraph.toolbar.nodeLimitOption(format.count(limit))}
            </option>
          ))}
        </select>
      </span>
    </header>
  )
}
