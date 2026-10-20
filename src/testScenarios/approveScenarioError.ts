import { ProjectApiError } from '../projects/projectApi'

/** 시나리오 승인 실패의 문구. 승인 대화상자와 project agent 의 `testRunEdit.approveScenario` 가 함께 쓴다. */
export function approveScenarioFailure(error: unknown, copy: { gone: string; failed: string }): string {
  return error instanceof ProjectApiError && error.isNotFound ? copy.gone : copy.failed
}
