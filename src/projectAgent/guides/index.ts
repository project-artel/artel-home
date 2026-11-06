import { accountAndKeys } from './accountAndKeys'
import { admin } from './admin'
import { buildVersions } from './buildVersions'
import { cliInstall } from './cliInstall'
import { cliRunQa } from './cliRunQa'
import { createProject } from './createProject'
import { freeScenarios } from './freeScenarios'
import { inviteMembers } from './inviteMembers'
import { mcpConnect } from './mcpConnect'
import { sdkConnect } from './sdkConnect'
import { skillsInstall } from './skillsInstall'

/**
 * agent 가 `read_guide` 로 읽는 안내 문서. project 밖에서 하는 일(SDK 연결, CLI 설치, skill 설치,
 * MCP 연결, 계정 설정 같은 것)의 절차를 담는다. 목록(id, title, summary)은 page catalog 에 실려
 * 매 step 에 가고, 본문은 agent 가 그 문서를 고를 때만 간다. ARTEL-1138 이 채운다.
 */
export type Guide = {
  id: string
  title: string
  /** model 이 이 문서를 고를지 정할 때 읽는 한 줄. */
  summary: string
  /** Markdown 본문. 링크는 console 안의 상대 경로나 공개 URL 이다. */
  body: string
}

export const GUIDES: Guide[] = [
  sdkConnect,
  cliInstall,
  cliRunQa,
  skillsInstall,
  mcpConnect,
  accountAndKeys,
  createProject,
  inviteMembers,
  admin,
  buildVersions,
  freeScenarios,
]

export function findGuide(id: string): Guide | undefined {
  return GUIDES.find((guide) => guide.id === id)
}
