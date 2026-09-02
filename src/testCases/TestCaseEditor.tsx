import { useId, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from '../projects/apiErrorMessage'
import { ProjectApiError } from '../projects/projectApi'
import { SpecGradeChip } from './SpecGradeChip'
import { createTestCase, updateTestCase } from './testCaseApi'
import {
  DEFAULT_VERIFICATION_STATUS,
  VERIFICATION_STATUSES,
  type TestCase,
  type TestCaseInput,
  type VerificationStatus,
} from './testCaseTypes'

type Draft = {
  scene: string
  step: string
  precondition: string
  expectedValue: string
  verificationStatus: VerificationStatus
}

const BLANK_DRAFT: Draft = {
  scene: '',
  step: '',
  precondition: '',
  expectedValue: '',
  verificationStatus: DEFAULT_VERIFICATION_STATUS,
}

function toDraft(testCase: TestCase): Draft {
  return {
    scene: testCase.scene,
    step: testCase.step,
    precondition: testCase.precondition ?? '',
    expectedValue: testCase.expectedValue,
    verificationStatus: testCase.verificationStatus,
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
  projectId,
  testCase,
  onCreated,
  onDelete,
  onDone,
  onSaved,
}: {
  projectId: string
  testCase: TestCase | null
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

  const sceneId = useId()
  const stepId = useId()
  const preconditionId = useId()
  const expectedValueId = useId()
  const verificationId = useId()

  const creating = testCase === null
  const patch = creating ? null : toPatch(draft, testCase)
  const dirty = creating || Object.keys(patch ?? {}).length > 0

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {}
    if (draft.step.trim().length === 0) errors.step = m.stepRequired
    if (draft.expectedValue.trim().length === 0) errors.expectedValue = m.expectedValueRequired
    return errors
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
        })
        onCreated(created)
        return
      }

      const saved = await updateTestCase(projectId, testCase.id, patch ?? {})
      onSaved(saved)
      setDraft(toDraft(saved))
    } catch (error: unknown) {
      if (error instanceof ProjectApiError) {
        setFieldErrors(error.fields)
        setFailure(
          Object.keys(error.fields).length > 0 ? null : apiErrorMessage(error, t),
        )
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
    <form className="tcl-editor" noValidate onSubmit={(event) => void submit(event)}>
      <header className="tcl-editor-head">
        <h3>{creating ? m.newTitle : m.editTitle}</h3>
        {!creating && <SpecGradeChip status={testCase.status} />}
      </header>

      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor={stepId}>
          {m.step} <span className="field-required" aria-hidden="true">*</span>
        </label>
        <textarea
          aria-describedby={fieldErrors.step ? `${stepId}-error` : undefined}
          aria-invalid={fieldErrors.step ? true : undefined}
          className="field-input field-input--multiline"
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

      <div className="field">
        <label className="field-label" htmlFor={expectedValueId}>
          {m.expectedValue} <span className="field-required" aria-hidden="true">*</span>
        </label>
        <textarea
          aria-describedby={fieldErrors.expectedValue ? `${expectedValueId}-error` : undefined}
          aria-invalid={fieldErrors.expectedValue ? true : undefined}
          className="field-input field-input--multiline"
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

      <div className="field">
        <label className="field-label" htmlFor={preconditionId}>{m.precondition}</label>
        <textarea
          className="field-input field-input--multiline"
          disabled={pending}
          id={preconditionId}
          onChange={(event) => setDraft({ ...draft, precondition: event.target.value })}
          placeholder={m.preconditionPlaceholder}
          value={draft.precondition}
        />
      </div>

      <div className="tcl-editor-pair">
        <div className="field">
          <label className="field-label" htmlFor={sceneId}>{m.scene}</label>
          <input
            className="field-input"
            disabled={pending}
            id={sceneId}
            onChange={(event) => setDraft({ ...draft, scene: event.target.value })}
            placeholder={m.scenePlaceholder}
            value={draft.scene}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={verificationId}>{m.verification}</label>
          <select
            className="field-input"
            disabled={pending}
            id={verificationId}
            onChange={(event) =>
              setDraft({ ...draft, verificationStatus: event.target.value as VerificationStatus })
            }
            value={draft.verificationStatus}
          >
            {VERIFICATION_STATUSES.map((status) => (
              <option key={status} value={status}>{statusLabel[status]}</option>
            ))}
          </select>
        </div>
      </div>

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
  )
}
