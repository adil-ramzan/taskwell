import { ArrowLeft, MailWarning, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import EmptyState from "@/components/dashboard/EmptyState";
import FormattedDate from "@/components/dashboard/FormattedDate";
import InvitationActions from "@/components/dashboard/InvitationActions";
import { requireDashboardUser } from "@/lib/dashboard";
import { teamRoleLabels } from "@/lib/team-validation";
import { getInvitationForUser, type InvitationProblem } from "@/lib/teams";

export const metadata: Metadata = {
  title: "Team invitation",
};

// "invalid" and "wrong-email" read the same, so a link can't be tested from another account.
const notForThisAccount = {
  title: "This invitation isn't available",
  description:
    "The link is not valid for the account you're signed in with. Check that you're signed in with the email address the invitation was sent to.",
};

const problems: Record<InvitationProblem, { title: string; description: string }> = {
  invalid: notForThisAccount,
  "wrong-email": notForThisAccount,
  expired: {
    title: "This invitation has expired",
    description: "Ask a team owner or admin to send you a new invitation.",
  },
  accepted: {
    title: "This invitation has already been used",
    description: "You can find the team on your Teams page.",
  },
};

const linkButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface";
const cardClass =
  "mx-auto max-w-lg rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface";

/** Where an invitation link lands. Signed-out visitors are sent to login first and return here. */
export default async function TeamInvitationPage({ params }: { params: { token: string } }) {
  const user = await requireDashboardUser(`/dashboard/teams/invitations/${params.token}`);
  const invitation = await getInvitationForUser(user.id, params.token);

  if ("problem" in invitation) {
    const { title, description } = problems[invitation.problem];

    return (
      <div className={cardClass}>
        <EmptyState icon={MailWarning} title={title} description={description}>
          <Link href="/dashboard/teams" className={linkButtonClass}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Go to teams
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className={`${cardClass} p-6 sm:p-8`}>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand-dark dark:bg-brand/20 dark:text-slate-100">
        <Users aria-hidden="true" className="h-6 w-6" />
      </span>
      <h1 className="mt-4 break-words font-display text-2xl font-bold text-ink dark:text-slate-50">
        Join {invitation.teamName}
      </h1>
      <p className="mb-6 mt-2 text-sm text-muted dark:text-dark-muted">
        You&apos;ve been invited to join this team as{" "}
        <span className="font-medium text-ink dark:text-slate-100">{teamRoleLabels[invitation.role]}</span>. You&apos;ll
        get access to its projects and tasks. The invitation expires <FormattedDate value={invitation.expiresAt} />.
      </p>
      <InvitationActions token={params.token} teamName={invitation.teamName} declineRedirectTo="/dashboard/teams" />
    </div>
  );
}
