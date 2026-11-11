import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  Download,
  RotateCw,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { pdfjsLib } from '../utils/pdfHelper';

interface SipPdfViewerProps {
  url: string;
  title?: string;
  className?: string;
}

export const SipPdfViewer: React.FC<SipPdfViewerProps> = ({
  url,
  title = 'Dokument',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const currentRenderTaskRef = useRef<any>(null);
  const basePageSizeRef = useRef<{ width: number; height: number } | null>(null);

  // 1. PDF laden (via fetch als Blob/ArrayBuffer, um CSP/Iframe-Restriktionen zu umgehen)
  useEffect(() => {
    let isCancelled = false;
    let createdBlobUrl: string | null = null;

    async function loadPdf() {
      setIsLoading(true);
      setError(null);
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Download fehlgeschlagen (HTTP ${response.status}: ${response.statusText})`);
        }

        const buffer = await response.arrayBuffer();
        if (isCancelled) return;

        const blob = new Blob([buffer], { type: 'application/pdf' });
        createdBlobUrl = URL.createObjectURL(blob);
        setBlobUrl(createdBlobUrl);

        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(buffer.slice(0)),
          useSystemFonts: true,
        });

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);

        // Basis-Seitengröße für Fit-to-Width ermitteln
        try {
          const firstPage = await doc.getPage(1);
          const vp = firstPage.getViewport({ scale: 1.0 });
          basePageSizeRef.current = { width: vp.width, height: vp.height };

          // Wenn Container-Breite vorhanden ist, optimalen Start-Scale berechnen
          if (containerRef.current) {
            const containerW = containerRef.current.clientWidth - 48;
            if (containerW > 300 && vp.width > 0) {
              const optimalScale = Math.min(1.8, Math.max(0.7, containerW / vp.width));
              setScale(Number(optimalScale.toFixed(2)));
            }
          }
        } catch (e) {
          console.warn('Konnte Standard-Viewport nicht ermitteln:', e);
        }

        setIsLoading(false);
      } catch (err: any) {
        if (isCancelled) return;
        console.error('Fehler beim Laden des PDFs:', err);
        setError(err?.message || 'Das PDF konnte nicht geladen werden.');
        setIsLoading(false);
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch (_) {}
      }
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [url]);

  // 2. Aktuelle Seite auf Canvas rendern
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isEffectCancelled = false;

    async function renderPage() {
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch (_) {}
      }

      try {
        const page = await pdfDoc.getPage(currentPage);
        if (isEffectCancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined;

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform,
        });

        currentRenderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        // RenderingCancelledException ignorieren, falls Nutzer schnell blättert / zoomt
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Renderfehler auf Seite', currentPage, err);
        }
      }
    }

    renderPage();

    return () => {
      isEffectCancelled = true;
      if (currentRenderTaskRef.current) {
        try {
          currentRenderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [pdfDoc, currentPage, scale]);

  function handleZoomIn() {
    setScale((prev) => Math.min(3.0, Number((prev + 0.15).toFixed(2))));
  }

  function handleZoomOut() {
    setScale((prev) => Math.max(0.5, Number((prev - 0.15).toFixed(2))));
  }

  function handleResetZoom() {
    setScale(1.0);
  }

  function handleFitWidth() {
    if (!containerRef.current || !basePageSizeRef.current) return;
    const containerW = containerRef.current.clientWidth - 48;
    const pageW = basePageSizeRef.current.width;
    if (pageW > 0) {
      const optimal = Math.max(0.6, Math.min(2.5, containerW / pageW));
      setScale(Number(optimal.toFixed(2)));
    }
  }

  function handlePrevPage() {
    setCurrentPage((p) => Math.max(1, p - 1));
  }

  function handleNextPage() {
    setCurrentPage((p) => Math.min(numPages, p + 1));
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden ${className}`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur-md">
        {/* Titel & Status */}
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-5 w-5 shrink-0 text-emerald-400" />
          <span className="truncate text-sm font-bold text-white" title={title}>
            {title}
          </span>
        </div>

        {/* Navigation & Controls */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Seiten-Navigation */}
          {numPages > 0 && (
            <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                title="Vorherige Seite"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="px-2 text-xs font-semibold text-slate-300 whitespace-nowrap">
                Seite <span className="text-emerald-400 font-bold">{currentPage}</span> von{' '}
                {numPages}
              </span>

              <button
                type="button"
                onClick={handleNextPage}
                disabled={currentPage >= numPages}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                title="Nächste Seite"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Zoom-Steuerung */}
          {numPages > 0 && (
            <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                title="Verkleinern"
              >
                <ZoomOut className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2 py-1 text-xs font-mono font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
                title="100% Zoom"
              >
                {Math.round(scale * 100)}%
              </button>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={scale >= 3.0}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                title="Vergrößern"
              >
                <ZoomIn className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleFitWidth}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-emerald-400"
                title="An Fensterbreite anpassen"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Aktionen (Neu Tab / Download) */}
          <div className="flex items-center gap-1">
            {blobUrl && (
              <a
                href={blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
                title="In neuem Browser-Tab öffnen"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Öffnen</span>
              </a>
            )}

            {blobUrl && (
              <a
                href={blobUrl}
                download={title.endsWith('.pdf') ? title : `${title}.pdf`}
                className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
                title="PDF herunterladen"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Download</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* PDF Viewport Area */}
      <div className="relative flex-1 min-h-[550px] max-h-[82vh] overflow-auto bg-slate-950 p-4 sm:p-6 flex items-start justify-center">
        {/* Ladeanzeige */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 z-10 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            <p className="text-xs sm:text-sm font-medium text-slate-300">
              Geschäftsordnung wird geladen...
            </p>
          </div>
        )}

        {/* Fehleranzeige */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center max-w-md my-auto">
            <AlertCircle className="h-10 w-10 text-rose-400" />
            <h3 className="text-base font-bold text-white">Laden fehlgeschlagen</h3>
            <p className="text-xs text-slate-400">{error}</p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setScale((s) => s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>Erneut versuchen</span>
              </button>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Direktlink öffnen</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Canvas für aktuelle Seite */}
        <div
          className={`flex items-center justify-center transition-opacity duration-200 ${
            isLoading || error ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <canvas
            ref={canvasRef}
            className="rounded-sm shadow-2xl ring-1 ring-slate-800 bg-white"
          />
        </div>
      </div>
    </div>
  );
};
