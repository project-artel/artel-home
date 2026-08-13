import { apiFetch } from '../auth/authApi'
import { ProjectApiError, readJson } from '../projects/projectApi'
import { mockBuildPerformance, mockRunPerformance } from './performanceMock'
import type { BuildPerformance, BuildPerformanceRun, PerformancePoint, PerformanceSummary, RunPerformance } from './performanceTypes'

const useMock = import.meta.env.DEV && import.meta.env.VITE_PERFORMANCE_API === 'mock'
type JsonRecord = Record<string, unknown>

function malformed(field: string): never { throw new ProjectApiError(200, `Malformed performance response: ${field}`, 'CLIENT_MALFORMED_PERFORMANCE') }
function record(value: unknown, field: string): JsonRecord { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : malformed(field) }
function number(value: unknown, field: string): number { return typeof value === 'number' && Number.isFinite(value) ? value : malformed(field) }
function string(value: unknown, field: string): string { return typeof value === 'string' ? value : malformed(field) }
function nullableNumber(value: unknown, field: string): number | null { return value === null ? null : number(value, field) }
function nullableString(value: unknown, field: string): string | null { return value === null ? null : string(value, field) }
function boolean(value: unknown, field: string): boolean { return typeof value === 'boolean' ? value : malformed(field) }

function parsePoint(value: unknown, index: number): PerformancePoint {
  const p = record(value, `series.points[${index}]`), key = `series.points[${index}]`
  return { atMs:number(p.atMs,`${key}.atMs`), frameMeanMs:nullableNumber(p.frameMeanMs,`${key}.frameMeanMs`), frameP95Ms:nullableNumber(p.frameP95Ms,`${key}.frameP95Ms`), frameMaxMs:nullableNumber(p.frameMaxMs,`${key}.frameMaxMs`), hitchCount:nullableNumber(p.hitchCount,`${key}.hitchCount`), cpuPercent:nullableNumber(p.cpuPercent,`${key}.cpuPercent`), workingSetBytes:nullableNumber(p.workingSetBytes,`${key}.workingSetBytes`), isFocused:boolean(p.isFocused,`${key}.isFocused`) }
}
function parseSummary(value: unknown): PerformanceSummary | null {
  if (value === null) return null
  const s = record(value,'summary'), gc = record(s.gcCollections,'summary.gcCollections')
  return { sampleCount:number(s.sampleCount,'summary.sampleCount'), coveredMs:number(s.coveredMs,'summary.coveredMs'), coverageRatio:number(s.coverageRatio,'summary.coverageRatio'), frameMeanMs:number(s.frameMeanMs,'summary.frameMeanMs'), frameP95Ms:number(s.frameP95Ms,'summary.frameP95Ms'), frameP99Ms:number(s.frameP99Ms,'summary.frameP99Ms'), onePercentLowFps:number(s.onePercentLowFps,'summary.onePercentLowFps'), hitchCount:number(s.hitchCount,'summary.hitchCount'), hitchesPerMinute:number(s.hitchesPerMinute,'summary.hitchesPerMinute'), budgetMs:nullableNumber(s.budgetMs,'summary.budgetMs'), cpuPercentMean:nullableNumber(s.cpuPercentMean,'summary.cpuPercentMean'), cpuPercentMax:nullableNumber(s.cpuPercentMax,'summary.cpuPercentMax'), workingSetBytesMax:nullableNumber(s.workingSetBytesMax,'summary.workingSetBytesMax'), gcCollections:{gen0:number(gc.gen0,'summary.gcCollections.gen0'),gen1:number(gc.gen1,'summary.gcCollections.gen1'),gen2:number(gc.gen2,'summary.gcCollections.gen2')}, dischargingRatio:number(s.dischargingRatio,'summary.dischargingRatio'), processSampleRatio:number(s.processSampleRatio,'summary.processSampleRatio') }
}
export function parseRunPerformance(value: unknown): RunPerformance {
  const r=record(value,'response'), series=record(r.series,'series'); if(!Array.isArray(series.points)) malformed('series.points')
  return { runId:number(r.runId,'runId'), gameInstanceId:number(r.gameInstanceId,'gameInstanceId'), gameBuildId:nullableNumber(r.gameBuildId,'gameBuildId'), startedAt:string(r.startedAt,'startedAt'), completedAt:nullableString(r.completedAt,'completedAt'), summary:parseSummary(r.summary), device:r.device===null?null:record(r.device,'device'), series:{bucketMs:number(series.bucketMs,'series.bucketMs'),points:series.points.map(parsePoint)} }
}
function parseBuildRun(value:unknown,index:number):BuildPerformanceRun { const r=record(value,`runs[${index}]`),k=`runs[${index}]`; return {runId:number(r.runId,`${k}.runId`),startedAt:string(r.startedAt,`${k}.startedAt`),durationMs:number(r.durationMs,`${k}.durationMs`),status:string(r.status,`${k}.status`),frameMeanMs:number(r.frameMeanMs,`${k}.frameMeanMs`),frameP95Ms:number(r.frameP95Ms,`${k}.frameP95Ms`),frameP99Ms:number(r.frameP99Ms,`${k}.frameP99Ms`),onePercentLowFps:number(r.onePercentLowFps,`${k}.onePercentLowFps`),hitchesPerMinute:number(r.hitchesPerMinute,`${k}.hitchesPerMinute`),budgetMs:nullableNumber(r.budgetMs,`${k}.budgetMs`),cpuPercentMean:nullableNumber(r.cpuPercentMean,`${k}.cpuPercentMean`),workingSetBytesMax:nullableNumber(r.workingSetBytesMax,`${k}.workingSetBytesMax`),coverageRatio:number(r.coverageRatio,`${k}.coverageRatio`),dischargingRatio:number(r.dischargingRatio,`${k}.dischargingRatio`),processSampleRatio:number(r.processSampleRatio,`${k}.processSampleRatio`)} }
export function parseBuildPerformance(value:unknown):BuildPerformance { const r=record(value,'response'); if(!Array.isArray(r.runs)) malformed('runs'); return {gameBuildId:number(r.gameBuildId,'gameBuildId'),projectId:number(r.projectId,'projectId'),runs:r.runs.map(parseBuildRun)} }

export async function getRunPerformance(runId:string,signal?:AbortSignal){ const value=useMock?mockRunPerformance(runId):await readJson(await apiFetch(`/api/qa-runs/${encodeURIComponent(runId)}/performance`,{signal})); return parseRunPerformance(value) }
export async function getBuildPerformance(projectId:string,buildId:string,signal?:AbortSignal){ const path=`/api/projects/${encodeURIComponent(projectId)}/game-builds/${encodeURIComponent(buildId)}/performance`; const value=useMock?mockBuildPerformance(projectId,buildId):await readJson(await apiFetch(path,{signal})); return parseBuildPerformance(value) }
