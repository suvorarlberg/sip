import { extractTextFromPdfArrayBuffer } from './pdfHelper';
import { extractTextFromDocxArrayBuffer } from './docxHelper';
import { SipAntrag } from '../types';
import {
  parseAntragsmappeText,
  parseStrategieSubMotions,
  createNebenantraegeFromExtracted,
  combineAntragsmappeAndStrategie,
  AutoImportProgressCallback,
  AutoImportResult,
} from './sipAutoImporter';

export interface DriveFileInfo {
  name: string;
  id: string;
  downloadUrl: string;
  mimeType?: string;
}

export interface GoogleDriveFolderManifest {
  folderId: string;
  antragsmappe: DriveFileInfo | null;
  hauptantragFiles?: DriveFileInfo[];
  strategieFiles: DriveFileInfo[];
  updatedAt: string;
  goFile?: DriveFileInfo | null;
}

export interface ParsedDriveEntry {
  id: string;
  name: string;
  isFolder: boolean;
  isGoogleDoc: boolean;
  isGoogleSheet: boolean;
  href: string;
}

/**
 * Extrahiert die reine Ordner-ID aus einem Google Drive Ordner-Link
 */
export function extractGoogleDriveFolderId(rawUrlOrId: string): string | null {
  if (!rawUrlOrId || typeof rawUrlOrId !== 'string') return null;
  const trimmed = rawUrlOrId.trim();

  // 1. Direct ID check (typischerweise 15-60 alphanumerische Zeichen inkl. _ und -)
  if (/^[a-zA-Z0-9_\-]{10,100}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. URL mit /folders/ID oder /d/ID
  const folderMatch = trimmed.match(/\/(?:folders|d)\/([a-zA-Z0-9_\-]+)/i);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }

  // 3. URL mit ?id=ID oder &id=ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_\-]+)/i);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  return null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .normalize('NFC')
    .trim();
}

/**
 * Parst sowohl das HTML von Google Drives embeddedfolderview als auch die Markdown-Antwort von r.jina.ai
 */
export function parseEmbeddedFolderViewResponse(rawContent: string): ParsedDriveEntry[] {
  const entriesMap = new Map<string, ParsedDriveEntry>();

  // 1. HTML-Format: <div class="flip-entry" id="entry-ID">...<a href="HREF"...>...<div class="flip-entry-title">TITLE</div>
  const htmlEntryRegex =
    /<div\s+class="flip-entry"\s+id="entry-([a-zA-Z0-9_\-]+)"[\s\S]*?<a\s+href="([^"]+)"[\s\S]*?<div\s+class="flip-entry-title">([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = htmlEntryRegex.exec(rawContent)) !== null) {
    const id = m[1].trim();
    const href = m[2].trim();
    const name = decodeHtmlEntities(m[3].replace(/<[^>]+>/g, ''));
    if (!id || !name) continue;

    const isFolder = /\/folders\//i.test(href);
    const isGoogleDoc = /docs\.google\.com\/document\/d\//i.test(href);
    const isGoogleSheet = /docs\.google\.com\/spreadsheets\/d\//i.test(href);

    entriesMap.set(id, { id, name, isFolder, isGoogleDoc, isGoogleSheet, href });
  }

  // 2. Markdown-Format (r.jina.ai Standardausgabe):
  // [![Image ...](...)TITLE](https://drive.google.com/...)
  const mdLinkRegex =
    /\[(?:!\[[^\]]*\]\([^)]+\))?([^\]]+)\]\((https:\/\/(?:drive|docs)\.google\.com\/[^)]+)\)/gi;
  while ((m = mdLinkRegex.exec(rawContent)) !== null) {
    const name = decodeHtmlEntities(m[1]);
    const href = m[2].trim();
    if (!name) continue;

    const folderMatch = href.match(/\/folders\/([a-zA-Z0-9_\-]+)/i);
    const fileMatch = href.match(
      /\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_\-]+)/i,
    );
    const id = folderMatch ? folderMatch[1] : fileMatch ? fileMatch[1] : '';
    if (!id || entriesMap.has(id)) continue;

    const isFolder = Boolean(folderMatch);
    const isGoogleDoc = /docs\.google\.com\/document\/d\//i.test(href);
    const isGoogleSheet = /docs\.google\.com\/spreadsheets\/d\//i.test(href);

    entriesMap.set(id, { id, name, isFolder, isGoogleDoc, isGoogleSheet, href });
  }

  return Array.from(entriesMap.values());
}

/**
 * Ruft die Dateiliste eines einzelnen Google Drive Ordners live ab (funktioniert im Browser & in Node)
 */
export async function fetchDriveFolderEntriesLive(folderId: string): Promise<ParsedDriveEntry[]> {
  const embeddedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`;

  const endpoints: Array<{ url: string; headers?: Record<string, string> }> = [
    // 1. Direkt (funktioniert in Node.js / Tests ohne CORS-Restriktion)
    ...(typeof window === 'undefined' ? [{ url: embeddedUrl }] : []),
    // 2. Jina Reader mit HTML-Return (schnell, CORS-freundlich im Browser)
    {
      url: `https://r.jina.ai/${embeddedUrl}`,
      headers: { 'X-Return-Format': 'html' },
    },
    // 3. Jina Reader Standard (Markdown)
    {
      url: `https://r.jina.ai/${embeddedUrl}`,
    },
    // 4. AllOrigins Raw Proxy Fallback
    {
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(embeddedUrl)}`,
    },
    // 5. Corsproxy.io Fallback
    {
      url: `https://corsproxy.io/?${encodeURIComponent(embeddedUrl)}`,
    },
  ];

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(ep.url, {
        headers: ep.headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const text = await res.text();
      const parsed = parseEmbeddedFolderViewResponse(text);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch (_err) {
      // Nächsten Endpunkt probieren
    }
  }

  return [];
}

function toDriveFileInfo(entry: ParsedDriveEntry): DriveFileInfo {
  if (entry.isGoogleDoc) {
    const hasDocxExt = /\.(?:docx|doc)$/i.test(entry.name);
    return {
      name: hasDocxExt ? entry.name : `${entry.name}.docx`,
      id: entry.id,
      downloadUrl: `https://docs.google.com/document/d/${entry.id}/export?format=docx`,
      mimeType: 'application/vnd.google-apps.document',
    };
  }
  return {
    name: entry.name,
    id: entry.id,
    downloadUrl: `https://drive.usercontent.google.com/download?id=${entry.id}&export=download&confirm=t`,
  };
}

function isStrategyDocCandidate(entry: ParsedDriveEntry): boolean {
  if (entry.isFolder || entry.isGoogleSheet) return false;
  const lower = entry.name.toLowerCase();
  if (lower.startsWith('~$') || lower.startsWith('.')) return false;
  if (
    /legende|formatierung|wichtigste\s+sip\s+go|wie\s+schreibe\s+ich|how\s+to\s+sip|zeitplan/i.test(
      lower,
    )
  ) {
    return false;
  }
  if (entry.isGoogleDoc) return true;
  return lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.txt');
}

function sortByLeadingNumber(files: DriveFileInfo[]): DriveFileInfo[] {
  return [...files].sort((a, b) => {
    const matchA = a.name.match(/^(\d+)/);
    const matchB = b.name.match(/^(\d+)/);
    const numA = matchA ? parseInt(matchA[1], 10) : 9999;
    const numB = matchB ? parseInt(matchB[1], 10) : 9999;
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name, 'de');
  });
}

/**
 * Crawlt einen Google Drive SiP-Ordner live und erstellt das vollständige Manifest:
 * - Antragsmappe (.pdf)
 * - Unterordner "Strategie" (inkl. eventueller Unterordner wie "Anträge Strategie")
 */

export async function crawlDriveFolderLive(
  folderId: string,
  onProgress?: (text: string) => void,
): Promise<GoogleDriveFolderManifest | null> {
  onProgress?.('Durchsuche Google Drive Hauptordner...');
  const rootEntries = await fetchDriveFolderEntriesLive(folderId);

  const goPdfEntry =
    rootEntries.find(
      (entry) => !entry.isFolder && entry.name.includes('GO') && /\.pdf$/i.test(entry.name),
    ) ?? null;

  if (rootEntries.length === 0) {
    return null;
  }

  // 1. Suche nach der Antragsmappe (PDF) im Hauptordner
  // Bevorzuge PDFs mit "Antragsmappe" im Namen (egal ob mit .pdf-Endung oder ohne)
  const pdfEntries = rootEntries.filter(
    (entry) =>
      !entry.isFolder &&
      entry !== goPdfEntry &&
      (entry.name.toLowerCase().endsWith('.pdf') || /antragsmappe/i.test(entry.name)),
  );

  const primaryAntragsmappe =
    pdfEntries.find(
      (e) =>
        /antragsmappe/i.test(e.name) &&
        !/vorab-kommentierung|bidi-kommentierung|how\s+to/i.test(e.name),
    ) ||
    pdfEntries.find((e) => /antragsmappe/i.test(e.name)) ||
    pdfEntries.find((e) => !/how\s+to|leitfaden|zeitplan|geschäftsordnung|bidi/i.test(e.name)) ||
    pdfEntries[0] ||
    null;

  let antragsmappe: DriveFileInfo | null = primaryAntragsmappe
    ? toDriveFileInfo(primaryAntragsmappe)
    : null;

  // Prüfe zusätzlich, ob Hauptanträge in einem Unterordner liegen (z.B. "eingereichte Reihenfolge", "Hauptanträge" oder "Antragsmappe")
  const hauptantragFiles: DriveFileInfo[] = [];
  const motionsSubfolder = rootEntries.find(
    (e) => e.isFolder && /eingereichte\s+reihenfolge|hauptantr[äa]ge|antragsmappe/i.test(e.name),
  );
  if (motionsSubfolder) {
    onProgress?.(`Prüfe Unterordner "${motionsSubfolder.name}"...`);
    const motionSubEntries = await fetchDriveFolderEntriesLive(motionsSubfolder.id);
    const mappeInSub = motionSubEntries.find(
      (e) =>
        !e.isFolder &&
        /antragsmappe/i.test(e.name) &&
        !/vorab-kommentierung|bidi/i.test(e.name) &&
        e.name.toLowerCase().endsWith('.pdf'),
    );
    if (mappeInSub) {
      antragsmappe = toDriveFileInfo(mappeInSub);
    } else {
      for (const entry of motionSubEntries) {
        if (
          !entry.isFolder &&
          (entry.name.toLowerCase().endsWith('.pdf') ||
            entry.name.toLowerCase().endsWith('.docx') ||
            entry.isGoogleDoc) &&
          !/bidi|kommentierung|leitfaden|geschäftsordnung|how\s+to/i.test(entry.name)
        ) {
          hauptantragFiles.push(toDriveFileInfo(entry));
        }
      }
    }
  }

  // 2. Suche nach dem Unterordner "Strategie"
  const strategieFolder = rootEntries.find((e) => e.isFolder && /strategie/i.test(e.name));

  const collectedStrategieMap = new Map<string, DriveFileInfo>();

  if (strategieFolder) {
    onProgress?.(`Durchsuche Unterordner "${strategieFolder.name}"...`);
    const stratEntries = await fetchDriveFolderEntriesLive(strategieFolder.id);

    // 2a. Alle direkten Strategiedokumente im Ordner "Strategie"
    for (const entry of stratEntries) {
      if (isStrategyDocCandidate(entry)) {
        collectedStrategieMap.set(entry.id, toDriveFileInfo(entry));
      }
    }

    // 2b. Prüfe relevante Unterordner in "Strategie" (z.B. "Anträge Strategie"), ignoriere "BiDi-Kommentierung"
    const stratSubfolders = stratEntries.filter(
      (e) => e.isFolder && !/bidi|kommentierung|archiv/i.test(e.name),
    );

    for (const subFolder of stratSubfolders) {
      onProgress?.(`Durchsuche Strategie-Unterordner "${subFolder.name}"...`);
      const subEntries = await fetchDriveFolderEntriesLive(subFolder.id);
      for (const subEntry of subEntries) {
        if (isStrategyDocCandidate(subEntry)) {
          collectedStrategieMap.set(subEntry.id, toDriveFileInfo(subEntry));
        }
      }
    }
  } else {
    // Fallback: Falls die Strategiedateien direkt im Hauptordner abgelegt wurden
    for (const entry of rootEntries) {
      if (isStrategyDocCandidate(entry) && entry.id !== antragsmappe?.id) {
        collectedStrategieMap.set(entry.id, toDriveFileInfo(entry));
      }
    }
  }

  const strategieFiles = sortByLeadingNumber(Array.from(collectedStrategieMap.values()));

  if (!antragsmappe && hauptantragFiles.length === 0 && strategieFiles.length === 0) {
    return null;
  }

  const manifest: GoogleDriveFolderManifest = {
    folderId,
    antragsmappe,
    hauptantragFiles:
      hauptantragFiles.length > 0 ? sortByLeadingNumber(hauptantragFiles) : undefined,
    strategieFiles,
    updatedAt: new Date().toISOString(),
    goFile: goPdfEntry ? toDriveFileInfo(goPdfEntry) : null,
  };

  return manifest;
}

/**
 * Ermittelt die Dateistruktur eines Google Drive Ordners online
 * (Antragsmappe PDF + Strategie DOCX Dateien)
 */
export async function resolveDriveFolderManifest(
  folderUrlOrId: string,
  onProgress?: (text: string) => void,
): Promise<GoogleDriveFolderManifest> {
  const folderId = extractGoogleDriveFolderId(folderUrlOrId);
  if (!folderId) {
    throw new Error('Ungültiger Google Drive Ordner-Link. Bitte überprüfe den eingefügten Link.');
  }

  console.log(
    `[DRIVE-CRAWL] ${new Date().toISOString()} | Starte Live-Crawl für Ordner-ID: "${folderId}" (Input: "${folderUrlOrId}")`,
  );
  onProgress?.('Verbinde mit Google Drive Ordner...');

  // 1. Prüfe lokalen Vite Dev Server API Endpoint (falls lokal ausgeführt)
  try {
    const res = await fetch(`/api/drive-folder-scrape?folderId=${encodeURIComponent(folderId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.antragsmappe || (data.strategieFiles && data.strategieFiles.length > 0))) {
        console.log(
          `[DRIVE-MANIFEST] ${new Date().toISOString()} | Gefunden über lokalen Server: Antragsmappe="${data.antragsmappe?.name}", Strategien=${data.strategieFiles?.length}`,
        );
        const serverManifest = data as GoogleDriveFolderManifest;
        if (!serverManifest.goFile) {
          try {
            const liveManifest = await crawlDriveFolderLive(folderId, onProgress);
            serverManifest.goFile = liveManifest?.goFile ?? null;
          } catch {
            serverManifest.goFile = null;
          }
        }
        return serverManifest;
      }
    }
  } catch (_err) {
    // Vite Endpoint nicht erreichbar (z.B. auf GitHub Pages) -> weiter mit Live-Browser-Crawler
  }

  // 2. Live Online-Crawler direkt aus dem Browser (via embeddedfolderview)
  try {
    const liveManifest = await crawlDriveFolderLive(folderId, onProgress);
    if (
      liveManifest &&
      (liveManifest.antragsmappe ||
        (liveManifest.hauptantragFiles && liveManifest.hauptantragFiles.length > 0) ||
        liveManifest.strategieFiles.length > 0)
    ) {
      console.log(
        `[DRIVE-MANIFEST] ${new Date().toISOString()} | Live gefunden: Antragsmappe="${liveManifest.antragsmappe?.name || 'keine'}", Hauptdateien=${liveManifest.hauptantragFiles?.length || 0}, Strategien=${liveManifest.strategieFiles.length}`,
      );
      return liveManifest;
    }
  } catch (err: any) {
    console.error(
      `[DRIVE-ERROR] ${new Date().toISOString()} | Live-Crawl des Google Drive Ordners fehlgeschlagen:`,
      err,
    );
    throw new Error(`Google Drive Ordner konnte nicht gelesen werden: ${err?.message || err}`);
  }

  throw new Error(
    `Im angegebenen Google Drive Ordner (ID: ${folderId}) konnten keine SiP-Unterlagen gefunden werden. Bitte stelle sicher, dass der Ordner freigegeben ist („Jeder mit dem Link kann ansehen“) und die Antragsmappe (.pdf) sowie der Unterordner „Strategie“ (.docx) enthalten sind.`,
  );
}

export class DriveDownloadBlockedError extends Error {
  file: DriveFileInfo;
  status: number;
  isDownloadBlocked = true;
  manifest?: GoogleDriveFolderManifest;
  pendingNebenantraege?: SipAntrag[];
  strategyNotes?: string;
  strategieText?: string;

  constructor(
    file: DriveFileInfo,
    status: number,
    manifest?: GoogleDriveFolderManifest,
    pendingNebenantraege?: SipAntrag[],
    strategyNotes?: string,
    strategieText?: string,
  ) {
    super(
      `Google blockiert den automatischen Download von "${file.name}" (HTTP ${status || 'CORS/403/408'}).`,
    );
    this.name = 'DriveDownloadBlockedError';
    this.file = file;
    this.status = status;
    this.manifest = manifest;
    this.pendingNebenantraege = pendingNebenantraege;
    this.strategyNotes = strategyNotes;
    this.strategieText = strategieText;
  }
}

/**
 * Lädt eine Datei über Googles CDN herunter (mit direktem Aufruf & robuster CORS-Proxy-Fallback-Kette)
 */
export async function downloadDriveFileAsArrayBuffer(
  file: DriveFileInfo,
  onProgress?: (status: string) => void,
): Promise<ArrayBuffer> {
  onProgress?.(`Lade ${file.name} herunter...`);

  const fileId = file.id;
  const isGoogleDoc =
    file.mimeType === 'application/vnd.google-apps.document' ||
    (file.name.endsWith('.docx') && !file.name.endsWith('.pdf'));

  // Die Basis-URL für Google Drive gemäß Vorgabe
  const driveUrl = isGoogleDoc
    ? `https://docs.google.com/document/d/${fileId}/export?format=docx`
    : 'https://drive.google.com/uc?export=download&id=' + fileId + '&confirm=t';

  // Direkte CDN-Download-URL ohne Proxy (Stufe 1)
  const directUserContentUrl = isGoogleDoc
    ? `https://docs.google.com/document/d/${fileId}/export?format=docx`
    : `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

  // Kette von direkten Aufrufen und verschiedenen CORS-Proxys gemäß Vorgabe
  const proxyUrls: string[] = [
    // 1. Direkter Aufruf ohne Proxy (hat früher am Tag funktioniert)
    directUserContentUrl,
    // 2. Neuer Proxy: api.codetabs.com
    'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(driveUrl),
    'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(directUserContentUrl),
    // 3. Fallback CORS-Proxys
    'https://corsproxy.io/?' + encodeURIComponent(driveUrl),
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(driveUrl),
    'https://thingproxy.freeboard.io/fetch/' + encodeURIComponent(driveUrl),
    'https://corsproxy.io/?' + encodeURIComponent(directUserContentUrl),
    // 4. Direkte Drive-URL als Fallback
    driveUrl,
  ];

  let lastStatus = 0;
  for (const proxyUrl of proxyUrls) {
    try {
      console.log(
        `[DOWNLOAD] ${new Date().toISOString()} | Datei: "${file.name}" | ID: ${fileId} | URL: ${proxyUrl}`,
      );
      const controller = new AbortController();
      // 25 Sekunden Timeout für große PDF-Dateien gegen 408 Timeouts
      const timeout = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);

      lastStatus = response.status;
      if (response.status === 200) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 100) {
          console.log(
            `[DOWNLOAD-OK] ${new Date().toISOString()} | Datei: "${file.name}" | Bytes: ${buffer.byteLength}`,
          );
          return buffer;
        }
      }
      console.warn('Proxy fehlgeschlagen, probiere nächsten...', proxyUrl);
    } catch (_err) {
      console.warn('Proxy fehlgeschlagen, probiere nächsten...', proxyUrl);
    }
  }

  throw new DriveDownloadBlockedError(file, lastStatus);
}

export interface ExecuteOnlineDriveImportOptions {
  folderUrlOrId: string;
  onProgress?: AutoImportProgressCallback;
  manualPdfBuffer?: ArrayBuffer;
  cachedManifest?: GoogleDriveFolderManifest;
  cachedStrategieText?: string;
}

/**
 * Lädt alle Strategiedateien (DOCX) aus dem Manifest herunter und parst die Nebenanträge nach dem Buffer-Pattern.
 */
export async function downloadAndParseDriveStrategieFiles(
  manifest: GoogleDriveFolderManifest,
  onProgress?: AutoImportProgressCallback,
  startPercent: number = 25,
  spanPercent: number = 32,
): Promise<{
  combinedStrategieText: string;
  nebenantraege: SipAntrag[];
  strategyNotes: string;
}> {
  const totalStrats = manifest.strategieFiles.length;
  const indexedStrategieTexts: Array<{ index: number; text: string }> = [];
  const batchSize = 6;

  for (let start = 0; start < totalStrats; start += batchSize) {
    const batch = manifest.strategieFiles.slice(start, start + batchSize);
    const pct = Math.round(startPercent + (start / Math.max(1, totalStrats)) * spanPercent);
    onProgress?.({
      percent: pct,
      statusText: `Lade Strategiedokumente herunter (${Math.min(
        totalStrats,
        start + 1,
      )}–${Math.min(totalStrats, start + batch.length)} von ${totalStrats})...`,
    });

    await Promise.all(
      batch.map(async (file, bIdx) => {
        const idx = start + bIdx;
        try {
          const docxBuffer = await downloadDriveFileAsArrayBuffer(file);
          const text = await extractTextFromDocxArrayBuffer(docxBuffer);
          if (text.trim()) {
            indexedStrategieTexts.push({
              index: idx,
              text: `--- Strategie: ${file.name} ---\n${text}`,
            });
          }
        } catch (err) {
          console.warn(`Fehler beim Laden von Strategiedatei ${file.name}:`, err);
        }
      }),
    );
  }

  indexedStrategieTexts.sort((a, b) => a.index - b.index);
  const combinedStrategieText = indexedStrategieTexts.map((item) => item.text).join('\n\n');
  const { subMotions, generalStrategyNotes } = parseStrategieSubMotions(combinedStrategieText);
  const { nebenantraege } = createNebenantraegeFromExtracted(subMotions);

  return {
    combinedStrategieText,
    nebenantraege,
    strategyNotes: generalStrategyNotes,
  };
}

/**
 * Führt den vollautomatischen Online-Import aus dem Google Drive Ordner durch:
 * 1. Ruft den Ordner online ab und ignoriert alles andere
 * 2. Lädt die Strategiedateien (DOCX) herunter, damit `pendingNebenantraege` auch bei PDF-Blockade sofort bereitstehen
 * 3. Lädt die Antragsmappe (PDF) online herunter (oder verwendet den manuellen Buffer)
 * 4. Führt Hauptanträge und Nebenanträge im expliziten Merge zusammen
 * 5. Gibt die finale Meldung "Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!" zurück
 */
export async function executeOnlineDriveImport(
  options: ExecuteOnlineDriveImportOptions,
): Promise<AutoImportResult> {
  const { folderUrlOrId, onProgress, manualPdfBuffer, cachedManifest, cachedStrategieText } =
    options;

  onProgress?.({
    percent: 5,
    statusText: 'Verbinde mit Google Drive Ordner...',
  });

  // 1. Ordner-Manifest online auflösen (falls nicht bereits gecached)
  let manifest = cachedManifest;
  if (!manifest) {
    manifest = await resolveDriveFolderManifest(folderUrlOrId, (txt) => {
      onProgress?.({ percent: 10, statusText: txt });
    });
  }

  if (
    !manifest.antragsmappe &&
    (!manifest.hauptantragFiles || manifest.hauptantragFiles.length === 0) &&
    manifest.strategieFiles.length === 0
  ) {
    throw new Error(
      'Weder Antragsmappe (PDF) noch Strategiedateien (DOCX) im Google Drive Ordner gefunden.',
    );
  }

  // 2. Strategiedateien (DOCX) online herunterladen (falls nicht bereits gecached),
  // damit die DOCX-Nebenanträge (pendingNebenantraege) in jedem Fall vorab im State verfügbar sind!
  let combinedStrategieText = cachedStrategieText || '';
  let preParsedNebenantraege: SipAntrag[] = [];
  let preParsedStrategyNotes = '';

  if (!combinedStrategieText && manifest.strategieFiles.length > 0) {
    const stratRes = await downloadAndParseDriveStrategieFiles(manifest, onProgress, 15, 28);
    combinedStrategieText = stratRes.combinedStrategieText;
    preParsedNebenantraege = stratRes.nebenantraege;
    preParsedStrategyNotes = stratRes.strategyNotes;
  } else if (combinedStrategieText) {
    const { subMotions, generalStrategyNotes } = parseStrategieSubMotions(combinedStrategieText);
    preParsedNebenantraege = createNebenantraegeFromExtracted(subMotions).nebenantraege;
    preParsedStrategyNotes = generalStrategyNotes;
  }

  // 3. Antragsmappe (PDF) verarbeiten (per manuellem Buffer oder automatischem Download)
  let antragsmappeText = '';
  if (manualPdfBuffer) {
    onProgress?.({
      percent: 48,
      statusText: 'Verarbeite manuell hochgeladene Antragsmappe...',
    });
    try {
      antragsmappeText = await extractTextFromPdfArrayBuffer(manualPdfBuffer.slice(0));
    } catch (pdfErr) {
      console.warn('PDF-Extraktion fehlgeschlagen, versuche als DOCX:', pdfErr);
      antragsmappeText = await extractTextFromDocxArrayBuffer(manualPdfBuffer.slice(0));
    }
    const { hauptAntraege } = parseAntragsmappeText(antragsmappeText);
    const hauptantraege = hauptAntraege;
    console.log('Manuell hochgeladene PDF geparst. Anzahl Hauptanträge:', hauptantraege.length);
  } else if (manifest.antragsmappe) {
    onProgress?.({
      percent: 45,
      statusText: `Lade Antragsmappe herunter (${manifest.antragsmappe.name})...`,
    });
    try {
      const pdfBuffer = await downloadDriveFileAsArrayBuffer(manifest.antragsmappe, (status) =>
        onProgress?.({ percent: 50, statusText: status }),
      );

      onProgress?.({
        percent: 56,
        statusText: 'Verarbeite Antragsmappe PDF & filtere Geschäftsordnung...',
      });
      try {
        antragsmappeText = await extractTextFromPdfArrayBuffer(pdfBuffer);
      } catch (pdfErr) {
        console.warn('PDF-Extraktion fehlgeschlagen, versuche als DOCX:', pdfErr);
        antragsmappeText = await extractTextFromDocxArrayBuffer(pdfBuffer);
      }
      console.log(
        `[DRIVE-PDF] Antragsmappe "${manifest.antragsmappe.name}" extrahiert (${antragsmappeText.length} Zeichen)`,
      );
    } catch (err: any) {
      console.warn('Download der Antragsmappe fehlgeschlagen:', err);
      const blockedErr = new DriveDownloadBlockedError(
        manifest.antragsmappe,
        err.status || 403,
        manifest,
        preParsedNebenantraege,
        preParsedStrategyNotes,
        combinedStrategieText,
      );
      throw blockedErr;
    }
  }

  // Falls die Haupt-PDF nur ein Vorwort (z.B. Vorab-Kommentierung) war und Einzel-Hauptanträge im Ordner liegen:
  if (
    parseAntragsmappeText(antragsmappeText).hauptAntraege.length === 0 &&
    manifest.hauptantragFiles &&
    manifest.hauptantragFiles.length > 0
  ) {
    const totalHauptFiles = manifest.hauptantragFiles.length;
    const indexedHauptTexts: Array<{ index: number; text: string }> = [];
    const hBatchSize = 8;

    for (let start = 0; start < totalHauptFiles; start += hBatchSize) {
      const batch = manifest.hauptantragFiles.slice(start, start + hBatchSize);
      const pct = Math.round(56 + (start / Math.max(1, totalHauptFiles)) * 8);
      onProgress?.({
        percent: pct,
        statusText: `Lade Hauptanträge herunter (${Math.min(
          totalHauptFiles,
          start + 1,
        )}–${Math.min(totalHauptFiles, start + batch.length)} von ${totalHauptFiles})...`,
      });

      await Promise.all(
        batch.map(async (file, bIdx) => {
          const idx = start + bIdx;
          try {
            const buf = await downloadDriveFileAsArrayBuffer(file);
            const isPdf = file.name.toLowerCase().endsWith('.pdf');
            const text = isPdf
              ? await extractTextFromPdfArrayBuffer(buf)
              : await extractTextFromDocxArrayBuffer(buf);
            if (text.trim()) {
              indexedHauptTexts.push({
                index: idx,
                text: `--- Antrag: ${file.name} ---\n${text}`,
              });
            }
          } catch (err) {
            console.warn(`Fehler beim Laden von Hauptantrag ${file.name}:`, err);
          }
        }),
      );
    }

    indexedHauptTexts.sort((a, b) => a.index - b.index);
    if (indexedHauptTexts.length > 0) {
      antragsmappeText = indexedHauptTexts.map((item) => item.text).join('\n\n');
    }
  }

  // 4. Sequenziell Antrag für Antrag zusammensetzen mit Live-Ladebalken
  onProgress?.({
    percent: 65,
    statusText: 'Kombiniere Anträge mit Strategie...',
  });

  const combined = combineAntragsmappeAndStrategie(antragsmappeText, combinedStrategieText);
  const hauptAntraege = combined.hauptantraege;
  const subAntraege = combined.nebenantraege;
  console.log(
    `[ONLINE-DRIVE] Import abgeschlossen: ${combined.antraege.length} Anträge gesamt (${hauptAntraege.length} Hauptanträge, ${subAntraege.length} Nebenanträge/WM)`,
  );
  const totalMotions = Math.max(1, hauptAntraege.length);

  for (let i = 0; i < hauptAntraege.length; i++) {
    const motion = hauptAntraege[i];
    const pct = Math.round(65 + ((i + 1) / totalMotions) * 33);
    const motionNum = i + 1;

    onProgress?.({
      percent: pct,
      statusText: `Lade ${motionNum}. Antrag & ${motionNum}. Strategie: ${motion.title.slice(0, 48)}...`,
      currentMotionNumber: motionNum,
      totalMotions,
      motionTitle: motion.title,
    });

    // Kurzer Yield für flüssige Animation des Ladebalkens
    await new Promise((resolve) => setTimeout(resolve, 45));
  }

  // 5. Fertigstellung mit der geforderten exakten Meldung
  const finalMessage = 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!';
  onProgress?.({
    percent: 100,
    statusText: finalMessage,
    currentMotionNumber: totalMotions,
    totalMotions,
  });

  return {
    success: combined.antraege.length > 0,
    message: finalMessage,
    goFile: manifest.goFile ?? null,
    antraege: combined.antraege,
    hauptantraege: combined.hauptantraege,
    nebenantraege: combined.nebenantraege,
    summary: {
      ...combined.summary,
      strategyFilesCount: manifest.strategieFiles.length,
    },
    strategyNotes: combined.strategyNotes,
  };
}
