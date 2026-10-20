import { useId, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from '../projects/apiErrorMessage'
import { ProjectApiError } from '../projects/projectApi'
import { isCatalogEmpty } from '../projects/gameFunctions'
import { selectBuild } from '../projects/gameBuilds'
import type { GameBuild } from '../projects/gameTypes'
import { useGameFunctionCatalog } from '../projects/useGameFunctionCatalog'
import { ALL_CASE_FUNCTIONS, sameCaseFunctions, toWireCaseFunctions, type CaseFunctions } from './caseFunctions'
import { CaseFunctionsField } from './CaseFunctionsField'
import { createTestCase, updateTestCase } from './testCaseApi'
import { versionName, type TestCaseVersionSummary, type VersionGroup } from './testCaseVersions'
import { VersionTreeDialog } from './VersionTreeDialog'

/**
 * 새 케이스를 넣을 버전을 고르는 데 쓰는 것(ARTEL-1032). 버전이 있는 프로젝트에서만 준다 — 없으면 버전 칸이 없다.
 * [defaultId] 는 처음 고른 버전이고, null 이면 "버전 없음"이다.
 */
export type VersionChoice = {
  versions: readonly TestCaseVersionSummary[]
  groups: readonly VersionGroup[]
  defaultId: string | null
}
import {
  DEFAULT_VERIFICATION_STATUS,
  VERIFICATION_STATUSES,
  type TestCase,
  type TestCaseInput,
  type VerificationStatus,
} from './testCaseTypes'
import { InfoHint } from '../design-system/primitives/InfoHint'

type Draft = {
  scene: string
  step: string
  precondition: string
  expectedValue: string
  verificationStatus: VerificationStatus
  functions: CaseFunctions
}

const BLANK_DRAFT: Draft = {
  scene: '',
  step: '',
  precondition: '',
  expectedValue: '',
  verificationStatus: DEFAULT_VERIFICATION_STATUS,
  functions: ALL_CASE_FUNCTIONS,
}

function toDraft(testCase: TestCase): Draft {
  return {
    scene: testCase.scene,
    step: testCase.step,
    precondition: testCase.precondition ?? '',
    expectedValue: testCase.expectedValue,
    verificationStatus: testCase.verificationStatus,
    functions: testCase.functions ?? ALL_CASE_FUNCTIONS,
  }
}

/**
 * 서버로 보낼 변경분. 바뀐 필드만 담는다 — `PUT` 이 "받은 필드만 적용" 이라, 안 건드린 필드를
 * 같이 보내면 그 사이 다른 사람이 고친 값을 내가 읽은 옛 값으로 되돌린다.
 *
 * 빈 사전조건은 `null` 로 내보낸다. 서버가 이 필드를 nullable 로 두고 있어서, 빈 문자열은
 * "지웠다" 가 아니라 "빈 문자열을 넣었다" 로 남는다.
 */
function toPatch(draft: Draft, saved: TestCase): TestCaseInput {
  const patch: TestCaseInput = {}
  const precondition = draft.precondition.trim().length > 0 ? draft.precondition.trim() : null

  if (draft.scene.trim() !== saved.scene) patch.scene = draft.scene.trim()
  if (draft.step.trim() !== saved.step) patch.step = draft.step.trim()
  if (precondition !== saved.precondition) patch.precondition = precondition
  if (draft.expectedValue.trim() !== saved.expectedValue) {
    patch.expectedValue = draft.expectedValue.trim()
  }
  if (draft.verificationStatus !== saved.verificationStatus) {
    patch.verificationStatus = draft.verificationStatus
  }
  if (!sameCaseFunctions(draft.functions, saved.functions ?? ALL_CASE_FUNCTIONS)) {
    patch.functions = toWireCaseFunctions(draft.functions)
  }

  return patch
}

/**
 * 케이스 하나를 고치거나 새로 만드는 폼.
 *
 * `testCase` 가 `null` 이면 생성, 아니면 편집이다. 두 모양이 필드도 검증도 같아서 폼을 둘로
 * 나누면 라벨과 필수 규칙이 두 벌이 되고, 그중 하나만 고쳐지는 날이 온다.
 *
 * 부모가 `key` 로 케이스 id 를 주므로 고른 행이 바뀌면 이 컴포넌트가 다시 마운트된다.
 * 편집 중이던 draft 가 다음 케이스로 새어 나가지 않는다.
 */
export function TestCaseEditor({
  builds = [],
  knownScenes = [],
  folderId = null,
  projectId,
  testCase,
  versionChoice,
  onCreated,
  onDelete,
  onDone,
  onSaved,
}: {
  /** 빌드 목록. cheat · behavior 이름을 읽어 올 빌드를 정하는 데 쓴다(ARTEL-1051). */
  builds?: GameBuild[]
  /** Screen names already used in this project, offered as chips and as a `datalist`. */
  knownScenes?: string[]
  /** 새 케이스를 만들 폴더. 고른 케이스를 고치는 저장에는 실리지 않는다 — 저장이 폴더를 풀면 안 된다. */
  folderId?: string | null
  projectId: string
  testCase: TestCase | null
  /** 있으면 새 케이스를 넣을 버전 칸이 생긴다(ARTEL-1032). 고친 케이스의 저장에는 실리지 않는다. */
  versionChoice?: VersionChoice
  onCreated: (created: TestCase) => void
  onDelete: () => void
  onDone: () => void
  onSaved: (saved: TestCase) => void
}) {
  const { t } = useI18n()
  const m = t.testCases.editor
  const statusLabel = t.testCases.outcome

  const [draft, setDraft] = useState<Draft>(() =>
    testCase === null ? BLANK_DRAFT : toDraft(testCase),
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [versionId, setVersionId] = useState<string | null>(versionChoice?.defaultId ?? null)
  const [pickingVersion, setPickingVersion] = useState(false)
  const chosenVersion = versionChoice?.versions.find((version) => version.gameBuildId === versionId)

  const sceneId = useId()
  const stepId = useId()
  const preconditionId = useId()
  const expectedValueId = useId()
  const verificationId = useId()
  const sceneListId = useId()

  const creating = testCase === null
  // 이름은 케이스가 마지막으로 검증된 빌드, 새 케이스면 고른 버전의 catalog 에서 읽는다. 둘 다 없으면 가장 새 빌드다.
  const catalogBuild =
    builds.find((build) => build.id === (creating ? versionId : testCase.lastVerifiedBuildId)) ??
    selectBuild(builds, null)
  const functionCatalog = useGameFunctionCatalog(projectId, catalogBuild?.id ?? null)
  // catalog 가 비어 있고 이 케이스도 전부 허용이면 고를 것이 없으므로 칸을 감춘다.
  const showFunctions =
    functionCatalog.status === 'loading' ||
    (functionCatalog.catalog !== null && !isCatalogEmpty(functionCatalog.catalog)) ||
    !sameCaseFunctions(draft.functions, ALL_CASE_FUNCTIONS)
  const patch = creating ? null : toPatch(draft, testCase)
  const dirty = creating || Object.keys(patch ?? {}).length > 0

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {}
    // 화면은 서버가 반드시 받는 칸이다. 비우고 보내면 서버의 개발자용 문장("scene is required")이 그대로 보였다.
    if (draft.scene.trim().length === 0) errors.scene = m.sceneRequired
    if (draft.step.trim().length === 0) errors.step = m.stepRequired
    if (draft.expectedValue.trim().length === 0) errors.expectedValue = m.expectedValueRequired
    return errors
  }

  /**
   * 저장 실패를 사용자가 고칠 수 있는 말로 바꾼다. 서버 문장은 개발자를 위한 것이라("x is required", 영어 · 내부 이름)
   * 그대로 보이면 무엇이 문제인지 알 수 없다. 화면이 스스로 감지한 실패(`CLIENT_*`, 예: 연결 끊김)만 그 번역을 쓴다.
   */
  function failureFor(error: ProjectApiError): string {
    if (error.code !== null && error.code.startsWith('CLIENT_')) return apiErrorMessage(error, t)
    if (error.status === 400) return m.invalidInput
    if (error.status === 404) return creating ? m.targetGone : m.caseGone
    if (error.status === 403) return m.forbidden
    return m.saveFailed
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const errors = validate()
    setFieldErrors(errors)
    setFailure(null)
    if (Object.keys(errors).length > 0) return

    setPending(true)
    try {
      if (testCase === null) {
        const created = await createTestCase(projectId, {
          scene: draft.scene.trim(),
          step: draft.step.trim(),
          precondition: draft.precondition.trim().length > 0 ? draft.precondition.trim() : null,
          expectedValue: draft.expectedValue.trim(),
          verificationStatus: draft.verificationStatus,
          folderId,
          gameBuildId: versionChoice === undefined ? null : versionId,
          // 전부 허용이 기본이라 바꾸지 않았으면 보내지 않는다.
          ...(sameCaseFunctions(draft.functions, ALL_CASE_FUNCTIONS)
            ? {}
            : { functions: toWireCaseFunctions(draft.functions) }),
        })
        onCreated(created)
        return
      }

      const saved = await updateTestCase(projectId, testCase.id, patch ?? {})
      onSaved(saved)
      setDraft(toDraft(saved))
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        // 서버가 칸을 짚어 주면 그 칸에 이 화면의 문장을 단다. 서버 문장은 개발자용이라 그대로 쓰지 않는다.
        const known: Record<string, string> = { scene: m.sceneRequired, step: m.stepRequired, expectedValue: m.expectedValueRequired }
        const fields = Object.fromEntries(
          Object.keys(error.fields).filter((name) => name in known).map((name) => [name, known[name]]),
        )
        setFieldErrors(fields)
        setFailure(Object.keys(fields).length > 0 ? null : failureFor(error))
      } else {
        setFailure(m.saveFailed)
      }
    } finally {
      // 생성에 성공하면 부모가 이 컴포넌트를 새 케이스로 다시 마운트하므로, 여기서 pending 을
      // 되돌리는 것은 그 전에 실행되는 같은 렌더의 정리일 뿐이다. 실패 경로에서만 의미가 있다.
      setPending(false)
    }
  }

  return (
    <>
    <form className="tcl-editor" noValidate onSubmit={(event) => void submit(event)}>
      <header className="tcl-editor-head">
        <h3>{creating ? m.newTitle : m.editTitle}</h3>
      </header>

      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      <ol className="tce-flow">
        <li className="tce-step tce-step--pre">
          <span className="tce-marker" aria-hidden="true">1</span>
          <div className="tce-body">
            <label className="tce-label" htmlFor={preconditionId}>{m.precondition}</label>
            <textarea
              className="tce-input"
              disabled={pending}
              id={preconditionId}
              onChange={(event) => setDraft({ ...draft, precondition: event.target.value })}
              placeholder={m.preconditionPlaceholder}
              value={draft.precondition}
            />
          </div>
        </li>

        <li className="tce-step tce-step--act">
          <span className="tce-marker" aria-hidden="true">2</span>
          <div className="tce-body">
            <label className="tce-label" htmlFor={stepId}>
              {m.content}
              <span className="tce-req" aria-hidden="true">*</span>
            </label>
            <textarea
              aria-describedby={fieldErrors.step ? `${stepId}-error` : undefined}
              aria-invalid={fieldErrors.step ? true : undefined}
              className={'tce-input' + (fieldErrors.step ? ' is-bad' : '')}
              disabled={pending}
              id={stepId}
              onChange={(event) => setDraft({ ...draft, step: event.target.value })}
              placeholder={m.stepPlaceholder}
              value={draft.step}
            />
            {fieldErrors.step && (
              <p className="field-error" id={`${stepId}-error`}>{fieldErrors.step}</p>
            )}
          </div>
        </li>

        <li className="tce-step tce-step--exp">
          <span className="tce-marker" aria-hidden="true">3</span>
          <div className="tce-body">
            <label className="tce-label" htmlFor={expectedValueId}>
              {m.expectedValue}
              <span className="tce-req" aria-hidden="true">*</span>
            </label>
            <textarea
              aria-describedby={fieldErrors.expectedValue ? `${expectedValueId}-error` : undefined}
              aria-invalid={fieldErrors.expectedValue ? true : undefined}
              className={'tce-input' + (fieldErrors.expectedValue ? ' is-bad' : '')}
              disabled={pending}
              id={expectedValueId}
              onChange={(event) => setDraft({ ...draft, expectedValue: event.target.value })}
              placeholder={m.expectedValuePlaceholder}
              value={draft.expectedValue}
            />
            {fieldErrors.expectedValue && (
              <p className="field-error" id={`${expectedValueId}-error`}>{fieldErrors.expectedValue}</p>
            )}
          </div>
        </li>
      </ol>

      <div className="tce-meta">
        {creating && versionChoice !== undefined && (
          <div className="tce-field tce-field--full">
            <span className="tce-label">{m.version}<InfoHint>{m.versionHint}</InfoHint></span>
            <div className="tce-version">
              <span className={'tce-version-name' + (chosenVersion === undefined ? ' is-none' : '')}>
                {chosenVersion === undefined ? t.testCases.versions.unversioned : versionName(chosenVersion)}
              </span>
              <button
                className="button button--secondary button--compact"
                disabled={pending}
                onClick={() => setPickingVersion(true)}
                type="button"
              >
                {m.changeVersion}
              </button>
            </div>
          </div>
        )}
        <div className="tce-field">
          <label className="tce-label" htmlFor={sceneId}>{m.scene}</label>
          <input
            aria-describedby={fieldErrors.scene ? `${sceneId}-error` : undefined}
            aria-invalid={fieldErrors.scene ? true : undefined}
            className={'tce-input tce-input--one' + (fieldErrors.scene ? ' is-bad' : '')}
            disabled={pending}
            id={sceneId}
            list={sceneListId}
            onChange={(event) => setDraft({ ...draft, scene: event.target.value })}
            placeholder={m.scenePlaceholder}
            value={draft.scene}
          />
          {fieldErrors.scene && (
            <p className="field-error" id={`${sceneId}-error`}>{fieldErrors.scene}</p>
          )}
          {knownScenes.length > 0 && (
            <div className="tce-known">
              <span className="tce-known-label">{m.sceneKnown}</span>
              {knownScenes.map((name) => (
                <button
                  className={'fchip' + (draft.scene === name ? ' on' : '')}
                  disabled={pending}
                  key={name}
                  onClick={() => setDraft({ ...draft, scene: name })}
                  type="button"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <datalist id={sceneListId}>
            {knownScenes.map((name) => <option key={name} value={name} />)}
          </datalist>
        </div>

        {/* 새 케이스는 늘 미검증으로 시작한다(서버가 정한다). 만들 때 고르게 하면 고른 값이 말없이 버려졌다. */}
        {creating ? (
          <div className="tce-field">
            <span className="tce-label">{m.verification}</span>
            <p className="field-hint">{m.newCaseStatus}</p>
          </div>
        ) : (
        <div className="tce-field">
          <span className="tce-label" id={verificationId}>{m.verification}</span>
          {/* 값이 셋뿐이다. 드롭다운은 고르기 전에는 무엇이 있는지 감추는데, 셋은 다 보여도 된다. */}
          <div className="tce-seg" role="radiogroup" aria-labelledby={verificationId}>
            {VERIFICATION_STATUSES.map((status) => (
              <button
                aria-checked={draft.verificationStatus === status}
                className={'tce-seg-btn' + (draft.verificationStatus === status ? ' on' : '')}
                disabled={pending}
                key={status}
                onClick={() => setDraft({ ...draft, verificationStatus: status })}
                role="radio"
                type="button"
              >
                <span className={`vdot ${status}`} />
                {statusLabel[status]}
              </button>
            ))}
          </div>
        </div>
        )}
      </div>

      {showFunctions && (
        <CaseFunctionsField
          catalog={functionCatalog.catalog}
          disabled={pending}
          onChange={(functions) => setDraft({ ...draft, functions })}
          status={functionCatalog.status}
          value={draft.functions}
          version={catalogBuild?.version ?? null}
        />
      )}

      <div className="tcl-editor-actions">
        {/* 삭제는 저장 짝의 반대편에 둔다. 되돌릴 수 없는 버튼이 저장 옆에 붙어 있으면
            빠르게 누르다 잘못 맞힌다. */}
        {!creating && (
          <button
            className="button button--danger-quiet button--compact"
            disabled={pending}
            onClick={onDelete}
            type="button"
          >
            {m.delete}
          </button>
        )}
        <span className="tcl-editor-spacer" />
        <button
          className="button button--secondary button--compact"
          disabled={pending}
          onClick={onDone}
          type="button"
        >
          {m.cancel}
        </button>
        <button
          className="button button--primary button--compact"
          disabled={pending || !dirty}
          type="submit"
        >
          {pending
            ? creating ? m.creating : m.saving
            : creating ? m.create : m.save}
        </button>
      </div>
    </form>
    {/* 폼 밖에 둔다. dialog 는 body 로 뜨지만 React 의 submit 이벤트는 컴포넌트 트리를 따라 올라와, 폼 안에 두면
        "고르기" 가 이 편집기까지 제출했다. */}
    {pickingVersion && versionChoice !== undefined && (
      <VersionTreeDialog
        allowNone
        confirmLabel={m.pickVersion}
        groups={versionChoice.groups}
        initialId={versionId}
        onClose={() => setPickingVersion(false)}
        onConfirm={(next) => {
          setVersionId(next)
          setPickingVersion(false)
        }}
        title={m.pickVersionTitle}
        versions={versionChoice.versions}
      />
    )}
    </>
  )
}
