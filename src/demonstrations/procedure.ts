import type { VerificationProcedure } from './types'

export function procedureDraftValid(procedure: VerificationProcedure, eventIds: number[]): boolean {
  const referencesValid = (ids: number[]) => ids.length > 0 && ids.every((id) => eventIds.includes(id))
  return procedure.title.trim().length > 0 && procedure.title.length <= 500
    && procedure.steps.length <= 100 && procedure.assertions.length <= 50
    && (procedure.unresolvedQuestions.length > 0 || (procedure.steps.length > 0 && procedure.assertions.length > 0))
    && procedure.steps.every((step) => step.instruction.trim() && step.completionCondition.trim() && referencesValid(step.evidenceEventIds))
    && procedure.assertions.every((assertion) => assertion.expected.trim() && assertion.failure.trim() && assertion.when.trim() && referencesValid(assertion.evidenceEventIds))
}
export function procedureApprovable(procedure: VerificationProcedure, eventIds: number[]): boolean {
  return procedureDraftValid(procedure, eventIds) && procedure.unresolvedQuestions.length === 0
}
export function textLines(text: string): string[] { return text.split('\n').map((line) => line.trim()).filter(Boolean) }
