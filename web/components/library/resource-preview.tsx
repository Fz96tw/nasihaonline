"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KnowledgeContentType } from "@/lib/generated/prisma/enums";
import { youtubeEmbedUrl } from "@/lib/youtube";

/**
 * Renders a PDF attachment page-by-page onto a canvas via pdfjs-dist (per
 * system-design.md — not the browser's built-in PDF viewer). Non-PDF
 * document types (doc/docx/ppt/txt/scanned images — uploadKnowledgeDocument
 * accepts anything that isn't video) fall back to a download link, since
 * PDF.js only renders PDFs.
 */
function PdfPreview({ url, fileName }: { url: string; fileName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // iOS Safari silently fails to paint (and past a hard pixel ceiling,
  // errors on "Total canvas memory... exceeds the maximum limit") a canvas
  // wider than its scrollable container — desktop browsers just show a
  // horizontal scrollbar instead, which is why a fixed scale looked fine
  // there but rendered a blank canvas on iPhone. Track the container's
  // width so the render effect below can fit the page to it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
    if (status !== "ready" || !pdfRef.current || !canvasRef.current || containerWidth === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await pdfRef.current!.getPage(pageNum);
        if (cancelled) return;

        const unscaled = page.getViewport({ scale: 1 });
        let scale = Math.min(containerWidth / unscaled.width, 1.3);
        let viewport = page.getViewport({ scale });
        // Extra safety margin below iOS Safari's hard ~16,777,216px canvas
        // backing-store ceiling, for unusually large (e.g. poster-size) pages.
        const maxPixels = 4_000_000;
        if (viewport.width * viewport.height > maxPixels) {
          scale *= Math.sqrt(maxPixels / (viewport.width * viewport.height));
          viewport = page.getViewport({ scale });
        }

        const canvas = canvasRef.current!;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport, canvas }).promise;
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, pageNum, containerWidth]);

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
      {/* Always mounted (even while loading) so the ResizeObserver above has
          a container to measure before the first page render runs. */}
      <div ref={containerRef} className="max-h-[70vh] w-full overflow-auto rounded-md border bg-muted/30">
        {status === "loading" ? (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <canvas ref={canvasRef} className="mx-auto" />
        )}
      </div>
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

/**
 * Inline (non-modal) resource preview — PDF.js pager for document
 * attachments, YouTube embed for recorded lectures. Used on /library/[id];
 * previously lived inside a Dialog (ResourcePreviewDialog, now retired)
 * opened from the /library browse grid, which links to the detail page
 * instead.
 */
export function ResourcePreview({
  title,
  contentType,
  youtubeUrl,
  attachment,
}: {
  title: string;
  contentType: KnowledgeContentType;
  youtubeUrl: string | null;
  attachment: { fileName: string; mimeType: string; url: string } | null;
}) {
  const isRecordedLecture = contentType === KnowledgeContentType.recorded_lecture;
  const embedUrl = isRecordedLecture && youtubeUrl ? youtubeEmbedUrl(youtubeUrl) : null;

  if (isRecordedLecture) {
    if (embedUrl) {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-md">
          <iframe
            src={embedUrl}
            title={title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        This lecture&apos;s YouTube link couldn&apos;t be embedded.{" "}
        {youtubeUrl && (
          <a href={youtubeUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            Open on YouTube
          </a>
        )}
      </p>
    );
  }

  if (attachment) {
    return <PdfPreview url={attachment.url} fileName={attachment.fileName} />;
  }

  return <p className="py-6 text-center text-sm text-muted-foreground">No preview is available for this resource.</p>;
}
