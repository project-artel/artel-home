export type Outcome = 'PASS' | 'FAIL' | 'INCONCLUSIVE'
export type Region = { x: number; y: number; width: number; height: number }
export type ProcedureStep = { instruction: string; target: string; completionCondition: string; evidenceEventIds: number[] }
export type ProcedureAssertion = { expected: string; failure: string; when: string; evidenceEventIds: number[] }
export type VerificationProcedure = {
  title: string
  preconditions: string[]
  steps: ProcedureStep[]
  assertions: ProcedureAssertion[]
  observedOutcome: Outcome
  facts: string[]
  inferences: string[]
  unresolvedQuestions: string[]
}
export type ProcedureRevision = {
  id: number; revision: number; status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED' | 'REVOKED'
  sourceHash: string; procedure: VerificationProcedure
}
export type DemonstrationEvent = {
  id: number; kind: 'INPUT' | 'ACTION_RESULT' | 'PULSE' | 'EVIDENCE' | 'ANNOTATION' | 'CONTROL'
  payloadJson: string; createdAt: string
}
export type DemonstrationSession = {
  id: string; projectId: number; testCaseId: number; scenarioId: number; gameInstanceId: number
  gameBuildId: number | null; status: 'RECORDING' | 'FINALIZING' | 'SEALED' | 'INTERRUPTED'
  controlReady: boolean; generation: number; sourceHash: string | null; createdAt: string
  events: DemonstrationEvent[]; procedure: ProcedureRevision | null
}
export type DemonstrationInstance = {
  id: number; name: string; gameBuildId: number | null; connected: boolean; protocolVersion: number | null
}
export type EvidenceInput = { dataUrl: string; capturedAt: string; width: number; height: number }
export type AnnotationInput = {
  outcome: Outcome; observed?: string; expected?: string; explanation?: string; evidenceEventId: number; region?: Region | null
}
export type EvidencePayload = { viewUrl?: string; width?: number; height?: number; capturedAt?: string }
export type InputMethod = 'move_mouse' | 'mouse_down' | 'mouse_up' | 'key_down' | 'key_up'
export type GameInput = { method: InputMethod; params: (number | string)[] }
export type InputCommand = GameInput & { type: 'INPUT'; sequence: number }
export type ControlReply = { type: 'READY' } | { type: 'ACK'; sequence: number; eventId: number } | { type: 'ERROR'; code: string; message: string }
