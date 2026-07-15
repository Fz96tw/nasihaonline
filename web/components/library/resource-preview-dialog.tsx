"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KnowledgeContentType } from "@/lib/generated/prisma/enums";

/**
 * Extracts a YouTube video id from any of the URL shapes a member might
 * paste into "Submit Resource" (watch?v=, youtu.be/, already an /embed/
 * link) — no oEmbed lookup needed, a standard iframe embed is all §4.9
 * calls for ("no custom player").
 */
function youtubeEmbedUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    let id: string | null = null;
    if (url.hostname.includes("youtu.be")) {
      id = url.pathname.slice(1);
    } else if (url.pathname.startsWith("/embed/")) {
      id = url.pathname.replace("/embed/", "");
    } else {
      id = url.searchParams.get("v");
    }
    return id ? `https://www.youtube.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

/**
 * Renders a PDF attachment page-by-page onto a canvas via pdfjs-dist (per
 * system-design.md — not the browser's built-in PDF viewer). Non-PDF
 * document types (doc/docx/ppt/txt/scanned images — uploadKnowledgeDocument
 * accepts anything that isn't video) fall back to a download link, since
 * PDF.js only renders PDFs.
 */
function PdfPreview({ url, fileName }: { url: string; fileName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | null = null;

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        // Served from public/ (scripts/copy-pdf-worker.mjs), not bundled —
        // bundling this ESM worker directly breaks webpack/Terser's client build.
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        loadingTask = pdfjsLib.getDocument({ url });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfRef.current = doc;
        setPageCount(doc.numPages);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (status !== "ready" || !pdfRef.current || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      const page = await pdfRef.current!.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.3 });
      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport, canvas }).promise;
    })();

    return () => {
      cancelled = true;
    };
  }, [status, pageNum]);

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">This file type can&apos;t be previewed here.</p>
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noreferrer" download={fileName}>
            <Download className="mr-2 h-4 w-4" />
            Download {fileName}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {status === "loading" ? (
        <div className="flex h-80 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="max-h-[70vh] w-full overflow-auto rounded-md border bg-muted/30">
          <canvas ref={canvasRef} className="mx-auto" />
        </div>
      )}
      {status === "ready" && pageCount > 1 && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageNum <= 1}
            onClick={() => setPageNum((n) => Math.max(1, n - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pageNum} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageNum >= pageCount}
            onClick={() => setPageNum((n) => Math.min(pageCount, n + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function ResourcePreviewDialog({
  open,
  onOpenChange,
  title,
  contentType,
  youtubeUrl,
  attachment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  contentType: KnowledgeContentType;
  youtubeUrl: string | null;
  attachment: { fileName: string; mimeType: string; url: string } | null;
}) {
  const isRecordedLecture = contentType === KnowledgeContentType.recorded_lecture;
  const embedUrl = isRecordedLecture && youtubeUrl ? youtubeEmbedUrl(youtubeUrl) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {isRecordedLecture ? (
          embedUrl ? (
            <div className="aspect-video w-full overflow-hidden rounded-md">
              <iframe
                src={embedUrl}
                title={title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              This lecture&apos;s YouTube link couldn&apos;t be embedded.{" "}
              {youtubeUrl && (
                <a href={youtubeUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  Open on YouTube
                </a>
              )}
            </p>
          )
        ) : attachment ? (
          <PdfPreview url={attachment.url} fileName={attachment.fileName} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No preview is available for this resource.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
