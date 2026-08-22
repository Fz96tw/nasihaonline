"use client";

import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * GET-form search box for /whats-new, matching /library's and
 * /forums/[category]'s submit-on-enter convention (confirmed with user:
 * not live-as-you-type like the old header search or the Member Directory).
 * The one exception is clearing the field back to empty — that auto-
 * submits immediately rather than waiting for another button press, since
 * "go back to the unfiltered feed" isn't really a new search to type and
 * submit, it's undoing the current one.
 *
 * Ships its own clear (X) button rather than relying on the native
 * `type="search"` clear control — that control is inconsistent across
 * mobile browsers (often absent entirely), so it can't be the only way to
 * clear the field.
 */
export function FeedSearchForm({ activeType, q }: { activeType?: string; q?: string }) {
  const [value, setValue] = useState(q ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeInputRef = useRef<HTMLInputElement>(null);

  // type=inbox with no q is always a dead state (getFeedPage's inbox branch
  // only ever returns results with an active search, and the Inbox pill
  // itself is hidden without one — see whats-new/page.tsx's visiblePillTypes)
  // — every other type is a legitimate "browse this category" state when
  // search is cleared, so only inbox needs this special-case.
  function clearTypeIfInbox() {
    if (activeType === "inbox" && typeInputRef.current) typeInputRef.current.value = "";
  }

  function clear() {
    // Mutate the actual DOM input directly before submitting — setValue()
    // alone won't have reached the DOM yet by the time requestSubmit() runs
    // in this same synchronous handler (React batches the re-render), so
    // the form would otherwise still submit the old value.
    if (inputRef.current) inputRef.current.value = "";
    setValue("");
    clearTypeIfInbox();
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action="/whats-new" method="get" className="mt-2 flex gap-2">
      {activeType ? <input ref={typeInputRef} type="hidden" name="type" value={activeType} /> : null}
      <div className="relative max-w-sm flex-1">
        <Input
          ref={inputRef}
          type="search"
          name="q"
          value={value}
          placeholder="Search the feed…"
          className="pr-8 [&::-webkit-search-cancel-button]:appearance-none"
          onChange={(event) => {
            const next = event.currentTarget.value;
            setValue(next);
            if (next === "") {
              clearTypeIfInbox();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <Button type="submit" variant="outline" size="icon" aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
    </form>
  );
}
