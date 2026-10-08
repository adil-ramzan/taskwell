import "server-only";

import { sendEmail, type EmailResult } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { teamRoleLabels, type TeamRoleValue } from "@/lib/team-validation";

export type InvitationDelivery = {
  invitationId: string;
  email: string;
  token: string;
  role: TeamRoleValue;
  expiresAt: Date;
  teamName: string;
  inviterName: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const dateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

/** The invitation email, as HTML and as plain text. The link is the existing invitation page. */
export function buildInvitationEmail(delivery: InvitationDelivery, baseUrl: string) {
  const link = `${baseUrl.replace(/\/+$/, "")}/dashboard/teams/invitations/${delivery.token}`;
  const expires = `${dateFormatter.format(delivery.expiresAt)} (UTC)`;
  const role = teamRoleLabels[delivery.role];
  const team = escapeHtml(delivery.teamName);
  const inviter = escapeHtml(delivery.inviterName);
  const address = escapeHtml(delivery.email);
  // Line breaks in a name must not reach the subject header.
  const subject = `${delivery.inviterName} invited you to join ${delivery.teamName} on Taskwell`.replace(/\s+/g, " ");

  const text = [
    `${delivery.inviterName} invited you to join the team "${delivery.teamName}" on Taskwell as ${role}.`,
    "",
    "Taskwell is where the team keeps its projects and tasks. Accepting gives you access to them.",
    "",
    "Accept the invitation:",
    link,
    "",
    `This invitation expires on ${expires} and works once.`,
    `It only works for a Taskwell account with the email address ${delivery.email}. Sign in with that address, or create an account with it first.`,
    "",
    "If you weren't expecting this, you can ignore this email: nothing happens unless you accept. Don't forward it, as the link is personal to you.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#FAFAF7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAFAF7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #E3E5EA;border-radius:16px;font-family:Inter,Arial,Helvetica,sans-serif;color:#14213D;">
            <tr>
              <td style="padding:28px 32px 0;font-size:20px;font-weight:700;color:#14213D;">
                <span style="display:inline-block;width:12px;height:12px;border-radius:4px;background-color:#2F6FED;margin-right:8px;"></span>Taskwell
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;color:#14213D;word-break:break-word;">Join ${team} on Taskwell</h1>
                <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#14213D;word-break:break-word;">
                  <strong>${inviter}</strong> invited you to join the team <strong>${team}</strong> as ${role}.
                  Taskwell is where the team keeps its projects and tasks; accepting gives you access to them.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <a href="${link}" style="display:inline-block;background-color:#2F6FED;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Accept invitation</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;font-size:13px;line-height:1.6;color:#5B6475;">
                <p style="margin:0;">This invitation expires on <strong>${expires}</strong> and works once. It only works for a Taskwell account with the email address ${address}: sign in with that address, or create an account with it first.</p>
                <p style="margin:12px 0 0;">If the button doesn't work, copy this link into your browser:</p>
                <p style="margin:4px 0 0;word-break:break-all;"><a href="${link}" style="color:#1E4FB8;">${link}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px;font-size:12px;line-height:1.6;color:#5B6475;">
                <p style="margin:0;border-top:1px solid #E3E5EA;padding-top:16px;">If you weren't expecting this, you can ignore this email: nothing happens unless you accept. Don't forward it, as the link is personal to you.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

/**
 * Sends the invitation email and, when the provider accepts it, records when.
 * Called after the invitation is saved, so a failure here leaves a valid
 * invitation that can be sent again. The link is built from NEXTAUTH_URL.
 */
export async function deliverInvitationEmail(delivery: InvitationDelivery): Promise<EmailResult> {
  const baseUrl = process.env.NEXTAUTH_URL?.trim();

  if (!baseUrl) {
    console.error("[email] Not sent: NEXTAUTH_URL is not set, so the invitation link can't be built.");
    return { sent: false, reason: "not-configured" };
  }

  const result = await sendEmail({ to: delivery.email, ...buildInvitationEmail(delivery, baseUrl) });

  if (result.sent) {
    // updateMany: the invitation may have been cancelled while the email was being sent.
    await prisma.teamInvitation.updateMany({ where: { id: delivery.invitationId }, data: { emailSentAt: new Date() } });
  }

  return result;
}
