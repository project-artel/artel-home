import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { readCarryOver, storeCarryOver } from './carryOverChoice'
import { generateContentMapTestCases, type GeneratedTestCases } from './generateContentMapTestCases'
import {
  classifyGenerationFailure,
  describeGenerationBlock,
  isGenerateDisabled,
  testCaseLibraryPath,
  type GenerationFailure,
} from './contentMapTestCases'
import type { ContentMapView } from './contentMapTypes'

type Generation =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; result: GeneratedTestCases }
  | { phase: 'failed'; failure: GenerationFailure }

/**
 * 적재된 content map 에서 test case 를 만드는 panel. 적재가 더는 test case 를 만들지 않으므로
 * 이 버튼이 유일한 길이다.
 *
 * 적재되지 않았으면 버튼을 비활성으로 두고, 이유를 `title` 이 아니라 문장으로 보인다.
 */
export function ContentMapTestCases({
  buildId,
  isEditor,
  projectId,
  view,
}: {
  buildId: string
  isEditor: boolean
  projectId: string
  view: ContentMapView
}) {
  const { t } = useI18n()
  const copy = t.contentMap.generate
  const [generation, setGeneration] = useState<Generation>({ phase: 'idle' })
  // 같은 tick 의 두 번째 click 은 `disabled` 가 반영되기 전에 들어올 수 있다.
  const inFlight = useRef(false)
  const [carryOver, setCarryOver] = useState(readCarryOver)

  const block = describeGenerationBlock(view, isEditor)
  const isRunning = generation.phase === 'running'

  async function generate() {
    if (inFlight.current) return
    inFlight.current = true
    setGeneration({ phase: 'running' })

    try {
      const result = await generateContentMapTestCases(projectId, buildId, carryOver)
      setGeneration({ phase: 'done', result })
    } catch (error: unknown) {
      setGeneration({ phase: 'failed', failure: classifyGenerationFailure(error) })
    } finally {
      inFlight.current = false
    }
  }

  return (
    <section aria-busy={isRunning || undefined} aria-labelledby="cm-generate-title" className="panel cm-scan">
      <header className="panel-header">
        <h2 id="cm-generate-title">{copy.title}</h2>
      </header>

      <p className="cm-scan-copy">{copy.copy}</p>

      <div className="cm-scan-actions">
        <button
          aria-describedby={block !== null ? 'cm-generate-blocked' : undefined}
          className="button button--primary"
          disabled={isGenerateDisabled(block, isRunning)}
          onClick={() => void generate()}
          type="button"
        >
          {isRunning ? copy.running : copy.action}
        </button>
        <label className="cm-generate-carry">
          <input
            checked={carryOver}
            disabled={isRunning}
            onChange={(event) => {
              setCarryOver(event.target.checked)
              storeCarryOver(event.target.checked)
            }}
            type="checkbox"
          />
          <span>
            {copy.carryOver}
            <small>{copy.carryOverHint}</small>
          </span>
        </label>
      </div>

      {block !== null && (
        <p className="cm-scan-blocked" id="cm-generate-blocked">{copy.blocked[block]}</p>
      )}

      <div className="cm-generate-result" role="status">
        {generation.phase === 'done' && (
          <>
            <p>{copy.result(generation.result)}</p>
            <Link
              className="button button--secondary button--compact"
              to={testCaseLibraryPath(projectId, generation.result.folderId)}
            >
              {copy.openLibrary}
            </Link>
          </>
        )}
      </div>

      <div role="alert">
        {generation.phase === 'failed' && (
          <div className="inline-error">
            <span aria-hidden="true">!</span>
            {copy.failure[generation.failure]}
          </div>
        )}
      </div>
    </section>
  )
}
