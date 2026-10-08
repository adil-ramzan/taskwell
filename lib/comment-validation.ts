// Shared by the API routes and the comment form, so it must stay free of server-only imports.
export const COMMENT_MAX_LENGTH = 2000;

export function validateCommentInput(body: unknown): { data: { content: string } } | { error: string } {
  const value = body && typeof body === "object" && !Array.isArray(body) ? (body as { content?: unknown }).content : null;
  const content = typeof value === "string" ? value.trim() : "";

  if (!content) {
    return { error: "Write a comment first." };
  }

  if (content.length > COMMENT_MAX_LENGTH) {
    return { error: `Comment must be ${COMMENT_MAX_LENGTH} characters or fewer.` };
  }

  return { data: { content } };
}
