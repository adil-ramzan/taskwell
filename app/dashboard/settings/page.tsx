import type { Metadata } from "next";

import ThemeToggle from "@/components/ThemeToggle";
import AvatarPicker from "@/components/dashboard/AvatarPicker";
import DeleteAccountSection from "@/components/dashboard/DeleteAccountSection";
import FormattedDate from "@/components/dashboard/FormattedDate";
import PageIntro from "@/components/dashboard/PageIntro";
import PasswordForm from "@/components/dashboard/PasswordForm";
import ProfileForm from "@/components/dashboard/ProfileForm";
import SignOutOthersButton from "@/components/dashboard/SignOutOthersButton";
import TimeZoneForm from "@/components/dashboard/TimeZoneForm";
import TwoFactorSection from "@/components/dashboard/TwoFactorSection";
import UserAvatar from "@/components/dashboard/UserAvatar";
import { listOwnedTeamNames } from "@/lib/account-deletion";
import { supportedTimeZones } from "@/lib/account-validation";
import { requireDashboardUser } from "@/lib/dashboard";
import { getTwoFactorStatus } from "@/lib/two-factor";

export const metadata: Metadata = {
  title: "Settings",
};

const cardClass =
  "rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface";
const headerClass = "border-b border-ink/10 px-5 py-4 dark:border-white/10";
const headingClass = "font-display text-lg font-semibold text-ink dark:text-slate-50";
const introClass = "mt-1 text-sm text-muted dark:text-dark-muted";

export default async function SettingsPage() {
  // The account is always the signed-in user's; nothing here takes an ID from the URL.
  const user = await requireDashboardUser("/dashboard/settings");
  const [ownedTeams, twoFactor] = await Promise.all([listOwnedTeamNames(user.id), getTwoFactorStatus(user.id)]);

  return (
    <div className="space-y-6">
      <PageIntro title="Settings" description="Your profile, appearance and account security." />

      {/* One column on smaller screens; from xl up the forms take the wider left column and the
          shorter account details and appearance sit beside them, so the page uses the full width. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="profile-heading" className={cardClass}>
            <div className={`${headerClass} flex items-center gap-4`}>
              <UserAvatar name={user.name} email={user.email} avatar={user.avatar} />
              <div className="min-w-0">
                <h2 id="profile-heading" className={headingClass}>
                  Profile
                </h2>
                <p className={introClass}>Your picture, name and sign-in email.</p>
              </div>
            </div>
            <AvatarPicker name={user.name} email={user.email} avatar={user.avatar} />
            <ProfileForm name={user.name} email={user.email} />
          </section>

          <section aria-labelledby="security-heading" className={cardClass}>
            <div className={headerClass}>
              <h2 id="security-heading" className={headingClass}>
                Security
              </h2>
              <p className={introClass}>Change the password you log in with.</p>
            </div>
            <PasswordForm />
            <SignOutOthersButton />
            <TwoFactorSection {...twoFactor} />
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="account-heading" className={cardClass}>
            <div className={headerClass}>
              <h2 id="account-heading" className={headingClass}>
                Account
              </h2>
            </div>
            <dl className="divide-y divide-ink/10 dark:divide-white/10">
              <div className="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:gap-4 xl:grid-cols-1 xl:gap-1">
                <dt className="text-sm font-medium text-muted dark:text-dark-muted">Name</dt>
                <dd className="break-words text-ink [overflow-wrap:anywhere] dark:text-slate-50 sm:col-span-2 xl:col-span-1">{user.name}</dd>
              </div>
              <div className="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:gap-4 xl:grid-cols-1 xl:gap-1">
                <dt className="text-sm font-medium text-muted dark:text-dark-muted">Email</dt>
                <dd className="break-all text-ink dark:text-slate-50 sm:col-span-2 xl:col-span-1">{user.email}</dd>
              </div>
              <div className="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:gap-4 xl:grid-cols-1 xl:gap-1">
                <dt className="text-sm font-medium text-muted dark:text-dark-muted">Member since</dt>
                <dd className="text-ink dark:text-slate-50 sm:col-span-2 xl:col-span-1">
                  {user.createdAt ? <FormattedDate value={user.createdAt.toISOString()} timeZone={user.timeZone} /> : "Unavailable"}
                </dd>
              </div>
            </dl>
            <DeleteAccountSection email={user.email} ownedTeams={ownedTeams} twoFactorEnabled={twoFactor.enabled} />
          </section>

          <section aria-labelledby="appearance-heading" className={cardClass}>
            <div className={headerClass}>
              <h2 id="appearance-heading" className={headingClass}>
                Appearance
              </h2>
              <p className={introClass}>Light or dark (remembered in this browser), and your time zone.</p>
            </div>
            <div className="px-3 py-3">
              <ThemeToggle
                variant="switch"
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-100 dark:hover:bg-white/5"
              />
            </div>
            <div className="border-t border-ink/10 dark:border-white/10">
              <TimeZoneForm value={user.timeZone} zones={supportedTimeZones()} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
