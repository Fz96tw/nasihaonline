"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLBAR_BUTTON_CLASSES =
  "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * "Write a Post" rich-text editor (§4.8's "Tiptap per system-design.md").
 * Emits sanitized-by-Tiptap HTML on every change via onChange — that HTML
 * is what's persisted as Post.body and rendered back on /blog/[slug]
 * through dangerouslySetInnerHTML (PostBody), same as any other
 * server-rendered rich-text field in this codebase.
 */
export function TiptapEditor({
  content,
  onChange,
  placeholder = "Write your post…",
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[240px] px-3 py-2 focus:outline-none",
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
  });

  if (!editor) return null;

  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex items-center gap-1 border-b border-input p-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(TOOLBAR_BUTTON_CLASSES, editor.isActive("bold") && "bg-muted text-foreground")}
          aria-label="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(TOOLBAR_BUTTON_CLASSES, editor.isActive("italic") && "bg-muted text-foreground")}
          aria-label="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={cn(TOOLBAR_BUTTON_CLASSES, editor.isActive("heading", { level: 2 }) && "bg-muted text-foreground")}
          aria-label="Heading"
        >
          <Heading2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(TOOLBAR_BUTTON_CLASSES, editor.isActive("bulletList") && "bg-muted text-foreground")}
          aria-label="Bullet list"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(TOOLBAR_BUTTON_CLASSES, editor.isActive("orderedList") && "bg-muted text-foreground")}
          aria-label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={cn(TOOLBAR_BUTTON_CLASSES, editor.isActive("blockquote") && "bg-muted text-foreground")}
          aria-label="Quote"
        >
          <Quote className="h-4 w-4" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
