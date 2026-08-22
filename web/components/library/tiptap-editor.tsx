"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Bold, Heading2, Italic, List, ListOrdered, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadPastedImage } from "@/lib/use-paste-image-upload";

const LIBRARY_BODY_IMAGE_UPLOAD_URL = "/api/library/body-image";

/**
 * Intercepts an image file from a paste or drop DataTransfer, uploads it,
 * and inserts a Tiptap image node at the current selection — shared by the
 * editorProps.handlePaste/handleDrop handlers below. Returns true (meaning
 * "handled") only when an image file was actually found, so Tiptap's
 * default paste/drop handling still runs for plain text/other content.
 */
function handleImageFiles(
  editorRef: React.RefObject<Editor | null>,
  files: FileList | null,
  onUploadStart: () => void,
  onUploadSettled: (error: string | null) => void,
): boolean {
  if (!files) return false;
  const file = Array.from(files).find((candidate) => candidate.type.startsWith("image/"));
  if (!file) return false;

  onUploadStart();
  void uploadPastedImage(LIBRARY_BODY_IMAGE_UPLOAD_URL, file)
    .then((url) => {
      editorRef.current?.chain().focus().setImage({ src: url }).run();
      onUploadSettled(null);
    })
    .catch((err) => {
      onUploadSettled(err instanceof Error ? err.message : "Image upload failed.");
    });

  return true;
}

const TOOLBAR_BUTTON_CLASSES =
  "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * Rich-text editor for the Library's blog_post content type (§4.9's "Tiptap
 * per system-design.md"). Emits sanitized-by-Tiptap HTML on every change via
 * onChange — that HTML is what's persisted as KnowledgeItem.body and
 * rendered back on /library/[id] via ResourcePreview's dangerouslySetInnerHTML,
 * same as any other server-rendered rich-text field in this codebase.
 */
export function TiptapEditor({
  content,
  onChange,
  placeholder = "Write your post…",
  onImageUploadStateChange,
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Notified whenever a pasted/dropped image's upload is in flight, so the parent form can disable its submit button meanwhile. */
  onImageUploadStateChange?: (uploading: boolean) => void;
}) {
  const [imageError, setImageError] = useState<string | null>(null);
  // A self-reference to the editor instance being created by the very
  // useEditor() call below (needed inside its own editorProps.handlePaste/
  // handleDrop) can't go through the `editor` const directly — TypeScript
  // can't type-check a variable referenced in its own initializer. The ref
  // is populated the moment useEditor returns, well before any real
  // paste/drop event can fire.
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ inline: false })],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[240px] px-3 py-2 focus:outline-none",
        "data-placeholder": placeholder,
      },
      handlePaste: (_view, event) => {
        return handleImageFiles(
          editorRef,
          event.clipboardData?.files ?? null,
          () => {
            setImageError(null);
            onImageUploadStateChange?.(true);
          },
          (error) => {
            setImageError(error);
            onImageUploadStateChange?.(false);
          },
        );
      },
      handleDrop: (_view, event) => {
        return handleImageFiles(
          editorRef,
          event.dataTransfer?.files ?? null,
          () => {
            setImageError(null);
            onImageUploadStateChange?.(true);
          },
          (error) => {
            setImageError(error);
            onImageUploadStateChange?.(false);
          },
        );
      },
    },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
  });

  editorRef.current = editor;

  if (!editor) return null;

  return (
    <>
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
      {imageError && <p className="mt-1 text-xs text-destructive">{imageError}</p>}
    </>
  );
}
