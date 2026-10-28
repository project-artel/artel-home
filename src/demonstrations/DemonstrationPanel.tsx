import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import type { TestCase } from '../testCases/testCaseTypes'
import * as api from './api'
import { DemonstrationViewport } from './DemonstrationViewport'
import { EvidenceJudgment } from './EvidenceJudgment'
import { ProcedureEditor } from './ProcedureEditor'
import { ExtractionGate } from './extraction'
import { shouldPollDemonstration } from './sessionState'
import type { DemonstrationEvent, DemonstrationInstance, DemonstrationSession, EvidenceInput } from './types'
import './demonstrations.css'

export function DemonstrationPanel({ projectId, scenarioId, cases, gameBuildId }: {
  projectId: string; scenarioId: number; cases: TestCase[]; gameBuildId: string | null
}) {
  const { t } = useI18n()
  const [selected, setSelected] = useState('')
  const selectedCase = cases.find((testCase) => testCase.id === selected) ?? cases[0]
  return <main className="demo-panel" aria-label={t.demonstrations.title}>
    <h2>{t.demonstrations.title}</h2>
    {selectedCase ? <>
      <label>{t.demonstrations.case}<select value={selectedCase.id} onChange={(event) => setSelected(event.target.value)}>{cases.map((testCase) => <option key={testCase.id} value={testCase.id}>#{testCase.id} · {testCase.step || testCase.scene}</option>)}</select></label>
      <p className="demo-hint">{selectedCase.expectedValue}</p>
      <CaseDemonstration key={`${projectId}:${scenarioId}:${selectedCase.id}`} projectId={projectId} scenarioId={scenarioId} testCaseId={Number(selectedCase.id)} expectedResult={selectedCase.expectedValue} gameBuildId={gameBuildId} />
    </> : <p>{t.demonstrations.noCases}</p>}
  </main>
}

function CaseDemonstration({ projectId, scenarioId, testCaseId, expectedResult, gameBuildId }: {
  projectId: string; scenarioId: number; testCaseId: number; expectedResult: string; gameBuildId: string | null
}) {
  const { t } = useI18n()
  const copy = t.demonstrations
  const [instances, setInstances] = useState<DemonstrationInstance[]>([])
  const [history, setHistory] = useState<DemonstrationSession[]>([])
  const [instanceId, setInstanceId] = useState('')
  const [session, setSession] = useState<DemonstrationSession | null>(null)
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null)
  const [viewSessionId, setViewSessionId] = useState<string | null>(null)
  const [judgmentCapturePending, setJudgmentCapturePending] = useState(false)
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [autoExtractSession, setAutoExtractSession] = useState<string | null>(null)
  const operationBusy = useRef(false)
  const extraction = useRef(new ExtractionGate())
  const [extracting, setExtracting] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const describeError = useCallback((error: unknown) => error instanceof ProjectApiError && error.status === 409 ? copy.conflict : copy.failure, [copy.conflict, copy.failure])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.allSettled([
      api.listInstances(projectId, controller.signal).then(setInstances),
      api.listDemonstrations(projectId, testCaseId, controller.signal).then(setHistory),
    ]).then((results) => {
      if (!controller.signal.aborted) {
        setLoading(false)
        if (results.some((result) => result.status === 'rejected')) setFailure(copy.failure)
      }
    })
    return () => controller.abort()
  }, [projectId, testCaseId, refresh, copy.failure])

  const sessionId = session?.id
  const activeStatus = session?.status === 'RECORDING' || session?.status === 'FINALIZING'
  const shouldPoll = shouldPollDemonstration(session)
  useEffect(() => {
    if (!sessionId || !shouldPoll || busy) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const loaded = await api.getDemonstration(projectId, sessionId!, controller.signal)
        if (!controller.signal.aborted) {
          setSession((previous) => mergeSessionEvents(previous, loaded))
          if (loaded.status !== 'RECORDING') setLiveSessionId(null)
        }
      } catch {
        if (!controller.signal.aborted) { setFailure(copy.failure); setLiveSessionId(null) }
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 1000)
    }
    timer = setTimeout(() => void poll(), 1000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [projectId, sessionId, shouldPoll, busy, copy.failure])

  const extract = useCallback(async (id: string, automatic: boolean) => {
    if (operationBusy.current || !extraction.current.claim(id, automatic)) return
    operationBusy.current = true
    setBusy(true); setExtracting(true); setFailure(null)
    try {
      const procedure = await api.extractProcedure(projectId, id)
      if (mounted.current) setSession((previous) => previous?.id === id ? { ...previous, procedure } : previous)
    } catch (error) { if (mounted.current) setFailure(describeError(error)) }
    finally {
      operationBusy.current = false
      extraction.current.finish()
      if (mounted.current) { setBusy(false); setExtracting(false) }
    }
  }, [projectId, describeError])
  useEffect(() => {
    if (!busy && session && autoExtractSession === session.id && session.sourceHash !== null
      && (session.status === 'SEALED' || session.status === 'INTERRUPTED')
      && (!session.procedure || session.procedure.status === 'SUPERSEDED')) {
      const timer = setTimeout(() => void extract(session.id, true), 0)
      return () => clearTimeout(timer)
    }
  }, [autoExtractSession, session, busy, extract])

  async function mutate(action: () => Promise<void>) {
    if (operationBusy.current) return
    operationBusy.current = true
    setBusy(true); setFailure(null)
    try { await action() } catch (error) { if (mounted.current) setFailure(describeError(error)) }
    finally { operationBusy.current = false; if (mounted.current) setBusy(false) }
  }
  const interrupt = useCallback(() => {
    setLiveSessionId(null)
    setFailure(copy.interrupted)
    setRefresh((value) => value + 1)
  }, [copy.interrupted])
  const available = instances.filter((instance) => instance.connected && instance.protocolVersion === 1 && (gameBuildId === null || String(instance.gameBuildId) === gameBuildId))
  const selectedInstance = available.find((instance) => String(instance.id) === instanceId) ?? available[0]
  const evidence = session?.events.filter((event) => event.kind === 'EVIDENCE') ?? []
  const selectedEvidence = evidence.find((event) => event.id === selectedEvidenceId) ?? evidence.at(-1)
  const statusLabels = { RECORDING: copy.recording, FINALIZING: copy.finalizing, SEALED: copy.sealed, INTERRUPTED: copy.stopped }
  async function capture(input: EvidenceInput, select = true) {
    if (!session) return
    if (select) setBusy(true)
    try {
      const event = await api.saveEvidence(projectId, session.id, input)
      if (!mounted.current) return
      setSession((previous) => previous?.id === session.id ? { ...previous, events: [...previous.events.filter((entry) => entry.id !== event.id), event] } : previous)
      setSelectedEvidenceId((previous) => select ? event.id : previous ?? event.id)
      if (select) setJudgmentCapturePending(false)
      const loaded = await api.getDemonstration(projectId, session.id)
      if (mounted.current) setSession((previous) => previous?.id === session.id ? mergeSessionEvents(previous, loaded) : previous)
    } finally { if (select && mounted.current) setBusy(false) }
  }
  const reload = () => void mutate(async () => {
    setRefresh((value) => value + 1)
    if (session) setSession(await api.getDemonstration(projectId, session.id))
  })
  return <>
    <div className="demo-actions">
      {available.length > 0 ? <>
        <label>{copy.instance}<select disabled={liveSessionId !== null || busy} value={selectedInstance?.id ?? ''} onChange={(event) => setInstanceId(event.target.value)}>{available.map((instance) => <option key={instance.id} value={instance.id}>{instance.name} · {copy.build} {instance.gameBuildId ?? '—'}</option>)}</select></label>
        <button className="button button--primary demo-start" disabled={busy || activeStatus || !selectedInstance} onClick={() => void mutate(async () => {
          const created = await api.startDemonstration(projectId, testCaseId, scenarioId, selectedInstance.id)
          if (!mounted.current) { await api.stopDemonstration(projectId, created.id); return }
          setSession(created)
          setLiveSessionId(created.status === 'RECORDING' ? created.id : null)
          setViewSessionId(created.status === 'RECORDING' ? created.id : null)
          setHistory((previous) => [created, ...previous.filter((entry) => entry.id !== created.id)])
          setSelectedEvidenceId(null)
          setJudgmentCapturePending(false)
        })}>{copy.start}</button>
      </> : <p role="status">{loading ? copy.loading : copy.unavailable}</p>}
      <button className="button button--secondary" disabled={busy} onClick={reload}>{copy.refresh}</button>
    </div>
    {failure && <p role="alert" className="inline-error">{failure}</p>}
    <label>{copy.history}<select disabled={busy || liveSessionId !== null} value={session?.id ?? ''} onChange={(event) => {
      const id = event.target.value
      setViewSessionId(null)
      if (!id) { setSession(null); return }
      void mutate(async () => { setSession(await api.getDemonstration(projectId, id)); setSelectedEvidenceId(null) })
    }}><option value="">{copy.choose}</option>{history.map((entry) => <option key={entry.id} value={entry.id}>{new Date(entry.createdAt).toLocaleString()} · {statusLabels[entry.id === session?.id ? session.status : entry.status]}</option>)}</select></label>
    {!loading && history.length === 0 && <p>{copy.empty}</p>}
    {session && <>
      <p role="status">{statusLabels[session.status]}{session.status === 'INTERRUPTED' && session.sourceHash === null ? ` · ${copy.finalizing}` : ''} · TC #{session.testCaseId} · {copy.build} {session.gameBuildId ?? '—'}</p>
      {viewSessionId === session.id ? <DemonstrationViewport key={session.id} sessionId={session.id} active={liveSessionId === session.id && session.status === 'RECORDING'} instanceId={session.gameInstanceId} onInterrupted={interrupt} onFreeze={() => setJudgmentCapturePending(true)} onCapture={capture} onBoundaryCapture={(input) => capture(input, false)} busy={busy} onFinish={async () => {
        const stopped = await api.stopDemonstration(projectId, session.id)
        if (mounted.current) { setSession((previous) => previous?.id === stopped.id ? mergeSessionEvents(previous, stopped) : previous); setLiveSessionId(null); setRefresh((value) => value + 1) }
      }} /> : session.status === 'RECORDING' && <button className="button button--secondary" disabled={busy} onClick={() => void mutate(async () => setSession(await api.stopDemonstration(projectId, session.id)))}>{copy.stop}</button>}
      {evidence.length > 0 && !judgmentCapturePending && liveSessionId !== session.id && <>
        <details><summary>{copy.selectEvidence}</summary><label>{copy.selectEvidence}<select value={selectedEvidence?.id ?? ''} onChange={(event) => setSelectedEvidenceId(Number(event.target.value))}>{evidence.map((event) => <option key={event.id} value={event.id}>#{event.id} · {new Date(event.createdAt).toLocaleTimeString()}</option>)}</select></label></details>
        {selectedEvidence && <EvidenceJudgment key={selectedEvidence.id} evidence={selectedEvidence} expectedResult={expectedResult} busy={busy} onSave={(annotation) => void mutate(async () => {
          await api.saveAnnotation(projectId, session.id, annotation)
          setAutoExtractSession(session.id)
          setSession(await api.getDemonstration(projectId, session.id))
        })} />}
      </>}
      {(session.status === 'SEALED' || session.status === 'INTERRUPTED') && (!session.procedure || session.procedure.status === 'SUPERSEDED' || session.procedure.status === 'REVOKED') && <button className="button button--secondary" disabled={busy || session.sourceHash === null || !session.events.some((event) => event.kind === 'ANNOTATION')} onClick={() => void extract(session.id, false)}>{extracting ? copy.extracting : copy.extract}</button>}
      {session.procedure && <ProcedureEditor key={`${session.id}:${session.procedure.id}:${session.procedure.revision}:${session.procedure.status}`} revision={session.procedure} events={session.events} busy={busy} onSave={(draft) => void mutate(async () => {
        const procedure = await api.updateProcedure(projectId, session.id, session.procedure!.revision, draft)
        setSession((previous) => previous?.id === session.id ? { ...previous, procedure } : previous)
      })} onReview={(action) => void mutate(async () => {
        const procedure = await api.reviewProcedure(projectId, session.id, session.procedure!.revision, action)
        setSession((previous) => previous?.id === session.id ? { ...previous, procedure } : previous)
      })} />}
      {extracting && <p role="status">{copy.extracting}</p>}
      <details><summary>{copy.events}</summary><EventList events={session.events} /></details>
    </>}
  </>
}

function mergeSessionEvents(previous: DemonstrationSession | null, incoming: DemonstrationSession): DemonstrationSession {
  if (previous?.id !== incoming.id) return incoming
  const events = new Map(previous.events.map((event) => [event.id, event]))
  for (const event of incoming.events) events.set(event.id, event)
  return { ...incoming, events: [...events.values()].sort((left, right) => left.id - right.id) }
}

function EventList({ events }: { events: DemonstrationEvent[] }) {
  const { t } = useI18n()
  const copy = t.demonstrations
  const labels = { INPUT: copy.input, ACTION_RESULT: copy.result, PULSE: copy.pulse, EVIDENCE: copy.evidence, ANNOTATION: copy.annotation, CONTROL: copy.control }
  return <section><h3>{copy.events}</h3><ol className="demo-events">{events.map((event) => <li key={event.id} id={`demo-event-${event.id}`}>
    <span>#{event.id} · {new Date(event.createdAt).toLocaleTimeString()} · {labels[event.kind]}</span>
    <details><summary>{copy.raw}</summary><pre>{event.payloadJson}</pre></details>
  </li>)}</ol></section>
}
