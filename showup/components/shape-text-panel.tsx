"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Undo2, X } from "lucide-react";
import { MAX_TEXT_LENGTH, type PinnedShape } from "@/lib/presenter-overlay/drawing";

const buttonClass = "rounded border border-white/20 px-2 py-0.5 text-xs text-white/80 hover:bg-white/10";

export type ShapePrompt = {
  /** The shape just drawn that is waiting for its optional label; null when nothing is. */
  pendingId: number | null;
  text: string;
  change: (value: string) => void;
  /** Puts the typed text inside the shape and closes the prompt. */
  apply: () => void;
  /** Closes the prompt; the shape stays, without text. */
  skip: () => void;
  inputRef: RefObject<HTMLInputElement>;
};

/**
 * The state of the optional label prompt (host-only, never drawn into the stream). It is kept by whoever owns the
 * overlay controls, not by the settings panel, so opening or closing that panel never loses a half-typed label.
 * A new shape while the prompt is open commits what was typed for the previous one, and the prompt moves on, so
 * there is only ever one prompt, for the shape drawn last.
 */
export function useShapePrompt(pendingId: number | null, onText: (id: number, text: string) => void, onDone: () => void): ShapePrompt {
  const [text, setText] = useState("");
  const textRef = useRef("");
  const previousIdRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    const previous = previousIdRef.current;
    if (previous !== null && previous !== pendingId && textRef.current.trim()) onTextRef.current(previous, textRef.current);
    previousIdRef.current = pendingId;
    textRef.current = "";
    setText("");
    if (pendingId !== null) inputRef.current?.focus();
  }, [pendingId]);

  return {
    pendingId,
    text,
    inputRef,
    change(value: string) {
      const next = value.slice(0, MAX_TEXT_LENGTH);
      textRef.current = next;
      setText(next);
    },
    apply() {
      if (pendingId === null) return;
      const value = textRef.current;
      textRef.current = "";
      if (value.trim()) onText(pendingId, value);
      onDone();
    },
    skip() {
      textRef.current = "";
      onDone();
    },
  };
}

/** The label field itself: Enter or Add text puts the text in the shape, Esc or No text leaves it plain. */
export function ShapePromptField({ prompt, compact = false }: { prompt: ShapePrompt; compact?: boolean }) {
  if (prompt.pendingId === null) return null;
  return (
    <form
      className={compact ? "flex items-center gap-1" : "flex flex-col gap-1"}
      data-testid="shape-text-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        prompt.apply();
      }}
    >
      {!compact && (
        <label className="text-xs text-white/70" htmlFor="shape-text-input">
          Text for the shape you just drew (optional)
        </label>
      )}
      <input
        id="shape-text-input"
        ref={prompt.inputRef}
        data-testid="shape-text-input"
        value={prompt.text}
        maxLength={MAX_TEXT_LENGTH}
        autoComplete="off"
        aria-label="Text for the shape you just drew (optional)"
        onChange={(event) => prompt.change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            prompt.skip();
          }
        }}
        className="min-w-0 flex-1 rounded border border-white/20 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/60"
        placeholder="Text for the shape, then Enter"
      />
      <div className="flex gap-1">
        <button type="submit" data-testid="shape-text-apply" className={buttonClass}>
          Add text
        </button>
        <button type="button" data-testid="shape-text-skip" onClick={prompt.skip} className={buttonClass}>
          No text
        </button>
      </div>
    </form>
  );
}

/**
 * Host-only (never drawn into the stream): the pinned shapes with remove and undo, and, when nothing else is showing it,
 * the label prompt. While the pop-out preview window is open the prompt shows there instead (`promptElsewhere`), so
 * it floats over the window the host is sharing and is never shown twice.
 */
export function ShapeTextPanel({
  shapes,
  prompt,
  promptElsewhere,
  onRemove,
  onUndo,
}: {
  shapes: PinnedShape[];
  prompt: ShapePrompt;
  /** The prompt is being shown in the pop-out preview window, so don't repeat it here. */
  promptElsewhere: boolean;
  onRemove: (id: number) => void;
  onUndo: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-2 text-xs text-white/80" data-testid="shape-text">
      <span className="font-medium text-white">Shapes</span>
      {prompt.pendingId !== null ? (
        promptElsewhere ? (
          <p className="text-white/60">Type the text in the pop-out preview window.</p>
        ) : (
          <ShapePromptField prompt={prompt} />
        )
      ) : (
        <p className="text-white/60">
          Draw a box or ellipse with the L gesture, and you can label it here. Arrows and stamps stay on the screen too. Use Pop out preview to keep the prompt on top of the window you&apos;re sharing.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span>Pinned shapes ({shapes.length})</span>
        <button type="button" data-testid="shape-undo" onClick={onUndo} disabled={shapes.length === 0} className={`${buttonClass} flex items-center gap-1 disabled:opacity-40`}>
          <Undo2 className="h-3 w-3" aria-hidden /> Undo last shape
        </button>
      </div>
      {shapes.length > 0 && (
        <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto" data-testid="shape-list">
          {shapes.map((shape, index) => (
            <li key={shape.id} className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1">
              <span className="min-w-0 truncate">
                {shape.text ||
                  `${shape.kind === "box" ? "Box" : shape.kind === "ellipse" ? "Ellipse" : shape.kind === "text" ? "Text stamp" : shape.kind === "note" ? "Voice note" : shape.kind === "highlight" ? "Highlight" : "Arrow"} ${index + 1}`}
              </span>
              <button type="button" aria-label="Remove this shape" data-testid={`shape-remove-${shape.id}`} onClick={() => onRemove(shape.id)} className="text-white/60 hover:text-white">
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
