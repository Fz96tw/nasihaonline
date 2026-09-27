"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PictureInPicture2, Undo2, X } from "lucide-react";
import { MAX_TEXT_LENGTH, type PinnedShape } from "@/lib/presenter-overlay/drawing";

type DocumentPip = { requestWindow(options?: { width?: number; height?: number }): Promise<Window> };

/** Copies the page's CSS into a pop-out window so Tailwind classes render there too. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      target.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
}

const buttonClass = "rounded border border-white/20 px-2 py-0.5 text-xs text-white/80 hover:bg-white/10";

/**
 * Host-only (never drawn into the stream): the optional label for the box or ellipse the host just drew, plus the
 * list of pinned shapes with remove and undo. It lives in the host controls, and can also be popped out into a small
 * always-on-top window (Document Picture-in-Picture) so the host can type without leaving the window they are sharing.
 * Picture-in-Picture can only be opened from a click, never from a hand gesture, so the host opens it once from here.
 */
export function ShapeTextPanel({
  shapes,
  pendingId,
  onText,
  onDone,
  onRemove,
  onUndo,
}: {
  shapes: PinnedShape[];
  /** The shape just drawn that is waiting for its optional label. */
  pendingId: number | null;
  /** Puts `text` inside shape `id`. */
  onText: (id: number, text: string) => void;
  /** Closes the prompt (the shape stays, with or without text). */
  onDone: () => void;
  onRemove: (id: number) => void;
  onUndo: () => void;
}) {
  const [text, setText] = useState("");
  const textRef = useRef("");
  const previousIdRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pip, setPip] = useState<Window | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  // A new shape while the prompt is open commits what was typed for the previous one, then the prompt moves on.
  useEffect(() => {
    const previous = previousIdRef.current;
    if (previous !== null && previous !== pendingId && textRef.current.trim()) onTextRef.current(previous, textRef.current);
    previousIdRef.current = pendingId;
    textRef.current = "";
    setText("");
    if (pendingId !== null) inputRef.current?.focus();
  }, [pendingId]);

  useEffect(() => {
    if (!pip) return;
    const close = () => setPip(null);
    pip.addEventListener("pagehide", close);
    return () => pip.removeEventListener("pagehide", close);
  }, [pip]);

  useEffect(() => () => pip?.close(), [pip]);

  function change(value: string) {
    const next = value.slice(0, MAX_TEXT_LENGTH);
    textRef.current = next;
    setText(next);
  }

  function apply() {
    if (pendingId === null) return;
    const value = textRef.current;
    textRef.current = "";
    if (value.trim()) onText(pendingId, value);
    onDone();
  }

  function skip() {
    textRef.current = "";
    onDone();
  }

  async function popOut() {
    const api = (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
    if (!api) return;
    try {
      const win = await api.requestWindow({ width: 360, height: 300 });
      copyStyles(win.document);
      win.document.body.className = "bg-[#1d1d1d] p-3 text-white";
      setPip(win);
    } catch {
      // Refused (no user gesture, or blocked): the in-page prompt still works.
    }
  }

  const pipSupported = typeof window !== "undefined" && "documentPictureInPicture" in window;

  const body = (
    <div className="flex flex-col gap-2 text-xs text-white/80" data-testid="shape-text-panel">
      {pendingId !== null ? (
        <form
          className="flex flex-col gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="text-white/70" htmlFor="shape-text-input">
            Text for the shape you just drew (optional)
          </label>
          <input
            id="shape-text-input"
            ref={inputRef}
            data-testid="shape-text-input"
            value={text}
            maxLength={MAX_TEXT_LENGTH}
            autoComplete="off"
            onChange={(event) => change(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                skip();
              }
            }}
            className="rounded border border-white/20 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/60"
            placeholder="Type, then Enter"
          />
          <div className="flex gap-1">
            <button type="submit" data-testid="shape-text-apply" className={buttonClass}>
              Add text
            </button>
            <button type="button" data-testid="shape-text-skip" onClick={skip} className={buttonClass}>
              No text
            </button>
          </div>
        </form>
      ) : (
        <p className="text-white/60">Draw a box or ellipse with the L gesture, and you can label it here.</p>
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
                {shape.text || `${shape.kind === "box" ? "Box" : "Ellipse"} ${index + 1}`}
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

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-2" data-testid="shape-text">
      <div className="flex items-center justify-between gap-2 text-xs text-white/70">
        <span className="font-medium text-white">Shapes</span>
        {pipSupported && (
          <button type="button" data-testid="shape-text-popout" onClick={() => void popOut()} className={`${buttonClass} flex items-center gap-1`} title="Keep this prompt on top of the window you're sharing">
            <PictureInPicture2 className="h-3 w-3" aria-hidden /> {pip ? "Floating" : "Pop out"}
          </button>
        )}
      </div>
      {pip ? (
        <>
          <p className="text-xs text-white/60">The prompt is in the floating window.</p>
          {createPortal(body, pip.document.body)}
        </>
      ) : (
        body
      )}
    </div>
  );
}
