import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Polyfills für neuere ES2025/2026 Methoden, die von pdfjs-dist v6 intern aufgerufen werden
if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function (fn: (...args: any[]) => any, ...args: any[]) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

if (typeof (Uint8Array.prototype as any).toHex !== 'function') {
  (Uint8Array.prototype as any).toHex = function (this: Uint8Array) {
    let hex = '';
    for (let i = 0; i < this.length; i++) {
      hex += this[i].toString(16).padStart(2, '0');
    }
    return hex;
  };
}

if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.mjs',
      import.meta.url
    ).toString();
  } catch (_err) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '6.4.299'}/legacy/build/pdf.worker.min.mjs`;
  }
}

export { pdfjsLib };

export async function extractTextFromPdfArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  // Sicherheits-Clone des Buffers, damit pdfjs-dist beim Transfer an den Web-Worker
  // keinesfalls den Originalbuffer im Hauptthread detached
  const safeBuffer = buffer.byteLength > 0 ? buffer.slice(0) : buffer;
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(safeBuffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let pageText = '';
    let lastY: number | null = null;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const str = item.str;
      const hasEOL = Boolean('hasEOL' in item && item.hasEOL);
      const currentY = Array.isArray(item.transform) ? item.transform[5] : null;

      if (!str && !hasEOL) continue;

      // Wenn die Y-Position sich merklich ändert (> 4 Punkte) oder hasEOL gesetzt ist: Zeilenumbruch
      if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 4) {
        if (!pageText.endsWith('\n')) {
          pageText += '\n';
        }
      } else if (
        pageText.length > 0 &&
        !pageText.endsWith('\n') &&
        !pageText.endsWith(' ') &&
        !str.startsWith(' ')
      ) {
        pageText += ' ';
      }

      pageText += str;

      if (hasEOL && !pageText.endsWith('\n')) {
        pageText += '\n';
      }

      if (currentY !== null) {
        lastY = currentY;
      }
    }

    fullText += `\n\n--- SEITE ${i} ---\n` + pageText.trim() + '\n';
  }

  return fullText;
}
