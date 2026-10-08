// Shared by the server (who gets a mention notification) and the comment UI
// (highlighting and autocomplete), so it must stay free of server-only imports.

export type MentionRange = { start: number; end: number; name: string };

const BEFORE = /[\s([{"']/;
const WORD = /[\p{L}\p{N}_]/u;

/**
 * Finds "@Name" in plain text, where Name is one of `names` (a person's full
 * name, matched without regard to case). The longest name wins, so "@Sam Lee"
 * is Sam Lee and not Sam. An "@" inside a word (an email address) is ignored.
 * Text after "@" that isn't one of the names is left alone: it mentions nobody.
 */
export function findMentions(content: string, names: string[]): MentionRange[] {
  const candidates = [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  const ranges: MentionRange[] = [];

  for (let at = content.indexOf("@"); at !== -1; at = content.indexOf("@", at + 1)) {
    if (at > 0 && !BEFORE.test(content[at - 1])) continue;

    const start = at + 1;
    const name = candidates.find((candidate) => {
      const end = start + candidate.length;

      return (
        content.slice(start, end).toLowerCase() === candidate.toLowerCase() &&
        (end >= content.length || !WORD.test(content[end]))
      );
    });

    if (name) {
      ranges.push({ start: at, end: start + name.length, name });
      at += name.length;
    }
  }

  return ranges;
}
