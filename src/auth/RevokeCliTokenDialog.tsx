import { ConfirmActionDialog } from '../design-system/primitives/ConfirmActionDialog'
import { deleteCliToken } from './cliTokenApi'
import { useI18n } from '../i18n/useI18n'

/**
 * 폐기는 되돌릴 수 없다 — 이 토큰으로 부른 다음 요청은 401 이 된다. `DeleteGameInstanceDialog` 와
 * 같은 모양으로 이름을 문장에 그대로 실어 무엇을 폐기하는지 밝힌다.
 *
 * 상태 코드로 실패 문구를 가르지 않는다. `ARTEL-780` 계약에 문서화된 오류 코드가 없어서다 —
 * `endSession`, `updateMyProfile` 이 상태를 가르지 않는 것과 같은 판단이다.
 */
export function RevokeCliTokenDialog({
  onClose,
  onRevoked,
  tokenId,
  tokenName,
}: {
  onClose: () => void
  onRevoked: () => void
  tokenId: string
  tokenName: string
}) {
  const { t } = useI18n()
  const copy = t.account.cliTokens

  return (
    <ConfirmActionDialog
      body={
        <>
          <strong>{tokenName}</strong>
          {copy.revokeConfirmSuffix}
        </>
      }
      cancelLabel={copy.cancel}
      confirmLabel={copy.revoke}
      onClose={onClose}
      onConfirm={async () => {
        await deleteCliToken(tokenId)
        onRevoked()
      }}
      pendingLabel={copy.revoking}
      title={copy.revokeTitle}
      toFailureMessage={() => copy.revokeFailed}
    />
  )
}
