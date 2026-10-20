import assert from 'node:assert/strict'
import test from 'node:test'
import { messages } from '../../i18n/messages'
import type { RunChatAnswer, RunChatQuestion, RunChatStreamEvent } from '../../testRuns/runChatApi'
import type { ChoiceOption, JobState } from '../chat/toolTypes'
import { interpretFrame, progressText } from './authoringFrames'
import { driveAuthoring, stallLimitMs, type AuthoringDependencies } from './authoringSession'
import { createFakeClock, flushMicrotasks } from './fakeClock'

const copy = () => messages.en.projectAgent.tasks

const question: RunChatQuestion = {
  id: 'q1',
  text: 'Which login screen?',
  why: null,
  options: [
    { id: 'a', label: 'Title screen', detail: null },
    { id: 'b', label: 'Settings', detail: null },
  ],
  allowFreeText: true,
}

test('progress frames read as the stage name with an optional count', () => {
  assert.equal(progressText('writing', undefined, undefined, copy().jobs), 'Writing scenarios')
  assert.equal(progressText('writing', 2, 5, copy().jobs), 'Writing scenarios (2/5)')
  assert.deepEqual(interpretFrame({ type: 'progress', stage: 'grouping', done: 1, total: 4 }, copy()), {
    kind: 'progress',
    stage: 'grouping',
    text: 'Grouping test cases (1/4)',
  })
})

test('a result frame uses the reply, or the plain message when there is no reply', () => {
  const changes = [{ action: 'created' as const, title: 'Login', scenarioId: 8 }]
  assert.deepEqual(
    interpretFrame({ type: 'result', message: 'long text', scenarios: [], reply: { result: '1 scenario saved', detail: '', changes }, refs: [] }, copy()),
    { kind: 'result', summary: '1 scenario saved', changes },
  )
  assert.deepEqual(interpretFrame({ type: 'result', message: 'Hello', scenarios: [], reply: null, refs: [] }, copy()), {
    kind: 'result',
    summary: 'Hello',
    changes: [],
  })
})

test('error, applied, draft and empty notice frames', () => {
  assert.equal(interpretFrame({ type: 'error', code: 'model_error', detail: 'boom' }, copy()).kind, 'failure')
  assert.equal(interpretFrame({ type: 'applied' }, copy()).kind, 'ignore')
  assert.equal(interpretFrame({ type: 'draft', drafts: [] }, copy()).kind, 'ignore')
  assert.equal(interpretFrame({ type: 'notice', message: '' }, copy()).kind, 'ignore')
  assert.deepEqual(interpretFrame({ type: 'question', question, refs: [] }, copy()), { kind: 'question', questions: [question] })
})

test('stall limits use the per-stage limits but never go under a minute', () => {
  assert.equal(stallLimitMs(null), 60_000)
  assert.equal(stallLimitMs('sent'), 60_000)
  assert.equal(stallLimitMs('writing'), 180_000)
  assert.equal(stallLimitMs('saved'), 60_000)
})

function harness(options: { askAnswer?: string[] | null } = {}) {
  const clock = createFakeClock()
  const sent: { message: string; answer?: RunChatAnswer }[] = []
  const jobs: JobState[] = []
  const asked: { question: string; options: ChoiceOption[] }[] = []
  let emit: (frame: RunChatStreamEvent) => void = () => undefined
  let closed = false
  let cancelled = 0
  const controller = new AbortController()
  const dependencies: AuthoringDependencies = {
    openStream: (onFrame) => {
      emit = onFrame
      return { opened: Promise.resolve(), close: () => void (closed = true) }
    },
    send: async (message, answer) => void sent.push({ message, answer }),
    cancel: async () => void (cancelled += 1),
    askChoice: async (text, choices) => {
      asked.push({ question: text, options: choices })
      return options.askAnswer === undefined ? ['b'] : options.askAnswer
    },
    upsertJob: (job) => jobs.push(job),
    clock,
    copy,
  }
  return {
    clock,
    sent,
    jobs,
    asked,
    controller,
    dependencies,
    emit: (frame: RunChatStreamEvent) => emit(frame),
    isClosed: () => closed,
    cancelled: () => cancelled,
  }
}

test('the instruction goes out once, progress frames update the card, and the result is returned', async () => {
  const h = harness()
  const outcome = driveAuthoring(h.dependencies, { runId: '3', instruction: 'Write login scenarios', signal: h.controller.signal })
  await flushMicrotasks()
  assert.deepEqual(h.sent, [{ message: 'Write login scenarios', answer: undefined }])

  h.emit({ type: 'progress', stage: 'writing', done: 1, total: 2 })
  h.emit({
    type: 'result',
    message: 'ignored',
    scenarios: [],
    reply: { result: '2 scenarios saved', detail: '', changes: [{ action: 'created', title: 'Login', scenarioId: 8 }] },
    refs: [],
  })
  const body = await outcome

  assert.deepEqual(body, {
    status: 'ok',
    result: { summary: '2 scenarios saved', changes: [{ action: 'created', title: 'Login', scenarioId: 8 }] },
  })
  assert.deepEqual(h.jobs.map((job) => [job.state, job.progress ?? job.detail]), [
    ['running', 'Writing scenarios'],
    ['running', 'Writing scenarios (1/2)'],
    ['finished', '2 scenarios saved'],
  ])
  assert.equal(h.jobs[0].key, 'author_scenarios:3')
  assert.equal(h.jobs[0].href, 'test-runs/3/edit')
  assert.equal(h.isClosed(), true)
})

test('a question goes to askChoice and the picked option is sent back as the answer', async () => {
  const h = harness({ askAnswer: ['b'] })
  const outcome = driveAuthoring(h.dependencies, { runId: '3', instruction: 'go', signal: h.controller.signal })
  await flushMicrotasks()
  h.emit({ type: 'question', question, questions: [question], refs: [] })
  await flushMicrotasks()
  // 답하는 동안 도착한 result 는 질문을 던진 턴의 것이라 끝이 아니다.
  h.emit({ type: 'result', message: 'I need to ask', scenarios: [], reply: null, refs: [] })
  await flushMicrotasks()

  assert.deepEqual(h.asked, [{ question: 'Which login screen?', options: [{ id: 'a', label: 'Title screen' }, { id: 'b', label: 'Settings' }] }])
  assert.deepEqual(h.sent.at(-1), { message: '', answer: { questionId: 'q1', optionIds: ['b'] } })

  // 같은 질문이 다시 와도 한 번만 묻는다.
  h.emit({ type: 'question', question, questions: [question], refs: [] })
  await flushMicrotasks()
  assert.equal(h.asked.length, 1)

  h.emit({ type: 'result', message: 'Done', scenarios: [], reply: { result: 'Saved', detail: '', changes: [] }, refs: [] })
  assert.equal((await outcome).status, 'ok')
})

test('stopping the conversation while a question is open cancels the turn', async () => {
  const h = harness({ askAnswer: null })
  const outcome = driveAuthoring(h.dependencies, { runId: '3', instruction: 'go', signal: h.controller.signal })
  await flushMicrotasks()
  h.emit({ type: 'question', question, questions: [question], refs: [] })
  assert.deepEqual(await outcome, { status: 'cancelled' })
  assert.equal(h.cancelled(), 1)
})

test('aborting the signal cancels the RunChat turn and closes the stream', async () => {
  const h = harness()
  const outcome = driveAuthoring(h.dependencies, { runId: '3', instruction: 'go', signal: h.controller.signal })
  await flushMicrotasks()
  h.controller.abort()
  assert.deepEqual(await outcome, { status: 'cancelled' })
  assert.equal(h.cancelled(), 1)
  assert.equal(h.isClosed(), true)
  assert.equal(h.jobs.at(-1)?.state, 'failed')
})

test('an error frame, a blocked stage and a send failure end as errors', async () => {
  const failing = harness()
  const first = driveAuthoring(failing.dependencies, { runId: '3', instruction: 'go', signal: failing.controller.signal })
  await flushMicrotasks()
  failing.emit({ type: 'error', code: 'model_error', detail: 'boom' })
  const firstBody = await first
  assert.equal(firstBody.status, 'error')
  assert.ok(firstBody.error?.includes('model_error: boom'))

  const blocked = harness()
  const second = driveAuthoring(blocked.dependencies, { runId: '3', instruction: 'go', signal: blocked.controller.signal })
  await flushMicrotasks()
  blocked.emit({ type: 'notice', message: 'The run is locked.' })
  blocked.emit({ type: 'progress', stage: 'blocked' })
  assert.deepEqual(await second, { status: 'error', error: 'The run is locked.' })

  const unsent = harness()
  unsent.dependencies.send = async () => {
    throw new Error('409')
  }
  const third = await driveAuthoring(unsent.dependencies, { runId: '3', instruction: 'go', signal: unsent.controller.signal })
  assert.equal(third.status, 'error')
})

test('silence for longer than the stage limit ends the turn and cancels it', async () => {
  const h = harness()
  const outcome = driveAuthoring(h.dependencies, { runId: '3', instruction: 'go', signal: h.controller.signal })
  await flushMicrotasks()
  h.emit({ type: 'progress', stage: 'writing' })
  await h.clock.advance(179_000)
  h.emit({ type: 'progress', stage: 'writing', done: 1, total: 2 })
  await h.clock.advance(179_000)
  await h.clock.advance(2000)
  const body = await outcome
  assert.equal(body.status, 'error')
  assert.equal(h.cancelled(), 1)
})
