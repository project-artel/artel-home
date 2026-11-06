import { apiFetch } from '../auth/authApi'
import { ProjectApiError, readJson } from '../projects/projectApi'
import type {
  BuildPerformance,
  BuildPerformanceRun,
  MetricGroupAvailability,
  MetricGroups,
  MetricValues,
  PerformanceDevice,
  PerformancePoint,
  PerformanceSummary,
  PointMetricGroups,
  RunPerformance,
} from './performanceTypes'

/**
 * The performance reads, parsed strictly against the confirmed contract.
 *
 * The screens draw conclusions about whether a build regressed, so a payload
 * that drifts from the contract has to surface as an error rather than as a
 * plausible-looking chart. Every fixed field is therefore checked.
 *
 * Strictness stops at the `groups` envelope. Inside a group the contract says a
 * client ignores keys it does not know, because the server deploys before the
 * screen does — a parser that threw on an unknown group would break the site on
 * every server release. So: the envelope is strict, group interiors are lenient.
 */

type JsonRecord = Record<string, unknown>

function malformed(field: string): never {
  throw new ProjectApiError(
    200,
    `Malformed performance response: ${field}`,
    'CLIENT_MALFORMED_PERFORMANCE',
  )
}

function record(value: unknown, field: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) malformed(field)

  return value as JsonRecord
}

function number(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) malformed(field)

  return value
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string') malformed(field)

  return value
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') malformed(field)

  return value
}

function nullableNumber(value: unknown, field: string): number | null {
  return value === null ? null : number(value, field)
}

function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : string(value, field)
}

/** Device fields degrade to null instead of failing the read. See `PerformanceDevice`. */
function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/**
 * A group's metric tree, taken as it comes.
 *
 * Non-finite numbers and values that are neither number nor object are dropped
 * rather than raised: an unknown group is by definition something this build was
 * never written against, so there is no contract here to violate.
 */
function readMetrics(value: unknown): MetricValues {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const out: MetricValues = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number') {
      if (Number.isFinite(entry)) out[key] = entry
    } else if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      out[key] = readMetrics(entry)
    }
  }

  return out
}

const AVAILABILITIES: MetricGroupAvailability[] = ['MEASURED', 'UNSUPPORTED', 'NOT_REPORTED']

/**
 * `availability` is the one field inside a group that is checked.
 *
 * It is the group's own envelope: the screen decides what to draw from it, and an
 * unrecognised value would silently become "nothing to show" — which reads the
 * same as a measured-empty group. An unknown state degrades to `NOT_REPORTED`
 * rather than throwing, so a future fourth state does not break the page.
 */
function readAvailability(value: unknown): MetricGroupAvailability {
  return AVAILABILITIES.find((state) => state === value) ?? 'NOT_REPORTED'
}

function parseGroups(value: unknown, field: string): MetricGroups {
  if (value === undefined || value === null) return {}

  const groups = record(value, field)
  const out: MetricGroups = {}
  for (const [name, raw] of Object.entries(groups)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const group = raw as JsonRecord
    const availability = readAvailability(group.availability)
    out[name] = {
      availability,
      sampleRatio: typeof group.sampleRatio === 'number' && Number.isFinite(group.sampleRatio)
        ? group.sampleRatio
        : 0,
      // Values only mean something under MEASURED. Carrying them otherwise would
      // let an unsupported group render as if it had been read.
      metrics: availability === 'MEASURED' ? readMetrics(group.metrics) : null,
      source: typeof group.source === 'string' ? group.source : null,
    }
  }

  return out
}

function parsePointGroups(value: unknown): PointMetricGroups {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const out: PointMetricGroups = {}
  for (const [name, raw] of Object.entries(value)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    out[name] = { metrics: readMetrics((raw as JsonRecord).metrics) }
  }

  return out
}

function parsePoint(value: unknown, index: number): PerformancePoint {
  const key = `series.points[${index}]`
  const point = record(value, key)

  return {
    atMs: number(point.atMs, `${key}.atMs`),
    frameMeanMs: nullableNumber(point.frameMeanMs, `${key}.frameMeanMs`),
    frameP95Ms: nullableNumber(point.frameP95Ms, `${key}.frameP95Ms`),
    frameMaxMs: nullableNumber(point.frameMaxMs, `${key}.frameMaxMs`),
    hitchCount: nullableNumber(point.hitchCount, `${key}.hitchCount`),
    cpuPercent: nullableNumber(point.cpuPercent, `${key}.cpuPercent`),
    workingSetBytes: nullableNumber(point.workingSetBytes, `${key}.workingSetBytes`),
    isFocused: boolean(point.isFocused, `${key}.isFocused`),
    groups: parsePointGroups(point.groups),
  }
}

/** Null for a run the SDK never reported a sample for. Not an error. */
function parseSummary(value: unknown): PerformanceSummary | null {
  if (value === null) return null

  const summary = record(value, 'summary')
  const gc = record(summary.gcCollections, 'summary.gcCollections')

  return {
    sampleCount: number(summary.sampleCount, 'summary.sampleCount'),
    coveredMs: number(summary.coveredMs, 'summary.coveredMs'),
    coverageRatio: number(summary.coverageRatio, 'summary.coverageRatio'),
    frameMeanMs: number(summary.frameMeanMs, 'summary.frameMeanMs'),
    frameP95Ms: number(summary.frameP95Ms, 'summary.frameP95Ms'),
    frameP99Ms: number(summary.frameP99Ms, 'summary.frameP99Ms'),
    onePercentLowFps: number(summary.onePercentLowFps, 'summary.onePercentLowFps'),
    hitchCount: number(summary.hitchCount, 'summary.hitchCount'),
    hitchesPerMinute: number(summary.hitchesPerMinute, 'summary.hitchesPerMinute'),
    budgetMs: nullableNumber(summary.budgetMs, 'summary.budgetMs'),
    cpuPercentMean: nullableNumber(summary.cpuPercentMean, 'summary.cpuPercentMean'),
    cpuPercentMax: nullableNumber(summary.cpuPercentMax, 'summary.cpuPercentMax'),
    workingSetBytesMax: nullableNumber(summary.workingSetBytesMax, 'summary.workingSetBytesMax'),
    gcCollections: {
      gen0: number(gc.gen0, 'summary.gcCollections.gen0'),
      gen1: number(gc.gen1, 'summary.gcCollections.gen1'),
      gen2: number(gc.gen2, 'summary.gcCollections.gen2'),
    },
    dischargingRatio: number(summary.dischargingRatio, 'summary.dischargingRatio'),
    processSampleRatio: number(summary.processSampleRatio, 'summary.processSampleRatio'),
    groups: parseGroups(summary.groups, 'summary.groups'),
  }
}

function parseDevice(value: unknown): PerformanceDevice | null {
  if (value === null || value === undefined) return null

  const device = record(value, 'device')

  return {
    isEditor: optionalBoolean(device.isEditor),
    scriptingBackend: optionalString(device.scriptingBackend),
    sdkVersion: optionalString(device.sdkVersion),
    deviceModel: optionalString(device.deviceModel),
    processorType: optionalString(device.processorType),
    processorCount: optionalNumber(device.processorCount),
    graphicsDeviceName: optionalString(device.graphicsDeviceName),
    graphicsDeviceType: optionalString(device.graphicsDeviceType),
    operatingSystem: optionalString(device.operatingSystem),
    targetFrameRate: optionalNumber(device.targetFrameRate),
    vSyncCount: optionalNumber(device.vSyncCount),
    refreshRateHz: optionalNumber(device.refreshRateHz),
  }
}

export function parseRunPerformance(value: unknown): RunPerformance {
  const run = record(value, 'response')
  const series = record(run.series, 'series')

  if (!Array.isArray(series.points)) malformed('series.points')

  return {
    runId: number(run.runId, 'runId'),
    gameInstanceId: number(run.gameInstanceId, 'gameInstanceId'),
    gameBuildId: nullableNumber(run.gameBuildId, 'gameBuildId'),
    startedAt: string(run.startedAt, 'startedAt'),
    completedAt: nullableString(run.completedAt, 'completedAt'),
    summary: parseSummary(run.summary),
    device: parseDevice(run.device),
    series: {
      bucketMs: number(series.bucketMs, 'series.bucketMs'),
      // The server already downsampled these. Order and spacing stay as sent.
      points: series.points.map(parsePoint),
    },
  }
}

function parseBuildRun(value: unknown, index: number): BuildPerformanceRun {
  const key = `runs[${index}]`
  const run = record(value, key)

  return {
    runId: number(run.runId, `${key}.runId`),
    startedAt: string(run.startedAt, `${key}.startedAt`),
    durationMs: number(run.durationMs, `${key}.durationMs`),
    status: string(run.status, `${key}.status`),
    frameMeanMs: number(run.frameMeanMs, `${key}.frameMeanMs`),
    frameP95Ms: number(run.frameP95Ms, `${key}.frameP95Ms`),
    frameP99Ms: number(run.frameP99Ms, `${key}.frameP99Ms`),
    onePercentLowFps: number(run.onePercentLowFps, `${key}.onePercentLowFps`),
    hitchesPerMinute: number(run.hitchesPerMinute, `${key}.hitchesPerMinute`),
    budgetMs: nullableNumber(run.budgetMs, `${key}.budgetMs`),
    cpuPercentMean: nullableNumber(run.cpuPercentMean, `${key}.cpuPercentMean`),
    workingSetBytesMax: nullableNumber(run.workingSetBytesMax, `${key}.workingSetBytesMax`),
    coverageRatio: number(run.coverageRatio, `${key}.coverageRatio`),
    dischargingRatio: number(run.dischargingRatio, `${key}.dischargingRatio`),
    processSampleRatio: number(run.processSampleRatio, `${key}.processSampleRatio`),
    groups: parseGroups(run.groups, `${key}.groups`),
  }
}

export function parseBuildPerformance(value: unknown): BuildPerformance {
  const build = record(value, 'response')

  if (!Array.isArray(build.runs)) malformed('runs')

  return {
    gameBuildId: number(build.gameBuildId, 'gameBuildId'),
    projectId: number(build.projectId, 'projectId'),
    runs: build.runs.map(parseBuildRun),
  }
}

export async function getRunPerformance(
  runId: string,
  signal?: AbortSignal,
): Promise<RunPerformance> {
  const path = `/api/qa-runs/${encodeURIComponent(runId)}/performance`

  return parseRunPerformance(await readJson(await apiFetch(path, { signal })))
}

export async function getBuildPerformance(
  projectId: string,
  buildId: string,
  signal?: AbortSignal,
): Promise<BuildPerformance> {
  const path = `/api/projects/${encodeURIComponent(projectId)}/game-builds/${encodeURIComponent(buildId)}/performance`

  return parseBuildPerformance(await readJson(await apiFetch(path, { signal })))
}
