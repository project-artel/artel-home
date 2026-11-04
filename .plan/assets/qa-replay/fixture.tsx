import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LocaleContext } from '../../../src/i18n/LocaleContext'
import { messages } from '../../../src/i18n/messages'
import { TestCaseIdentifiersContext } from '../../../src/testCases/testCaseIdentifiers'
import { QaRunRoute } from '../../../src/qa/QaRunPage'
import '../../../src/styles/index.css'
import '../../../src/App.css'

const at = (seconds: number) => new Date(Date.UTC(2026,10,4) + seconds * 1000).toISOString()
const live = new URLSearchParams(location.search).has('live')
const notStarted = new URLSearchParams(location.search).has('not-started')
const qaTry = {id:'6',testScenarioId:'7',gameInstanceId:'3',agentSessionId:null,status:notStarted?'UNDECIDED':live?'RUNNING':'COMPLETED',stop:notStarted?{code:'not_started',provider:null,message:null}:null,startedAt:notStarted?null:at(0),completedAt:at(8),qaRunId:'2'}
const sources: EventTarget[] = []
if (live) {
  class FixtureEvents extends EventTarget { readyState=1; constructor(){super();sources.push(this)} close(){this.readyState=2} }
  Object.assign(FixtureEvents,{CLOSED:2})
  window.EventSource = FixtureEvents as unknown as typeof EventSource
  Object.assign(window,{emitQaLog:(row:unknown)=>sources.forEach(source=>source.dispatchEvent(new MessageEvent('log',{data:JSON.stringify(row)})))})
}
const run = {id:'2',testRunId:'1',gameInstanceId:'3',status:'COMPLETED',startedAt:at(0),completedAt:at(8),tries:[qaTry]}
const historyMode=new URLSearchParams(location.search).has('history')
Object.assign(window,{historyPageReads:0})
const logs = Array.from({length:historyMode?201:9},(_,index)=>{const time=historyMode?index/25:index;return {id:String(index+1),qaTryId:'6',messageId:null,correlationId:null,direction:'ORCHE_INTERNAL',type:index===2?'PULSE':'LOG',message:index===2?'Pulse relayed.':`시점 ${time}초 로그`,payload:{event:`needle-${index}`},createdAt:at(time)}})
const segment=(id:string,start:number,end:number)=>({id,startedAt:at(start),endedAt:at(end),state:'READY',url:`${location.origin}/.plan/assets/qa-replay/video.mp4`})
const attempts=[{id:'a',testCaseId:'101',startedAt:at(0.5),finishedAt:at(2.5),verdict:'PASSED'}, {id:'b',testCaseId:'102',startedAt:at(5),finishedAt:at(7),verdict:'FAILED'}, {id:'c',testCaseId:'101',startedAt:null,finishedAt:at(7.5),verdict:'INCONCLUSIVE'}].map(row=>({...row,qaTryId:'6',createdAt:row.finishedAt,logId:null,review:null,note:null}))
const mode=new URLSearchParams(location.search)
const tail = new URLSearchParams(location.search).has('tail')
const many = new URLSearchParams(location.search).has('many')
const overlap = mode.has('overlap')
const rows = overlap ? [...attempts, {...attempts[0], id:'d',startedAt:at(1),finishedAt:at(6)}, {...attempts[1],id:'e',startedAt:at(1),finishedAt:at(4)}] : many?Array.from({length:101},(_,index)=>({...attempts[0],id:`attempt-${index}`,createdAt:at(101-index)})):attempts
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
// 로컬 fixture만 사용하며 사용자 QA 데이터에는 접근하지 않는다.
window.fetch=async input=>{
 const url=new URL(String(input),location.origin);const path=url.pathname
 if(path==='/api/qa-runs/2')return response(run)
 if(path==='/api/qa-tries/6')return response(qaTry)
 if(path.endsWith('/verdicts'))return response([])
 if(path.endsWith('/logs') && historyMode){if(url.searchParams.has('beforeId')){Object.assign(window,{historyPageReads:1});return response({items:[],hasMore:false,nextBeforeId:null})}return response({items:logs,hasMore:true,nextBeforeId:'1'})}
 if(path.endsWith('/logs') && Reflect.get(window,'failNextContext')) { return response({},503) }
 if(path.endsWith('/logs'))return response({items:url.searchParams.has('beforeId')?logs.slice(0,4):logs.slice(4),hasMore:!url.searchParams.has('beforeId'),nextBeforeId:url.searchParams.has('beforeId')?null:'5'})
 if(path.endsWith('/recording') && mode.has('error') && !Reflect.get(window,'recordingRecovered')) return response({},503)


 if(path.endsWith('/recording') && mode.has('media-error') && !Reflect.get(window,'mediaRecovered'))return response({recording:{id:'recording',startedAt:at(0),endedAt:at(8),expiresAt:at(86400*30),error:null},segments:[{...segment('broken',0,8),url:location.origin+'/.plan/assets/qa-replay/missing-video.mp4'}],gaps:[]})
 if(path.endsWith('/recording') && mode.has('no-recording'))return response({recording:null,segments:[],gaps:[]})
 if(path.endsWith('/recording') && (mode.has('no-segments') || mode.has('pending')))return response({recording:{id:'recording',startedAt:at(0),endedAt:at(8),expiresAt:at(86400*30),error:null},segments:mode.has('pending')?[{...segment('pending',0,8),state:'PENDING',url:null}]:[],gaps:[]})
 if(path.endsWith('/recording') && mode.has('expired'))return response({recording:{id:'recording',startedAt:at(0),endedAt:at(8),expiresAt:at(1),error:null},segments:[],gaps:[]})
 if(path.endsWith('/recording'))return response({recording:{id:'recording',startedAt:at(0),endedAt:at(8),expiresAt:at(86400*30),error:null},segments:tail?[segment('s1',0,3)]:[segment('s1',0,3),segment('s2',5,8)],gaps:[{startedAt:at(3),endedAt:at(5),reason:'fixture gap'}]})
 if(path.endsWith('/attempts'))return response(many?(url.searchParams.has('before')?rows.slice(100):rows.slice(0,100)):rows)
 if(path.includes('/test-scenario/7'))return response({testScenarioId:7,projectId:1,payload:{title:'녹화 검증',description:'',execution_mode:'FREE',steps:[]}})
 if(path.endsWith('/test-scenario'))return response([{testScenarioId:7,title:'녹화 검증'}])
 if(path.endsWith('/changes'))return response([])
 return response({},404)
}
createRoot(document.getElementById('root')!).render(<LocaleContext.Provider value={{locale:'ko',setLocale:()=>{},t:messages.ko}}><MemoryRouter initialEntries={['/projects/1/qa-runs/2']}><TestCaseIdentifiersContext.Provider value={{projectId:'1',numbers:new Map([['101','1'],['102','2']])}}><Routes><Route path="/projects/:projectId/qa-runs/:qaRunId" element={<QaRunRoute/>}/></Routes></TestCaseIdentifiersContext.Provider></MemoryRouter></LocaleContext.Provider>)
