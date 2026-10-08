import DetailNotFound from "@/components/dashboard/DetailNotFound";

export default function TaskNotFound() {
  return (
    <DetailNotFound
      title="Task not found"
      description="This task doesn't exist or is no longer available."
      backHref="/dashboard/tasks"
      backLabel="Back to tasks"
    />
  );
}
