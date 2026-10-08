"use client";

import { Fragment, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { findMentions } from "@/lib/mentions";

const MAX_SUGGESTIONS = 6;
const BEFORE_AT = /[\s([{"']/;

/** The "@text" being typed just before the caret, if any. */
function activeQuery(value: string, caret: number) {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");

  if (at === -1 || (at > 0 && !BEFORE_AT.test(before[at - 1]))) {
    return null;
  }

  const query = before.slice(at + 1);

  return query.length > 50 || query.includes("\n") ? null : { at, query: query.toLowerCase() };
}

interface MentionTextareaProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** The people who can be mentioned on this task. Empty turns suggestions off. */
  names: string[];
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
  "aria-describedby"?: string;
}

/**
 * A plain textarea that suggests names after "@". It only helps with typing:
 * the text stays plain, and the server alone decides who a comment notifies.
 */
export default function MentionTextarea({ id, value, onChange, names, ...textareaProps }: MentionTextareaProps) {
  const listId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [highlighted, setHighlighted] = useState(0);
  // The "@" position the user closed the list for with Escape.
  const [dismissed, setDismissed] = useState<number | null>(null);
  // Where to put the caret once a chosen name has been written into the textarea.
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null) {
      ref.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);

  const active = names.length > 0 ? activeQuery(value, caret) : null;
  const suggestions =
    active && active.at !== dismissed
      ? names
          .filter((name) => {
            const lower = name.toLowerCase();

            return lower.startsWith(active.query) || lower.split(/\s+/).some((part) => part.startsWith(active.query));
          })
          .slice(0, MAX_SUGGESTIONS)
      : [];
  const open = active !== null && suggestions.length > 0;
  const current = Math.min(highlighted, suggestions.length - 1);

  function choose(name: string) {
    if (!active) {
      return;
    }

    const inserted = `@${name} `;
    const position = active.at + inserted.length;

    pendingCaret.current = position;
    onChange(value.slice(0, active.at) + inserted + value.slice(caret));
    setCaret(position);
    setHighlighted(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(suggestions[current]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDismissed(active.at);
    }
  }

  return (
    <div className="relative">
      <textarea
        {...textareaProps}
        ref={ref}
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
          setHighlighted(0);
          setDismissed(null);
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
        role={names.length > 0 ? "combobox" : undefined}
        aria-autocomplete={names.length > 0 ? "list" : undefined}
        aria-expanded={names.length > 0 ? open : undefined}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${current}` : undefined}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="People you can mention"
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-ink/15 bg-white py-1 shadow-lg dark:border-white/15 dark:bg-dark-surface sm:right-auto sm:min-w-64 sm:max-w-full"
        >
          {suggestions.map((name, index) => (
            <li
              key={name}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              // mousedown, so the textarea keeps focus.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(name);
              }}
              onMouseEnter={() => setHighlighted(index)}
              className={`flex min-h-10 cursor-pointer items-center truncate px-3 text-sm ${
                index === current
                  ? "bg-brand/10 text-ink dark:bg-brand/25 dark:text-slate-50"
                  : "text-ink dark:text-slate-100"
              }`}
            >
              <span className="truncate">@{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Comment text with the "@Name" parts that match `names` emphasised. Still plain text. */
export function renderMentions(content: string, names: string[]): ReactNode {
  const mentions = findMentions(content, names);

  if (mentions.length === 0) {
    return content;
  }

  const parts: ReactNode[] = [];
  let position = 0;

  for (const mention of mentions) {
    parts.push(<Fragment key={`t${position}`}>{content.slice(position, mention.start)}</Fragment>);
    parts.push(
      <span
        key={`m${mention.start}`}
        className="rounded bg-brand/10 px-0.5 font-medium text-brand-dark dark:bg-brand/25 dark:text-slate-50"
      >
        {content.slice(mention.start, mention.end)}
      </span>,
    );
    position = mention.end;
  }

  parts.push(<Fragment key="end">{content.slice(position)}</Fragment>);

  return parts;
}
