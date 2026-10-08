import DetailNotFound from "@/components/dashboard/DetailNotFound";

// Also used by the team's Members and Settings pages.
export default function TeamNotFound() {
  return (
    <DetailNotFound
      title="Team not found"
      description="This team doesn't exist or you're not a member of it."
      backHref="/dashboard/teams"
      backLabel="Back to teams"
    />
  );
}
