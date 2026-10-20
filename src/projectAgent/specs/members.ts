import { listedFieldDescription } from './listedOptions'
import type { ActionSpec, FieldSpec } from '../registry/types'

/*
 * 멤버 페이지의 field 와 action 정의. 초대(invite)와 초대 취소(revoke)는 소유자에게만 binding 이 있다.
 * 멤버 제거(removeMember)는 모두에게 등록되고, 소유자가 아니면 blocked 로 막힌다.
 * 역할 변경은 이 화면에도 서버에도 없으므로 action 이 없다.
 */

const ROLES = ['OWNER', 'MEMBER']

export const MEMBERS_INVITE_TARGET_FIELD: FieldSpec = {
  name: 'members.inviteTarget',
  page: 'members',
  description:
    'The invite form\'s "who" box: an email address, or a nickname#tag of an existing account. Only the owner has this form. Setting it does not send anything.',
}

export const MEMBERS_INVITE_ROLE_FIELD: FieldSpec = {
  name: 'members.inviteRole',
  page: 'members',
  description: 'The role the invited person gets when they accept. Value is a role id; options lists them. Defaults to MEMBER.',
}

export const MEMBERS_LISTED_FIELD: FieldSpec = {
  name: 'members.listed',
  page: 'members',
  description: listedFieldDescription(
    'the project members (label is display name, nickname#tag, email and role)',
    'Use these ids as userId of members.removeMember.',
  ),
}

export const MEMBERS_INVITATIONS_FIELD: FieldSpec = {
  name: 'members.invitations',
  page: 'members',
  description: listedFieldDescription(
    'the invitations waiting for an answer (label is who was invited and the role). Only the owner sees them; empty for others',
    'Use these ids as invitationId of members.revokeInvitation.',
  ),
}

export const MEMBERS_INVITE_ACTION: ActionSpec = {
  id: 'members.invite',
  page: 'members',
  risk: 'approve',
  description:
    'Send a project invitation by email address (or nickname#tag) with a role. This emails someone outside the project, so the user approves it. Returns {sentTo}. Fails with the server message when the person is already invited or a member. Owner only.',
  args: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Email address, or nickname#tag of an existing account.' },
      role: { type: 'string', enum: ROLES, description: 'Role the person gets on accepting. Omit for MEMBER.' },
    },
    required: ['target'],
  },
  summarize: (args) => `Invite ${typeof args.target === 'string' ? args.target : 'someone'} as ${typeof args.role === 'string' ? args.role : 'MEMBER'}`,
}

export const MEMBERS_REMOVE_ACTION: ActionSpec = {
  id: 'members.removeMember',
  page: 'members',
  risk: 'approve',
  description:
    'Remove a member from the project. They lose access at once. The user approves it in place of the confirmation dialog. userId is a value of members.listed. Owner only; the last owner cannot be removed.',
  args: {
    type: 'object',
    properties: { userId: { type: 'string', description: 'Id of the member to remove.' } },
    required: ['userId'],
  },
  summarize: (args) => `Remove member ${typeof args.userId === 'string' ? args.userId : ''}`.trim(),
}

export const MEMBERS_REVOKE_ACTION: ActionSpec = {
  id: 'members.revokeInvitation',
  page: 'members',
  risk: 'approve',
  description:
    'Withdraw a pending invitation so it can no longer be accepted. The user approves it. invitationId is a value of members.invitations. Owner only.',
  args: {
    type: 'object',
    properties: { invitationId: { type: 'string', description: 'Id of the pending invitation.' } },
    required: ['invitationId'],
  },
  summarize: (args) => `Revoke invitation ${typeof args.invitationId === 'string' ? args.invitationId : ''}`.trim(),
}

export const MEMBERS_FIELDS: FieldSpec[] = [MEMBERS_INVITE_TARGET_FIELD, MEMBERS_INVITE_ROLE_FIELD, MEMBERS_LISTED_FIELD, MEMBERS_INVITATIONS_FIELD]
export const MEMBERS_ACTIONS: ActionSpec[] = [MEMBERS_INVITE_ACTION, MEMBERS_REMOVE_ACTION, MEMBERS_REVOKE_ACTION]
