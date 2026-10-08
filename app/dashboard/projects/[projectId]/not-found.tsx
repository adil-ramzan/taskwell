import DetailNotFound from "@/components/dashboard/DetailNotFound";

export default function ProjectNotFound() {
  return (
    <DetailNotFound
      title="Project not found"
      description="This project doesn't exist or is no longer available."
      backHref="/dashboard/projects"
      backLabel="Back to projects"
    />
  );
}
