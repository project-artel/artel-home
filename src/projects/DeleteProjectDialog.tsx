import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { useI18n } from '../i18n/useI18n'
import { deleteProject, ProjectApiError } from './projectApi'

/**
 * Deletion cannot be undone from this UI — the server keeps the row, but
 * exposes no restore path — so the destructive button is never the one that
 * already has focus, and the project name is spelled out in the question.
 *
 * 버튼 배치와 실패 표시는 [ConfirmActionDialog] 가 맡는다. 여기 남는 것은 무엇을 부르고 실패를
 * 어떤 문장으로 옮길지뿐이다.
 */
export function DeleteProjectDialog({
  projectId,
  projectName,
  onClose,
  onDeleted,
}: {
  projectId: string
  projectName: string
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useI18n()

  return (
    <ConfirmActionDialog
      body={
        <>
          <strong>{projectName}</strong>
          {t.projects.deleteDialog.confirmSuffix}
        </>
      }
      cancelLabel={t.projects.shared.cancel}
      confirmLabel={t.projects.detail.deleteProject}
      onClose={onClose}
      onConfirm={async () => {
        await deleteProject(projectId)
        onDeleted()
      }}
      pendingLabel={t.projects.shared.deleting}
      title={t.projects.detail.deleteProject}
      toFailureMessage={(error) =>
        error instanceof ProjectApiError && error.isForbidden
          ? t.projects.deleteDialog.forbidden
          : t.projects.deleteDialog.deleteFailed
      }
    />
  )
}
