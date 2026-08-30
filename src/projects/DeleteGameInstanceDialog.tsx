import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { deleteGameInstance } from './gameApi'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from './projectApi'

/**
 * Deleting an instance revokes its key, and there is no re-issue endpoint: the
 * SDK install that used it stops reporting and has to be pointed at a brand new
 * instance. That is not recoverable from this UI, so — exactly as with project
 * deletion — the instance name is spelled out in the question and the
 * destructive button is second, never the one that already has focus.
 *
 * 그 배치와 실패 표시는 [ConfirmActionDialog] 가 맡는다.
 */
export function DeleteGameInstanceDialog({
  instanceId,
  instanceName,
  onClose,
  onDeleted,
  projectId,
}: {
  instanceId: string
  instanceName: string
  onClose: () => void
  onDeleted: () => void
  projectId: string
}) {
  const { t } = useI18n()

  return (
    <ConfirmActionDialog
      body={
        <>
          <strong>{instanceName}</strong>
          {t.projects.instanceDelete.confirmSuffix}
        </>
      }
      cancelLabel={t.projects.shared.cancel}
      confirmLabel={t.projects.instanceDelete.confirm}
      onClose={onClose}
      onConfirm={async () => {
        await deleteGameInstance(projectId, instanceId)
        onDeleted()
      }}
      pendingLabel={t.projects.shared.deleting}
      title={t.projects.instanceDelete.title}
      toFailureMessage={(error) =>
        error instanceof ProjectApiError && error.isForbidden
          ? t.projects.instanceDelete.forbidden
          : t.projects.instanceDelete.deleteFailed
      }
    />
  )
}
