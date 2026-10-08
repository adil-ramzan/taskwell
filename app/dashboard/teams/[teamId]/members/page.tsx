import { LogOut, MailX, Trash2, X } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ConfirmDeleteButton from "@/components/dashboard/ConfirmDeleteButton";
import EmptyState from "@/components/dashboard/EmptyState";
import FormattedDate from "@/components/dashboard/FormattedDate";
import InviteMemberForm from "@/components/dashboard/InviteMemberForm";
import MemberRoleSelect from "@/components/dashboard/MemberRoleSelect";
import ResendInvitationButton from "@/components/dashboard/ResendInvitationButton";
import TeamHeader from "@/components/dashboard/TeamHeader";
import TeamRoleBadge from "@/components/dashboard/TeamRoleBadge";
import UserAvatar from "@/components/dashboard/UserAvatar";
import { deleteIconButtonClass } from "@/components/dashboard/detail-styles";
import { requireDashboardUser } from "@/lib/dashboard";
import { canChangeMemberRole, canManageTeam, canRemoveMember, teamRoleLabels } from "@/lib/team-validation";
import { getTeamForUser, listTeamInvitations, listTeamMembersForUser } from "@/lib/teams";

export const metadata: Metadata = {
  title: "Team members",
};

const cardClass =
  "rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface";
const headingClass = "font-display text-lg font-semibold text-ink dark:text-slate-50";
const strongClass = "font-semibold text-ink dark:text-slate-50";

export default async function TeamMembersPage({ params }: { params: { teamId: string } }) {
  const user = await requireDashboardUser(`/dashboard/teams/${params.teamId}/members`);
  // Each query checks the session user's membership; invitations are null unless
  // the user is an owner or admin.
  const [team, members, invitations] = await Promise.all([
    getTeamForUser(user.id, params.teamId),
    listTeamMembersForUser(user.id, params.teamId),
    listTeamInvitations(user.id, params.teamId),
  ]);

  if (!team || !members) {
    notFound();
  }

  const canManage = canManageTeam(team.role);

  return (
    <div className="space-y-6">
      <TeamHeader team={team} active="members" />

      <section aria-labelledby="members-heading" className="space-y-3">
        <h2 id="members-heading" className={headingClass}>
          Members <span className="text-sm font-normal text-muted dark:text-dark-muted">({members.length})</span>
        </h2>
        <div className={`${cardClass} overflow-hidden`}>
          {/* Below md each row is laid out as a stacked card (no sideways scrolling); from md up
              it is a regular table. relative keeps the visually hidden labels inside the card. */}
          <div className="relative overflow-x-auto">
            <table className="block w-full border-collapse text-left text-sm md:table md:min-w-[680px]">
              <caption className="sr-only">Team members</caption>
              <thead className="hidden bg-paper text-xs font-medium text-muted dark:bg-dark-background dark:text-dark-muted md:table-header-group">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium sm:px-5">Member</th>
                  <th scope="col" className="px-4 py-3 font-medium">Role</th>
                  <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                  <th scope="col" className="px-4 py-3 font-medium sm:pr-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="block divide-y divide-ink/10 dark:divide-white/10 md:table-row-group">
                {members.map((member) => (
                  <tr
                    key={member.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-4 align-middle md:table-row md:p-0"
                  >
                    <th
                      scope="row"
                      className="block w-full min-w-0 text-left font-normal md:table-cell md:w-auto md:px-5 md:py-3"
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar name={member.name} email={member.email} avatar={member.avatar} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink dark:text-slate-50 md:max-w-[16rem]">
                            {member.name}
                            {member.isSelf && (
                              <span className="font-normal text-muted dark:text-dark-muted"> (you)</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted dark:text-dark-muted md:max-w-[16rem]">
                            {member.email}
                          </p>
                        </div>
                      </div>
                    </th>
                    <td className="block md:table-cell md:px-4 md:py-3">
                      {/* The column heading is hidden on mobile, so name the value there. */}
                      <span className="sr-only md:hidden">Role: </span>
                      {member.role !== "OWNER" && canChangeMemberRole(team.role, member) ? (
                        <MemberRoleSelect
                          teamId={team.id}
                          memberId={member.id}
                          memberName={member.name}
                          role={member.role}
                        />
                      ) : (
                        <TeamRoleBadge role={member.role} />
                      )}
                    </td>
                    <td className="order-last block w-full text-xs text-muted dark:text-dark-muted md:order-none md:table-cell md:w-auto md:whitespace-nowrap md:px-4 md:py-3 md:text-sm">
                      <span className="md:hidden">Joined </span>
                      <FormattedDate value={member.joinedAt} />
                    </td>
                    <td className="ml-auto block md:table-cell md:px-4 md:py-3 md:pr-5">
                      <div className="flex justify-end">
                        {canRemoveMember(team.role, member) &&
                          (member.isSelf ? (
                            <ConfirmDeleteButton
                              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-medium text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-white/15 dark:text-dark-muted dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                              title="Leave team"
                              noun="team"
                              verb="leave"
                              endpoint={`/api/teams/${team.id}/members/${member.id}`}
                              redirectTo="/dashboard/teams"
                              description={
                                <>
                                  <p>
                                    Leave <strong className={strongClass}>{team.name}</strong>?
                                  </p>
                                  <p>
                                    You&apos;ll lose access to this team&apos;s projects and tasks. To come back
                                    you&apos;ll need a new invitation.
                                  </p>
                                </>
                              }
                            >
                              <LogOut aria-hidden="true" className="h-4 w-4" />
                              Leave
                            </ConfirmDeleteButton>
                          ) : (
                            <ConfirmDeleteButton
                              className={deleteIconButtonClass}
                              title="Remove member"
                              noun="member"
                              verb="remove"
                              endpoint={`/api/teams/${team.id}/members/${member.id}`}
                              description={
                                <>
                                  <p>
                                    Remove <strong className={strongClass}>{member.name}</strong> ({member.email})
                                    from {team.name}?
                                  </p>
                                  <p>They&apos;ll lose access to this team&apos;s projects and tasks.</p>
                                </>
                              }
                            >
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                              <span className="sr-only">Remove {member.name}</span>
                            </ConfirmDeleteButton>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {members.length === 1 && (
          <p className="text-sm text-muted dark:text-dark-muted">
            {canManage
              ? "You're the only member so far. Invite someone below to share this team's projects."
              : "You're the only member so far."}
          </p>
        )}
        {team.role === "OWNER" && (
          <p className="text-sm text-muted dark:text-dark-muted">
            As the owner you can&apos;t leave or be removed; ownership transfer isn&apos;t available yet.
          </p>
        )}
      </section>

      {canManage && invitations && (
        <>
          <section aria-labelledby="invite-heading" className={`${cardClass} p-5`}>
            <h2 id="invite-heading" className={headingClass}>
              Invite someone
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted dark:text-dark-muted">
              We&apos;ll email them an invitation link. They need a Taskwell account with this email address to
              accept, and can create one from the link.
            </p>
            <InviteMemberForm teamId={team.id} />
          </section>

          <section aria-labelledby="pending-heading" className="space-y-3">
            <h2 id="pending-heading" className={headingClass}>
              Pending invitations{" "}
              <span className="text-sm font-normal text-muted dark:text-dark-muted">({invitations.length})</span>
            </h2>
            <div className={cardClass}>
              {invitations.length === 0 ? (
                <EmptyState
                  icon={MailX}
                  title="No pending invitations"
                  description="Invitations you send appear here until they're accepted, declined or cancelled."
                />
              ) : (
                <ul className="divide-y divide-ink/10 dark:divide-white/10">
                  {invitations.map((invitation) => (
                    <li key={invitation.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="break-all text-sm font-medium text-ink dark:text-slate-50">{invitation.email}</p>
                        <p className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                          {teamRoleLabels[invitation.role]} ·{" "}
                          {invitation.expired ? (
                            <span className="font-medium text-red-700 dark:text-red-300">Expired</span>
                          ) : (
                            <>
                              Expires <FormattedDate value={invitation.expiresAt} />
                            </>
                          )}{" "}
                          ·{" "}
                          {invitation.emailSentAt ? (
                            <>
                              Emailed <FormattedDate value={invitation.emailSentAt} />
                            </>
                          ) : (
                            <span className="font-medium text-amber-700 dark:text-accent">Email not sent</span>
                          )}
                        </p>
                      </div>
                      {!invitation.expired && (
                        <ResendInvitationButton
                          teamId={team.id}
                          invitationId={invitation.id}
                          email={invitation.email}
                          sent={invitation.emailSentAt !== null}
                        />
                      )}
                      <ConfirmDeleteButton
                        className={deleteIconButtonClass}
                        title="Cancel invitation"
                        noun="invitation"
                        verb="cancel"
                        endpoint={`/api/teams/${team.id}/invitations/${invitation.id}`}
                        description={
                          <>
                            <p>
                              Cancel the invitation for <strong className={strongClass}>{invitation.email}</strong>?
                            </p>
                            <p>Its link will stop working.</p>
                          </>
                        }
                      >
                        <X aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">Cancel invitation for {invitation.email}</span>
                      </ConfirmDeleteButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
