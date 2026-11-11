import { AntragType, SipAntrag } from '../types';
import { extractTextFromPdfArrayBuffer } from './pdfHelper';
import { extractTextFromDocxArrayBuffer } from './docxHelper';

export interface ParsedHauptAntrag {
  index: number;
  rawTitle: string;
  cleanTitle: string;
  author: string;
  lineOrParagraph?: string;
  content: string;
  text: string;
  forderungspunkte: string[];
}

export interface ParsedSubAntrag {
  type: AntragType;
  title: string;
  content: string;
  text: string;
  lineOrParagraph?: string;
  claimedBy?: string;
  author?: string;
}

export interface ParsedStrategieSection {
  motionNumber?: number;
  motionTitle: string;
  author?: string;
  forderungspunkte?: string[];
  content?: string;
  subAntraege: ParsedSubAntrag[];
  notes?: string;
}

export interface AutoImportResult {
  success: boolean;
  message: string;
  antraege: SipAntrag[];
  hauptantraege?: SipAntrag[];
  nebenantraege?: SipAntrag[];
  strategyNotes: string;
  goFile?: {
    name: string;
    id: string;
    downloadUrl: string;
    mimeType?: string;
  } | null;
  localGoFile?: File | null;
  summary: {
    hauptAntraegeCount: number;
    subAntraegeCount: number;
    matchedSectionsCount: number;
    strategyFilesCount: number;
    goExcluded: boolean;
  };
}

/**
 * Entfernt Personennamen (z.B. "(Simon)", "- Simon") und Platzhalter (z.B. "(XX)", "(XXX)")
 * aus dem Titel einer Wortmeldung oder eines Nebenantrags, sodass der Name nur dort steht,
 * wo "geclaimed von" bzw. "noch nicht vergeben" angezeigt wird.
 */
export function cleanSubMotionTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let clean = rawTitle;
  // Entferne nachgestellte Autoren wie " – Simon", " - Katharina Nigg", etc.
  clean = clean.replace(/\s*[\-–]\s*[A-ZÄÖÜa-zäöüß\s.\-]+$/, '');
  // Entferne (XX), (XXX), (?), (offen), etc.
  clean = clean.replace(/\s*\([xX\?\s\-]+\)/gi, '');
  // Entferne Klammern, die einen Personennamen enthalten (nicht aber FP oder Zeilenbezug)
  clean = clean.replace(
    /\s*\((?!(?:zu\s+|zur\s+)?(?:fp|forderungspunkt|zeile|z\.|§)\b)[^)]+\)/gi,
    '',
  );
  // Vereinheitliche "zu/zur FP X" zu "(FP X)" falls noch nicht in Klammern
  clean = clean.replace(/\b(?:zu|zur)\s+(fp|forderungspunkt|zeile|z\.|§)\s*(\d+)\b/gi, '($1 $2)');
  // Doppelpunkt, Bindestrich oder Leerzeichen am Ende entfernen
  clean = clean.replace(/[:\-–\s]+$/, '');
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Normalisiert Antragstitel für den intelligenten Abgleich zwischen
 * SiP-Antragsmappe und Strategie-Dokument.
 */
export function normalizeTitleForMatching(title: string): string {
  if (!title) return '';
  return (
    title
      .normalize('NFC')
      .toLowerCase()
      // Entferne Datei-Präfixe wie "--- strategie: "
      .replace(/^---\s*(?:strategie|antrag)\s*:\s*/gi, '')
      .replace(/\s*---$/gi, '')
      // Entferne Dateierweiterungen
      .replace(/\.(?:pdf|docx|doc|txt|md)$/i, '')
      // Entferne nachgestellte "_Strategie" Suffixe
      .replace(/_strategie$/i, '')
      // Entferne "Strategie_0_", "Strategie_12_" Präfixe
      .replace(/^strategie[\s_\-]*\d*[\s_\-]*/i, '')
      // Entferne vorangestellte "Antrag 1:", "Top 2." Nummerierungen zuerst
      .replace(/^(?:(?:haupt)?antrag|top)\s+\d+\s*[\.:\-\s]+/gi, '')
      // Entferne danach ggf. "Antrag aus dem Ausschuss:", "Initiativantrag:", "GO Antrag:" Präfixe
      .replace(
        /^(?:(?:strategie\s+(?:für|zu)\s+)?(?:go[\s\-]*)?(?:haupt|initiativ)?antrag(?:\s+aus\s+dem\s+ausschuss)?|top)\s*\d*[\.:\-\s]*/gi,
        '',
      )
      .replace(/^\d{1,2}[\._:\-\s]+/g, '')
      // Entferne Präfix-Tags wie "[BS]" oder "[Gymnasium]"
      .replace(/^\[[a-zäöü\s-]+\][:\s-]*/gi, '')
      .replace(/\([^)]+\)$/g, '')
      // Vereinheitliche Anführungszeichen, Bindestriche, Unterstriche & Satzzeichen
      .replace(/[\u2013\u2014_]/g, ' ')
      .replace(/[.,:;!?'"„“”«»()\[\]{}\/\\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Prüft, ob zwei Titel (Antragsmappe vs. Strategie) zum selben Hauptantrag gehören.
 */
export function isTitleMatching(titleA: string, titleB: string): boolean {
  const normA = normalizeTitleForMatching(titleA);
  const normB = normalizeTitleForMatching(titleB);

  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.length >= 5 && normB.length >= 5 && (normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

  // Wort-Überlappung (Jaccard-Ähnlichkeit bei signifikanten Wörtern >= 3 Zeichen)
  const wordsA = new Set(normA.split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(normB.split(' ').filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }

  const similarity = common / Math.min(wordsA.size, wordsB.size);
  return similarity >= 0.5;
}

/**
 * Extrahiert Nummer, Titel und Autor aus einem typischen Vorarlberger SiP-Dateinamen
 * z.B. "1_Bildung muss bewegen - Schulen ins 21. Jahrhundert bringen_Anna Huwe.docx"
 * oder "Strategie_10_Schule als Werkstatt der Zukunft_Nick_Klein.docx"
 */
export function parseSiPFileNameMeta(fileName: string): {
  motionNumber?: number;
  title: string;
  author?: string;
} {
  const clean = fileName
    .normalize('NFC')
    .replace(/^---\s*(?:Strategie|Antrag)\s*:\s*/i, '')
    .replace(/\s*---$/i, '')
    .replace(/\.(?:pdf|docx|doc|txt|md)$/i, '')
    .replace(/_strategie$/i, '')
    .trim();

  let rest = clean.replace(/^strategie[\s_\-]+/i, '').trim();
  let motionNumber: number | undefined;

  const numMatch = rest.match(/^(\d{1,2})[\._\-\s]+(.*)$/);
  if (numMatch) {
    motionNumber = parseInt(numMatch[1], 10);
    rest = numMatch[2].trim();
  }

  // Wenn "_" mit nachfolgendem Leerzeichen vorkommt (z.B. "Antrag aus dem Ausschuss_ Politische Bildung..."),
  // war das im Original ein Doppelpunkt oder Fragezeichen -> erst ab echte Autor-Suffixe ohne führendes Leerzeichen splitten
  const parts = rest
    .split('_')
    .map((p) => p.trim())
    .filter(Boolean);
  let author: string | undefined;
  let title = rest;

  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const secondLastPart = parts.length >= 3 ? parts[parts.length - 2] : undefined;
    const looksLikeFullPersonName = (s: string) =>
      /^[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+){1,2}$/.test(s);
    const looksLikeSingleNameToken = (s: string) => /^[A-ZÄÖÜ][a-zäöüß\-]{1,20}$/.test(s);

    if (
      secondLastPart &&
      looksLikeFullPersonName(lastPart) &&
      looksLikeFullPersonName(secondLastPart)
    ) {
      author = `${secondLastPart}, ${lastPart}`;
      title = parts.slice(0, -2).join(': ').trim();
    } else if (looksLikeFullPersonName(lastPart)) {
      author = lastPart;
      title = parts.slice(0, -1).join(': ').trim();
    } else if (
      secondLastPart &&
      looksLikeSingleNameToken(secondLastPart) &&
      looksLikeSingleNameToken(lastPart)
    ) {
      // z.B. "..._Nick_Klein" oder "..._Rania_Amina"
      author = `${secondLastPart} ${lastPart}`;
      title = parts.slice(0, -2).join(': ').trim();
    } else if (motionNumber !== undefined && looksLikeSingleNameToken(lastPart)) {
      // z.B. "Strategie_0_GO Antrag_Schmedler"
      author = lastPart;
      title = parts.slice(0, -1).join(': ').trim();
    } else {
      title = parts.join(': ').trim();
    }
  }

  return { motionNumber, title: title || clean, author };
}

/**
 * Prüft, ob eine Zeile eine typische Kopf- oder Fußzeile der SiP-Antragsmappe ist
 * (z.B. Seitenzahlen, Kopfzeile "Vorarlberger Schüler:innenparlament", "SIP", "Vorarlberg").
 */
export function isHeaderOrFooterLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^---\s*seite\s*\d+\s*---\s*$/i.test(trimmed)) return true;
  if (/^(?:vorarlberger\s+)?schüler(?:_|:|\*|\/)?innenparlament\s*$/i.test(trimmed)) return true;
  if (/^(?:sip\s+)?antragsmappe(?:\s+\d+[\.\/]\s*sip)?\s*$/i.test(trimmed)) return true;
  if (/^sip\s*$/i.test(trimmed)) return true;
  if (/^vorarlberg\s*$/i.test(trimmed)) return true;
  if (/^sip\s+vorarlberg\s*$/i.test(trimmed)) return true;
  if (/^\d{1,3}\s*$/.test(trimmed)) return true; // Standalone Seitenzahlen
  if (/^seite\s+\d+(?:\s*(?:von|\/)\s*\d+)?\s*$/i.test(trimmed)) return true;
  return false;
}

/**
 * Prüft, ob eine Zeile zum Inhaltsverzeichnis gehört (z.B. "Titel ......... 14" oder "Inhaltsverzeichnis:").
 */
function isTableOfContentsLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^inhaltsverzeichnis\s*[:.]?\s*$/i.test(trimmed)) return true;
  if (/\.{3,}\s*\d{1,3}\s*$/.test(trimmed)) return true;
  return false;
}

/**
 * Korrigiert durch PDF-Kerning getrennte Buchstaben wie "Kolanovi ć ," -> "Kolanović,".
 */
function cleanPdfKerningArtifacts(text: string): string {
  return text
    .replace(/([A-Za-zÄÖÜäöüß])\s+([ćčšžđĆČŠŽĐ])\s*,/g, '$1$2,')
    .replace(/([A-Za-zÄÖÜäöüß])\s+([ćčšžđĆČŠŽĐ])\b/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrahiert alle Hauptanträge aus dem Text der SiP-Antragsmappe.
 * Filtert Kopf-/Fußzeilen und Inhaltsverzeichnis vorab, trennt submitter und title strikt,
 * erfasst mehrzeilige Antragstitel, extrahiert Forderungen separat und schneidet Begründungen NICHT ab.
 */
export function parseAntragsmappeText(rawText: string): {
  hauptAntraege: ParsedHauptAntrag[];
  goExcluded: boolean;
} {
  if (!rawText || !rawText.trim()) {
    return { hauptAntraege: [], goExcluded: false };
  }

  const normalizedRaw = rawText.normalize('NFC');

  // 1. Geschäftsordnung (Anhang am Schluss der Antragsmappe) erkennen und abschneiden.
  // WICHTIG: Niemals im Inhaltsverzeichnis (Zeilen mit ".... 76") oder bei einem GO-Antrag abschneiden!
  let cleanText = normalizedRaw;
  let goExcluded = false;

  const rawAllLines = normalizedRaw.split(/\r?\n/);
  let lastAuthorLineIdx = -1;
  for (let i = 0; i < rawAllLines.length; i++) {
    if (
      /^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?)\s*[:\-]/i.test(
        rawAllLines[i].trim(),
      )
    ) {
      lastAuthorLineIdx = i;
    }
  }

  for (let i = Math.max(0, lastAuthorLineIdx + 1); i < rawAllLines.length; i++) {
    const t = rawAllLines[i].trim();
    if (!t || isTableOfContentsLine(t)) continue;
    if (/^(?:anhang\s*:?\s*)?geschäftsordnung(?:\s+des\s+vorarlberger|\s*\(go\)|\s*$)/i.test(t)) {
      cleanText = rawAllLines.slice(0, i).join('\n');
      goExcluded = true;
      break;
    }
  }

  // Fallback falls keine Antragsteller-Zeile im Dokument war, aber explizite Geschäftsordnung mit § 1 folgt
  if (!goExcluded) {
    const goAppendixRegex =
      /(?:\r?\n)\s*(?:---\s*seite\s*\d+\s*---\s*\r?\n\s*)?(?:anhang\s*:?\s*)?geschäftsordnung(?:\s+des\s+vorarlberger(?:\s+|\s*\r?\n\s*)schüler(?:_|:|\*|\/)?innenparlaments|\s*\(go\))?\s*(?:\r?\n)+\s*§\s*1\b/i;
    const goMatch = cleanText.match(goAppendixRegex);
    if (goMatch && typeof goMatch.index === 'number' && goMatch.index > 300) {
      cleanText = cleanText.slice(0, goMatch.index);
      goExcluded = true;
    }
  }

  // 2. Zerlege in Antragsblöcke
  let rawBlocks: string[] = [];

  // Variante A: Explizite Datei-Trenner "--- Antrag: ... ---"
  if (/---\s*Antrag\s*:/i.test(cleanText)) {
    rawBlocks = cleanText
      .split(/(?=---\s*Antrag\s*:)/gi)
      .map((b) => b.trim())
      .filter((b) => b.length > 15);
  }

  // Variante B: Zeilenbasierte Segmentierung anhand von "Antragsteller_in:" inkl. mehrzeiliger Titel davor
  if (rawBlocks.length <= 1) {
    const cleanedDocLines = cleanText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isHeaderOrFooterLine(l) && !isTableOfContentsLine(l));

    const authorIndices: number[] = [];
    for (let i = 0; i < cleanedDocLines.length; i++) {
      if (
        /^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?)\s*[:\-]/i.test(
          cleanedDocLines[i],
        )
      ) {
        authorIndices.push(i);
      }
    }

    if (authorIndices.length >= 1) {
      const blockStartIndices: number[] = [];
      const explicitMotionPrefixRegex =
        /^(?:(?:go[\s\-]*)?(?:haupt|initiativ)?antrag(?:\s+aus\s+dem\s+ausschuss|\s+zur\s+geschäftsordnung|\s*\d+)?\s*(?:[:\.]|$)|top\s*\d+)/i;

      for (let idx = 0; idx < authorIndices.length; idx++) {
        const aIdx = authorIndices[idx];
        const minAllowedIdx = idx === 0 ? 0 : authorIndices[idx - 1] + 2;
        let startIdx = Math.max(minAllowedIdx, aIdx - 1);

        // Prüfe bis zu 3 Zeilen vor "Antragsteller_in:" auf expliziten Antragskopf ("Antrag:", "GO Antrag:", "Initiativantrag aus dem Ausschuss: ...")
        for (let lookback = 3; lookback >= 1; lookback--) {
          const candIdx = aIdx - lookback;
          if (
            candIdx >= minAllowedIdx &&
            explicitMotionPrefixRegex.test(cleanedDocLines[candIdx])
          ) {
            startIdx = candIdx;
            break;
          }
        }

        // Falls kein explizites "Antrag:"-Label stand, prüfe ob der Titel über 2 Zeilen umgebrochen ist
        if (startIdx === aIdx - 1 && aIdx - 2 >= minAllowedIdx) {
          const prevLine = cleanedDocLines[aIdx - 2];
          const isBulletOrDemand =
            /^(?:[0-9]+[\.\)]|[\u2022\u2023\u25CF\u25CB\u25AA\u25AB\u25E6\u2043\u2219\uF0B7\uF0A7\*\-–]|\([0-9]+\))\s*/.test(
              prevLine,
            ) || /fordert/i.test(prevLine);
          const endsLikeSentence = /[.;!”"']$/.test(prevLine);
          if (!isBulletOrDemand && !endsLikeSentence && prevLine.length < 95) {
            startIdx = aIdx - 2;
          }
        }

        blockStartIndices.push(startIdx);
      }

      for (let idx = 0; idx < blockStartIndices.length; idx++) {
        const start = blockStartIndices[idx];
        const end =
          idx + 1 < blockStartIndices.length ? blockStartIndices[idx + 1] : cleanedDocLines.length;
        const blockStr = cleanedDocLines.slice(start, end).join('\n').trim();
        if (blockStr.length > 15) {
          rawBlocks.push(blockStr);
        }
      }
    }
  }

  // Variante C: Klassische "Antrag 1:", "Hauptantrag 2:", "TOP 1" Überschriften (falls kein "Antragsteller:" vorhanden)
  if (rawBlocks.length <= 1) {
    const primaryRegex =
      /(?=(?:^|\r?\n)(?:---\s*seite\s*\d+\s*---\s*\r?\n)?(?:(?:haupt)?antrag\s*\d+[:.]?|top\s*\d+[:.]?)\s*)/gi;
    const primarySplit = cleanText
      .split(primaryRegex)
      .map((b) => b.trim())
      .filter((b) => b.length > 15);
    if (primarySplit.length > 1) {
      rawBlocks = primarySplit;
    }
  }

  // Variante D: Fallback nummerierte Titel "1. Titel"
  if (rawBlocks.length <= 1) {
    const fallbackRegex =
      /(?=(?:^|\r?\n)(?:---\s*seite\s*\d+\s*---\s*\r?\n)?\d{1,2}\.\s+[A-ZÄÖÜ][^\r\n]{3,100}(?:\r?\n)+[^\r\n]*(?:antrags?steller|schule|antragstext|daher fordert))/gi;
    const fallbackSplit = cleanText
      .split(fallbackRegex)
      .map((b) => b.trim())
      .filter((b) => b.length > 15);
    rawBlocks =
      fallbackSplit.length > 1 ? fallbackSplit : rawBlocks.length > 0 ? rawBlocks : [cleanText];
  }

  const hauptAntraege: ParsedHauptAntrag[] = [];
  let counter = 1;

  for (const block of rawBlocks) {
    let fileMetaTitle = '';
    let fileMetaAuthor = '';
    let fileMetaNum: number | undefined;

    const fileBannerMatch = block.match(/^---\s*Antrag\s*:\s*([^\r\n]+?)\s*---/i);
    if (fileBannerMatch) {
      const parsedMeta = parseSiPFileNameMeta(fileBannerMatch[1]);
      fileMetaTitle = parsedMeta.title;
      fileMetaAuthor = parsedMeta.author || '';
      fileMetaNum = parsedMeta.motionNumber;
    }

    const strippedBlock = block
      .replace(/^---\s*Antrag\s*:\s*[^\r\n]+?\s*---/gi, '')
      .replace(/---\s*seite\s*\d+\s*---\s*/gi, '')
      .trim();

    // Zeilen filtern und wiederkehrende Header/Footer sowie Inhaltsverzeichnis vorab löschen
    const lines = strippedBlock
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isHeaderOrFooterLine(l) && !isTableOfContentsLine(l));

    if (lines.length === 0) continue;

    // Finde Zeile des Antragstellers (submitter)
    const authorLineIndex = lines.findIndex((l) =>
      /^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?)\s*[:\-]/i.test(
        l,
      ),
    );

    // Alle Zeilen vor authorLineIndex bilden den Antragskopf / Titel (auch mehrzeilig!)
    let titleLines: string[] = [];
    if (authorLineIndex > 0) {
      titleLines = lines.slice(0, authorLineIndex);
    } else {
      const explicitHeaderIndex = lines.findIndex((l) => /(?:(?:haupt)?antrag|top)\s*\d+/i.test(l));
      const hIdx = explicitHeaderIndex >= 0 ? explicitHeaderIndex : 0;
      titleLines = [lines[hIdx] || fileMetaTitle || lines[0]];
    }

    // Entferne reine Label-Zeilen wie "Antrag:" oder "GO Antrag:" wenn danach der eigentliche Titel folgt
    const filteredTitleLines = titleLines.filter(
      (l, idx) =>
        !(
          titleLines.length > 1 &&
          idx === 0 &&
          /^(?:(?:go[\s\-]*)?(?:haupt|initiativ)?antrag|top)\s*\d*\s*[:.]?\s*$/i.test(l)
        ),
    );

    const headerLine =
      (filteredTitleLines.length > 0 ? filteredTitleLines : titleLines).join(' ').trim() ||
      fileMetaTitle ||
      lines[0];

    // Ignoriere Deckblatt, Inhaltsverzeichnis oder reine Vorab-Kommentare
    const hasMotionIndicators =
      /(?:(?:haupt|initiativ)?antrag|top)\s*\d*/i.test(titleLines.join(' ')) ||
      authorLineIndex !== -1 ||
      /antragstext|(?:daher|darum|deshalb)\s+fordert|forderungspunkt\s*\d+/i.test(strippedBlock) ||
      Boolean(fileBannerMatch);

    if (
      /^inhaltsverzeichnis|^geschäftsordnung\s+des\s+vorarlberger|vorab-kommentierung|liebe\s+schüler/i.test(
        headerLine,
      ) ||
      !hasMotionIndicators
    ) {
      continue;
    }

    // 1. Antragsnummer isolieren
    const numMatch =
      titleLines[0]?.match(/\b(?:(?:haupt)?antrag|top)\s*(\d{1,2})\b/i) ||
      (lines[0] && /^\d{1,2}$/.test(lines[0]) ? [null, lines[0]] : null);
    const motionNum = fileMetaNum || (numMatch ? parseInt(numMatch[1], 10) : counter);
    const lineOrParagraph = `Antrag ${motionNum}`;

    // 2. Submitter (Antragsteller:in) isolieren – inkl. umgebrochener 2. Zeile (z.B. nach Komma)
    let author = fileMetaAuthor || 'Schüler:innenparlament';
    let extraAuthorLineIndex = -1;
    if (authorLineIndex >= 0) {
      const match = lines[authorLineIndex].match(
        /^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?)\s*[:\-]\s*(.+)$/i,
      );
      if (match && match[1]) {
        author = match[1].replace(/^[^\wÄÖÜäöüß]+/, '').trim();
        if (
          (/[,]$/.test(author) || /\bund$/i.test(author)) &&
          authorLineIndex + 1 < lines.length &&
          lines[authorLineIndex + 1].length < 60
        ) {
          author = `${author} ${lines[authorLineIndex + 1].trim()}`;
          extraAuthorLineIndex = authorLineIndex + 1;
        }
      }
    } else {
      const authorMatch = strippedBlock.match(
        /(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?)\s*[:\-]\s*([^\r\n]+)/i,
      );
      if (authorMatch && authorMatch[1]) {
        author = authorMatch[1].replace(/^[^\wÄÖÜäöüß]+/, '').trim();
      }
    }
    author = cleanPdfKerningArtifacts(author);

    // 3. Titel isolieren – niemals Antragsteller-Namen einbinden!
    let cleanTitle = cleanPdfKerningArtifacts(headerLine)
      .replace(
        /^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von)\s*[:\-].*$/i,
        '',
      )
      .replace(
        /^(?:(?:go[\s\-]*)?(?:haupt)?antrag(?:\s+\d+\s*[:.]?|\s*[:.])|top\s+\d+\s*[:.]?|\d{1,2}\.\s*)/i,
        '',
      )
      .trim();

    if (!cleanTitle && fileMetaTitle) {
      cleanTitle = fileMetaTitle;
    }
    if (!cleanTitle) {
      cleanTitle = `Antrag ${motionNum}`;
    }

    // 4. Forderungen & Begründungstext aus den Körperzeilen (nach der Antragsteller-Zeile) trennen
    const bodyStartIdx =
      authorLineIndex >= 0
        ? extraAuthorLineIndex >= 0
          ? extraAuthorLineIndex + 1
          : authorLineIndex + 1
        : filteredTitleLines.length;
    const bodyLines = lines.slice(bodyStartIdx);

    const forderungIntroRegex =
      /^(?:(?:daher|darum|deshalb|somit|hiermit)\s+fordert\s+.*[:\-]\s*|(?:das\s+)?(?:vorarlberger\s+)?(?:schüler(?:_|:|\*|\/)?innenparlament|sip[\s\-]*ausschuss)\s+fordert\s*[:\-]?\s*|fordert\s*[:\-]\s*)$/i;

    const forderungLineIdx = bodyLines.findIndex((l) => forderungIntroRegex.test(l));
    const forderungspunkte: string[] = [];
    let contentText = '';

    const bulletRegex =
      /^(?:[0-9]+[\.\)]|[\u2022\u2023\u25CF\u25CB\u25AA\u25AB\u25E6\u2043\u2219\uF0B7\uF0A7\*\-–]|\([0-9]+\))\s*/;

    if (forderungLineIdx >= 0) {
      const leadLines = bodyLines.slice(0, forderungLineIdx);
      const afterLines = bodyLines.slice(forderungLineIdx + 1);

      const leadInText = leadLines.join('\n\n').trim();
      let inDemands = true;
      const reasoningAfterLines: string[] = [];

      for (let i = 0; i < afterLines.length; i++) {
        const line = afterLines[i];
        if (/^[:\-–\s]+$/.test(line)) continue;

        if (/^(?:begründung|sachverhalt|erläuterung|anmerkung)\s*[:\-]?\s*$/i.test(line)) {
          inDemands = false;
          reasoningAfterLines.push(line);
          continue;
        }

        const isBullet = bulletRegex.test(line);

        if (inDemands) {
          if (isBullet) {
            const cleanFp = line.replace(bulletRegex, '').trim();
            if (cleanFp.length > 0) {
              forderungspunkte.push(cleanFp);
            }
          } else if (forderungspunkte.length > 0) {
            // Mehrzeilige Fortsetzung des aktuellen Forderungspunkts anhängen
            if (!/^(?:begründung|sachverhalt|erläuterung)\b/i.test(line)) {
              forderungspunkte[forderungspunkte.length - 1] += ' ' + line;
            } else {
              inDemands = false;
              reasoningAfterLines.push(line);
            }
          } else if (line.length > 3 && !/^(?:begründung|sachverhalt)\b/i.test(line)) {
            forderungspunkte.push(line);
          } else {
            inDemands = false;
            reasoningAfterLines.push(line);
          }
        } else {
          reasoningAfterLines.push(line);
        }
      }

      const afterDemandsText = reasoningAfterLines.join('\n\n').trim();
      const textParts = [leadInText, afterDemandsText].filter(Boolean);
      contentText = textParts.join('\n\n').trim();
    } else {
      contentText = bodyLines.join('\n\n').trim();
    }

    if (!contentText) contentText = strippedBlock;

    const finalIndex = counter++;
    const displayNum = fileMetaNum || finalIndex;
    const finalCleanTitle = /^antrag\s*\d+/i.test(cleanTitle)
      ? cleanTitle
      : `Antrag ${displayNum}: ${cleanTitle}`;

    const parsedMotion: ParsedHauptAntrag = {
      index: displayNum,
      rawTitle: headerLine,
      cleanTitle: finalCleanTitle,
      author,
      lineOrParagraph,
      content: contentText,
      text: contentText,
      forderungspunkte,
    };

    hauptAntraege.push(parsedMotion);

    console.log(
      `[PARSED] Typ: HAUPTANTRAG | Titel: ${parsedMotion.cleanTitle} | Submitter: ${parsedMotion.author} | Textlänge: ${parsedMotion.content.length} | Forderungen: ${parsedMotion.forderungspunkte.length}`,
    );
  }

  return { hauptAntraege, goExcluded };
}

function isPlaceholderClaim(candidate: string): boolean {
  const cleaned = candidate.replace(/[\s\-_.?!]/g, '').toLowerCase();
  if (!cleaned || cleaned.length <= 1) return true;
  if (/^\d+$/.test(cleaned)) return true;
  if (/^x+$/i.test(cleaned)) return true; // XX, XXX, x
  if (/^(?:tbd|offen|frei|niemand|none|null|n\/a|folgt|tba|alle|nichtamanfang)$/i.test(cleaned))
    return true;
  if (/^(?:fp|forderungspunkt|z|zeile)\d*$/i.test(cleaned)) return true;
  if (/zusammenmit/i.test(cleaned)) return true;
  return false;
}

export interface ExtractedSubMotion {
  targetMotionNumber?: number;
  targetMotionTitle?: string;
  type: AntragType;
  title: string;
  content: string;
  text: string;
  lineOrParagraph?: string;
  author?: string;
  claimedBy?: string;
}

/**
 * Prüft, ob eine Zeile der Start eines neuen Nebenantrags oder einer Wortmeldung ist.
 * Unterstützt alle realen SiP-Strategie-Formate:
 * - "WM1 (Simon): Wortmeldung zu FP2"
 * - "WM (Nick):" / "WM (Sophia)" / "WM Oskar" / "WM (Kaspar:" / "WM ():"
 * - "SA: ..." / "SA (Jule): ..." / "SA kathi:" / "Möglicher SA: ..."
 * - "AÄ: ..." / "ÄA FP 3 (Katharina Nigg): ..." / "Möglicher AÄ: ..." / "Antwort ÄA: ..." / "→ AÄ: ..."
 * - "EA (Giovanna): ..." / "Eventuell EA: ..."
 * - "Ende der Debatte (ian): ..." / "ENDE DER DEBATTE: ..."
 */
function matchSubMotionHeaderLine(line: string): {
  type: AntragType;
  numSuffix?: string;
  meta: string;
  inlineText: string;
} | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Kategorie-Überschriften wie "Unterstützende WM:", "WM zu Auslandspraktika:", "SA unterstützende WM:" sind KEINE eigenen Anträge
  if (
    /^(?:(?:sa\s+)?unterstützende\s+wm|wm\s+(?:zu|von)\s+|allgemein\s+zum\s+fp)\b/i.test(trimmed)
  ) {
    return null;
  }

  // 1. Ende der Debatte
  const eddMatch = trimmed.match(
    /^(?:ende\s+der\s+debatte(?:\s*\/\s*letzte\s+minute)?|schluss\s+der\s+debatte)\s*(\([^)]*\))?\s*(?:[:\-]\s*(.*))?$/i,
  );
  if (eddMatch) {
    return {
      type: 'ENDE_DEBATTE',
      meta: (eddMatch[1] || '').trim(),
      inlineText: (eddMatch[2] || '').trim(),
    };
  }

  // 2. WM / ÄA / AÄ / AÄA / EA / SA (inkl. Präfixe wie "Möglicher AÄ:", "Eventuell EA:", "Antwort ÄA:", "→ AÄ:", "Wenn nein nur 5: AÄ:")
  const subRegex =
    /^(?:(?:→|->|•|\-|\([xX\?\s\-]*\))\s*)?(?:(?:mögliche[rs]?|eventuell(?:er)?|spontaner|antwort|falls\s+[^:]{1,25}?|wenn\s+[^:]{1,25}?)\s*[:\-]?\s*)?(\[?(?:AÄA|ÄA|AÄ|EA|SA|WM)\s*(\d*)\]?)(?=\s|\(|:|\/|\-|$)(.*)$/i;
  const match = trimmed.match(subRegex);
  if (!match || !match[1]) return null;

  const rawTypeToken = match[1].toUpperCase().replace(/[\[\]\s\d]/g, '');
  const numSuffix = match[2] || undefined;
  const remainder = (match[3] || '').trim();

  // Verhindere Fehlalarme bei Fließtextzeilen, die zufällig mit "SA" oder "WM" o.ä. verwechselt würden
  // Ein echter Header hat entweder ":", "(", Ende der Zeile, "- DF", oder einen kurzen Namen vor ":" / Ende
  const hasColon = remainder.includes(':');
  const startsWithParen = remainder.startsWith('(');
  const isEmptyRemainder = remainder.length === 0;
  const isShortNameWithoutColon =
    !hasColon &&
    !startsWithParen &&
    remainder.length > 0 &&
    remainder.length <= 28 &&
    /^(?:[\-\s]*df\b|[A-Za-zÄÖÜäöüß\s\(\)\-!?.]+)$/i.test(remainder);

  if (!hasColon && !startsWithParen && !isEmptyRemainder && !isShortNameWithoutColon) {
    return null;
  }

  let detectedType: AntragType = 'AAA';
  if (rawTypeToken.includes('EA')) detectedType = 'EA';
  else if (rawTypeToken.includes('SA')) detectedType = 'SA';
  else if (rawTypeToken.includes('WM')) detectedType = 'WM';
  else if (rawTypeToken.includes('ÄA') || rawTypeToken.includes('AÄ')) detectedType = 'AAA';

  let meta = '';
  let inlineText = '';

  if (hasColon) {
    // Finde den ersten Doppelpunkt, der nach einer evtl. geöffneten Klammer liegt
    const closeParenIdx = remainder.indexOf(')');
    const firstColonIdx = remainder.indexOf(':');
    let splitColonIdx = firstColonIdx;

    // Bei "AÄ:(Kathi):Eine Änderung..." liegt nach dem ersten ":" noch "(Kathi):"
    if (firstColonIdx === 0) {
      const afterFirstColon = remainder.slice(1).trim();
      const secondMatch = afterFirstColon.match(/^(\([^)]+\))\s*:\s*(.*)$/);
      if (secondMatch) {
        meta = secondMatch[1].trim();
        inlineText = secondMatch[2].trim();
        return { type: detectedType, numSuffix, meta, inlineText };
      }
    }

    if (closeParenIdx > firstColonIdx) {
      const colonAfterParen = remainder.indexOf(':', closeParenIdx);
      if (colonAfterParen !== -1) splitColonIdx = colonAfterParen;
    }

    meta = remainder.slice(0, splitColonIdx).trim();
    inlineText = remainder.slice(splitColonIdx + 1).trim();
  } else {
    meta = remainder;
    inlineText = '';
  }

  return {
    type: detectedType,
    numSuffix,
    meta,
    inlineText,
  };
}

/**
 * PHASE 2: Reiner ZULIEFERER für Nebenanträge und Wortmeldungen aus Strategiedokumenten (.docx).
 * Arbeitet strikt nach dem BUFFER-PATTERN (Multiline-Erfassung):
 * Sobald ein Nebenantrag / eine Wortmeldung erkannt wird, wird das aktive Puffer-Objekt erstellt.
 * JEDE darauffolgende Textzeile, die kein neuer Antrag (und kein neuer Abschnitt/Dateitrenner) ist,
 * wird mit `\n` an das Feld `text` (und `content`) des aktuell aktiven Antrags angehängt.
 * Der Text endet erst, wenn der nächste Antrag beginnt, ein neuer Abschnitt startet oder das Dokument zu Ende ist.
 */
export function parseStrategieSubMotions(rawText: string): {
  subMotions: ExtractedSubMotion[];
  generalStrategyNotes: string;
} {
  if (!rawText || !rawText.trim()) {
    return { subMotions: [], generalStrategyNotes: '' };
  }

  const normalizedRaw = rawText.normalize('NFC');
  const lines = normalizedRaw.split(/\r?\n/);
  const subMotions: ExtractedSubMotion[] = [];
  const generalNotesLines: string[] = [];

  let currentTargetMotionNumber: number | undefined;
  let currentTargetMotionTitle: string | undefined;
  let activeForderungspunkt: string | undefined;
  let expectingDocFirstHeading = false;

  // BUFFER-PATTERN: Aktuell geöffneter Nebenantrag / Wortmeldung
  let activeBuffer: (ExtractedSubMotion & { numSuffix?: string }) | null = null;

  const flushActiveBuffer = () => {
    if (!activeBuffer) return;

    let finalText = (activeBuffer.text || '').trim();

    if (finalText) {
      finalText = finalText.replace(/^\([xX\?\s\-]+\)[:\s-]*/, '').trim();
      if (activeBuffer.claimedBy) {
        const escapedClaim = activeBuffer.claimedBy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        finalText = finalText
          .replace(new RegExp(`^\\(${escapedClaim}[\\-!\\s]*\\)[:\\s-]*`, 'i'), '')
          .trim();
      }
    }

    const fpOnlyMatch = finalText.match(/(?:(?:zu\s+|zur\s+)?(?:fp|forderungspunkt)\s*(\d+))/i);
    if (
      fpOnlyMatch &&
      (!activeBuffer.lineOrParagraph || activeBuffer.lineOrParagraph.length === 0)
    ) {
      activeBuffer.lineOrParagraph = `FP ${fpOnlyMatch[1]}`;
    }

    if (!finalText) {
      const typeDesc =
        activeBuffer.type === 'SA'
          ? 'Streichungsantrag'
          : activeBuffer.type === 'EA'
            ? 'Erweiterungsantrag'
            : activeBuffer.type === 'AAA'
              ? 'Abänderungsantrag'
              : activeBuffer.type === 'ENDE_DEBATTE'
                ? 'Antrag auf Ende der Debatte'
                : 'Wortmeldung';
      finalText = activeBuffer.lineOrParagraph
        ? `${typeDesc} zu ${activeBuffer.lineOrParagraph}`
        : `${typeDesc} zum vorliegenden Hauptantrag`;
    }

    const shortType =
      activeBuffer.type === 'AAA'
        ? 'ÄA'
        : activeBuffer.type === 'ENDE_DEBATTE'
          ? 'Ende der Debatte'
          : activeBuffer.type;
    const typeLabel = activeBuffer.numSuffix ? `${shortType} ${activeBuffer.numSuffix}` : shortType;
    const cleanFp = activeBuffer.lineOrParagraph
      ? activeBuffer.lineOrParagraph.replace(/^(?:zu|zur)\s+/i, '').trim()
      : undefined;
    const finalTitle = cleanSubMotionTitle(cleanFp ? `${typeLabel} (${cleanFp})` : typeLabel);

    const completedSubMotion: ExtractedSubMotion = {
      targetMotionNumber: activeBuffer.targetMotionNumber,
      targetMotionTitle: activeBuffer.targetMotionTitle,
      type: activeBuffer.type,
      title: finalTitle,
      text: finalText,
      content: finalText,
      lineOrParagraph: activeBuffer.lineOrParagraph,
      claimedBy: activeBuffer.claimedBy,
      author: activeBuffer.author || activeBuffer.claimedBy || 'Delegierte:r',
    };

    subMotions.push(completedSubMotion);

    console.log(
      `[PARSED] Typ: ${completedSubMotion.type} | Titel: ${completedSubMotion.title} | Submitter: ${
        completedSubMotion.claimedBy || completedSubMotion.author || 'Delegierte:r'
      } | Textlänge: ${completedSubMotion.text.length}`,
    );

    activeBuffer = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 1. Datei-Trenner "--- Strategie: <Dateiname> ---" -> Aktiven Puffer abschließen!
    const fileBannerMatch = line.match(/^---\s*Strategie\s*:\s*(.+?)\s*---$/i);
    if (fileBannerMatch) {
      flushActiveBuffer();
      const rawFileName = fileBannerMatch[1].trim();
      activeForderungspunkt = undefined;
      expectingDocFirstHeading = true;

      if (!/erweiterungs.*abänderungs|sammel|legende|formatierung/i.test(rawFileName)) {
        const meta = parseSiPFileNameMeta(rawFileName);
        currentTargetMotionNumber = meta.motionNumber;
        currentTargetMotionTitle = meta.title;
      } else {
        currentTargetMotionNumber = undefined;
        currentTargetMotionTitle = undefined;
      }
      continue;
    }

    // Falls die allererste Zeile im DOCX der volle Antragstitel ist (z.B. "LSV-Arbeit muss kein Geheimnis sein! - Adrian Schmedler"),
    // nutze diesen für noch präziseres Titel-Matching, sofern es kein Strategie-/FP-/Nebenantrags-Header ist.
    if (expectingDocFirstHeading) {
      expectingDocFirstHeading = false;
      if (
        !matchSubMotionHeaderLine(line) &&
        !/^(?:strategie|gegenwehr|info|forderungspunkt)\b/i.test(line) &&
        line.length < 120
      ) {
        const docHeadingTitle = line.split(/\s+[\-–]\s+/)[0].trim();
        if (
          docHeadingTitle.length >= 5 &&
          (!currentTargetMotionTitle || currentTargetMotionTitle.length < docHeadingTitle.length)
        ) {
          currentTargetMotionTitle = docHeadingTitle;
        }
        continue;
      }
    }

    // 2. Überschriften in Sammeldateien erkennen (z. B. "Antrag 1:", "Antrag 2", "TOP 3") -> Puffer abschließen!
    const headerMatch = line.match(
      /^(?:strategie\s+(?:für|zu)\s+)?(?:haupt)?antrag\s*(\d+)[:.]?\s*(.*)$/i,
    );
    if (headerMatch) {
      flushActiveBuffer();
      currentTargetMotionNumber = parseInt(headerMatch[1], 10);
      currentTargetMotionTitle = headerMatch[2]?.trim() || undefined;
      activeForderungspunkt = undefined;
      continue;
    }

    // Nummerierte Überschriften wie "1. Titel..."
    const numHeaderMatch = line.match(/^(\d{1,2})\.\s+([A-ZÄÖÜ].*)$/);
    if (numHeaderMatch && line.length < 120 && !matchSubMotionHeaderLine(line)) {
      flushActiveBuffer();
      currentTargetMotionNumber = parseInt(numHeaderMatch[1], 10);
      currentTargetMotionTitle = numHeaderMatch[2].trim();
      activeForderungspunkt = undefined;
      continue;
    }

    // 3. Forderungspunkt-Abschnittsüberschrift ("Forderungspunkt X" oder "Forderungspunkt X:") -> Puffer abschließen!
    const fpSectionMatch = line.match(/^forderungspunkt\s*(\d+)\s*[:.]?\s*$/i);
    if (fpSectionMatch) {
      flushActiveBuffer();
      activeForderungspunkt = `FP ${fpSectionMatch[1]}`;
      continue;
    }

    // 4. Prüfe, ob ein neuer Nebenantrag / eine neue Wortmeldung beginnt
    const subHeader = matchSubMotionHeaderLine(line);
    if (subHeader) {
      // Vorherigen Antrag im Puffer abschließen
      flushActiveBuffer();

      const { type: detectedType, numSuffix, meta, inlineText } = subHeader;

      // Zeilen- oder Forderungspunktbezug ermitteln
      let lineOrParagraph: string | undefined;
      const fpMatch = (meta + ' ' + inlineText).match(
        /(?:(?:zu\s+|zur\s+)?(?:fp|forderungspunkt|zeile|z\.)\s*\d+|§\s*\d+)/i,
      );
      if (fpMatch) {
        lineOrParagraph = fpMatch[0].replace(/^(?:zu|zur)\s+/i, '').trim();
      } else if (activeForderungspunkt) {
        lineOrParagraph = activeForderungspunkt;
      }

      // Redner:in / Claim ermitteln (z.B. "(Simon)", "(Emma Battlogg)", "(Kaspar" oder "SA kathi:")
      let claimedBy: string | undefined;
      const parenMatches = Array.from(
        (meta + ' ' + inlineText.slice(0, 50)).matchAll(/\(([^)]+)\)?/g),
      );
      for (const m of parenMatches) {
        const rawCandidate = m[1]
          .replace(/\b(?:zu|zur)?\s*(?:fp|forderungspunkt)\s*\d+\b/gi, '')
          .replace(/^x+(?=[a-zäöüß]{3,})/i, '') // z.B. "Xkaspar" -> "kaspar"
          .replace(/[\-!\s]+$/g, '')
          .replace(/^[\-!\s]+/g, '')
          .trim();
        if (!isPlaceholderClaim(rawCandidate)) {
          claimedBy = rawCandidate;
          break;
        }
      }

      // Falls der Name ohne Klammern im Meta-Feld stand (z.B. "SA kathi", "WM Oskar", "SA Oskar")
      if (!claimedBy && meta) {
        const bareMeta = meta
          .replace(/[()\[\]]/g, '')
          .replace(/\b(?:zu|zur)?\s*(?:fp|forderungspunkt|df)\s*\d*\b/gi, '')
          .replace(/[\-!\s]+$/g, '')
          .replace(/^[\-!\s]+/g, '')
          .trim();
        if (
          bareMeta &&
          bareMeta.length >= 2 &&
          bareMeta.length <= 25 &&
          !isPlaceholderClaim(bareMeta)
        ) {
          claimedBy = bareMeta;
        }
      }

      // Neues Puffer-Objekt anlegen
      activeBuffer = {
        targetMotionNumber: currentTargetMotionNumber,
        targetMotionTitle: currentTargetMotionTitle,
        type: detectedType,
        numSuffix,
        title: '',
        text: inlineText,
        content: inlineText,
        lineOrParagraph,
        claimedBy: claimedBy || undefined,
        author: claimedBy || 'Delegierte:r',
      };
      continue;
    }

    // 5. Dokumentweite Metadaten-/Strategie-Blöcke oder Kategorie-Labels beenden einen aktiven Puffer
    if (
      /^(?:(?:sa\s+)?unterstützende\s+wm|wm\s+(?:zu|von)\s+|allgemein\s+zum\s+fp)\b/i.test(line) ||
      /^(?:mögliche\s+gegenargumente|wichtige\s+bildungspolitische\s+infos|auszug\s+aus\s+der\s+lbvo|rechtliche\s+grundlagen|hilfreiche\s+strategien)\b/i.test(
        line,
      ) ||
      /^(?:antrags?steller(?:_?innen|_?in|:?innen|:?in)?|eingereicht\s*von|autor(?:_?in|:?in)?|antragstext|siehe\s+sip-?antragsmappe|strategie(?:\s*\(extern\))?|gegenwehr|info(?:rmation|s)?)\s*[:\-]/i.test(
        line,
      ) ||
      /^(?:mögliche\s+df|interne\s+df|df|direktfrage|direkte\s+frage|mögliche\s+problemstellung|problem(?:stellung)?)\s*(?:\d+|\([^)]*\))?\s*[:\-]/i.test(
        line,
      )
    ) {
      flushActiveBuffer();
      if (/^strategie(?:\s*\(extern\))?\s*[:\-]/i.test(line)) {
        const prefix = currentTargetMotionTitle ? `[${currentTargetMotionTitle}] ` : '';
        generalNotesLines.push(`${prefix}${line}`);
      }
      continue;
    }

    // 6. BUFFER-PATTERN MULTILINE-ERFASSUNG:
    // Wenn ein Nebenantrag / eine Wortmeldung im Puffer aktiv ist, wird JEDE darauffolgende
    // Textzeile, die kein neuer Antrag ist, mit \n an das Feld `text` (und `content`) angehängt!
    if (activeBuffer) {
      activeBuffer.text = activeBuffer.text ? `${activeBuffer.text}\n${line}` : line;
      activeBuffer.content = activeBuffer.text;
    } else if (!currentTargetMotionNumber && !currentTargetMotionTitle) {
      generalNotesLines.push(line);
    }
  }

  // Letzten offenen Puffer am Dokumentende abschließen
  flushActiveBuffer();

  return {
    subMotions,
    generalStrategyNotes: generalNotesLines.join('\n').trim(),
  };
}

/**
 * Abwärtskompatible Wrapper-Funktion für parseStrategieText
 */
export function parseStrategieText(rawText: string): {
  sections: ParsedStrategieSection[];
  generalStrategyNotes: string;
} {
  const { subMotions, generalStrategyNotes } = parseStrategieSubMotions(rawText);
  const sections: ParsedStrategieSection[] = [];
  const map = new Map<number | string, ParsedStrategieSection>();

  for (const sm of subMotions) {
    const key = sm.targetMotionTitle ?? sm.targetMotionNumber ?? 'global';
    let sec = map.get(key);
    if (!sec) {
      sec = {
        motionNumber: sm.targetMotionNumber,
        motionTitle:
          sm.targetMotionTitle ||
          (sm.targetMotionNumber
            ? `Antrag ${sm.targetMotionNumber}`
            : 'Allgemeine Strategieanträge'),
        subAntraege: [],
      };
      map.set(key, sec);
      sections.push(sec);
    }
    sec.subAntraege.push({
      type: sm.type,
      title: sm.title,
      content: sm.content,
      text: sm.text,
      lineOrParagraph: sm.lineOrParagraph,
      author: sm.author,
      claimedBy: sm.claimedBy,
    });
  }

  return { sections, generalStrategyNotes };
}

/**
 * Erstellt die Hauptantrag-Objekte (SipAntrag[]) direkt aus dem geparsten PDF-Ergebnis.
 */
export function createHauptantraegeFromParsed(
  hauptAntraege: ParsedHauptAntrag[],
  baseTimestamp: number = Date.now(),
): SipAntrag[] {
  return hauptAntraege.map((h, hIdx) => ({
    id: `antrag_${hIdx + 1}`,
    type: 'HAUPTANTRAG' as const,
    orderIndex: hIdx,
    title: h.cleanTitle,
    author: h.author || 'Schüler:innenparlament',
    rede: h.content,
    content: h.content,
    text: h.text || h.content,
    forderungspunkte: h.forderungspunkte || [],
    lineOrParagraph: h.lineOrParagraph || `Antrag ${hIdx + 1}`,
    targetMotionNumber: h.index || hIdx + 1,
    targetMotionTitle: h.cleanTitle,
    isPreFab: false,
    status: 'approved' as const,
    claimedBy: null,
    claimedAt: null,
    isActive: false,
    createdAt: new Date(baseTimestamp + hIdx * 1000).toISOString(),
  }));
}

/**
 * Erstellt vorläufige oder verknüpfte Nebenantrag-Objekte (SipAntrag[]) aus den DOCX-SubMotions.
 */
export function createNebenantraegeFromExtracted(
  subMotions: ExtractedSubMotion[],
  hauptantraege: SipAntrag[] = [],
  baseTimestamp: number = Date.now(),
): {
  nebenantraege: SipAntrag[];
  matchedSectionsCount: number;
} {
  const nebenantraege: SipAntrag[] = [];
  const subCounterPerParent: Record<string, number> = {};
  let matchedCount = 0;

  for (let idx = 0; idx < subMotions.length; idx++) {
    const sub = subMotions[idx];
    let parent: SipAntrag | undefined;

    if (hauptantraege.length > 0) {
      // Priorität 1a: Exakter normalisierter Titel-Match
      if (sub.targetMotionTitle) {
        const normTarget = normalizeTitleForMatching(sub.targetMotionTitle);
        if (normTarget) {
          parent = hauptantraege.find((h) => normalizeTitleForMatching(h.title) === normTarget);
        }
        // Priorität 1b: Ähnlichkeits-/Teilstring-Titel-Match
        if (!parent) {
          parent = hauptantraege.find((h) => isTitleMatching(sub.targetMotionTitle!, h.title));
        }
      }
      // Priorität 2: Über Antragsnummer
      if (!parent && sub.targetMotionNumber !== undefined) {
        parent = hauptantraege.find(
          (h, hIdx) => (h.targetMotionNumber ?? hIdx + 1) === sub.targetMotionNumber,
        );
      }
      if (parent) {
        matchedCount++;
      } else {
        parent = hauptantraege[0];
      }
    }

    const parentId = parent?.id;
    const parentOrderIndex = parent?.orderIndex ?? 0;
    const parentKey =
      parentId || sub.targetMotionTitle || `unlinked_${sub.targetMotionNumber ?? 0}`;
    const subIdx = (subCounterPerParent[parentKey] || 0) + 1;
    subCounterPerParent[parentKey] = subIdx;

    const fullText = sub.text || sub.content;
    nebenantraege.push({
      id: parentId ? `${parentId}_sub_${subIdx}` : `antrag_sub_${idx + 1}`,
      parentAntragId: parentId,
      orderIndex: parentId ? parentOrderIndex + subIdx / 1000 : idx / 1000,
      type: sub.type,
      title: cleanSubMotionTitle(sub.title),
      content: fullText,
      text: fullText,
      lineOrParagraph: sub.lineOrParagraph || parent?.lineOrParagraph,
      targetMotionNumber: sub.targetMotionNumber,
      targetMotionTitle: sub.targetMotionTitle,
      author: sub.author || 'Delegierte:r',
      claimedBy: sub.claimedBy || null,
      claimedAt: sub.claimedBy ? new Date().toISOString() : null,
      isPreFab: false,
      status: 'approved' as const,
      isActive: false,
      createdAt: new Date(baseTimestamp + parentOrderIndex * 1000 + subIdx * 100).toISOString(),
    });
  }

  return { nebenantraege, matchedSectionsCount: matchedCount };
}

/**
 * Verknüpft bereits im State gespeicherte Nebenanträge (pendingNebenantraege) mit den
 * (ggf. manuell nachgeladenen) Hauptanträgen (pendingHauptantraege) und führt den expliziten Merge durch.
 */
export function mergeHauptAndNebenantraege(
  hauptantraegeInput: SipAntrag[],
  nebenantraegeInput: SipAntrag[],
  baseTimestamp: number = Date.now(),
): {
  finalMotions: SipAntrag[];
  hauptantraege: SipAntrag[];
  nebenantraege: SipAntrag[];
  matchedSectionsCount: number;
} {
  const hauptantraege = hauptantraegeInput.map((h, hIdx) => ({
    ...h,
    id: h.id || `antrag_${hIdx + 1}`,
    type: 'HAUPTANTRAG' as const,
    orderIndex: h.orderIndex ?? hIdx,
    text: h.text || h.content,
    content: h.content || h.text || '',
    isPreFab: false,
  }));

  const subCounterPerParent: Record<string, number> = {};
  let matchedCount = 0;

  const nebenantraege = nebenantraegeInput.map((sub, idx) => {
    let parent: SipAntrag | undefined;

    if (hauptantraege.length > 0) {
      if (sub.targetMotionTitle) {
        const normTarget = normalizeTitleForMatching(sub.targetMotionTitle);
        if (normTarget) {
          parent = hauptantraege.find((h) => normalizeTitleForMatching(h.title) === normTarget);
        }
        if (!parent) {
          parent = hauptantraege.find((h) => isTitleMatching(sub.targetMotionTitle!, h.title));
        }
      }
      if (!parent && sub.parentAntragId) {
        parent = hauptantraege.find((h) => h.id === sub.parentAntragId);
      }
      if (!parent && sub.targetMotionNumber !== undefined) {
        parent = hauptantraege.find(
          (h, hIdx) => (h.targetMotionNumber ?? hIdx + 1) === sub.targetMotionNumber,
        );
      }
      if (parent) {
        matchedCount++;
      } else {
        parent = hauptantraege[0];
      }
    }

    const parentId = parent?.id;
    const parentOrderIndex = parent?.orderIndex ?? 0;
    const parentKey = parentId || 'global';
    const subIdx = (subCounterPerParent[parentKey] || 0) + 1;
    subCounterPerParent[parentKey] = subIdx;

    const fullText = sub.text || sub.content || '';
    return {
      ...sub,
      id: parentId ? `${parentId}_sub_${subIdx}` : sub.id || `antrag_sub_${idx + 1}`,
      parentAntragId: parentId,
      orderIndex: parentId ? parentOrderIndex + subIdx / 1000 : (sub.orderIndex ?? idx / 1000),
      content: fullText,
      text: fullText,
      lineOrParagraph: sub.lineOrParagraph || parent?.lineOrParagraph,
      isPreFab: false,
      createdAt:
        sub.createdAt ||
        new Date(baseTimestamp + parentOrderIndex * 1000 + subIdx * 100).toISOString(),
    };
  });

  const finalMotions = [...hauptantraege, ...nebenantraege];
  console.log(
    'FINAL MERGE: Hauptanträge:',
    hauptantraege.length,
    'Nebenanträge:',
    nebenantraege.length,
    'Gesamt:',
    finalMotions.length,
  );

  return {
    finalMotions,
    hauptantraege,
    nebenantraege,
    matchedSectionsCount: matchedCount,
  };
}

/**
 * Kombiniert Hauptanträge aus der SiP-Antragsmappe und Zulieferungen aus der Strategie.
 */
export function combineAntragsmappeAndStrategie(
  antragsmappeText: string,
  strategieText: string,
  baseTimestamp: number = Date.now(),
): {
  antraege: SipAntrag[];
  hauptantraege: SipAntrag[];
  nebenantraege: SipAntrag[];
  strategyNotes: string;
  summary: {
    hauptAntraegeCount: number;
    subAntraegeCount: number;
    matchedSectionsCount: number;
    goExcluded: boolean;
  };
} {
  // 1. Array aus dem PDF-Parser liefert alle Hauptanträge
  const { hauptAntraege, goExcluded } = parseAntragsmappeText(antragsmappeText);
  console.log(`[PDF-PARSER] Anzahl gefundener Hauptanträge aus PDF: ${hauptAntraege.length}`);
  const hauptantraege = createHauptantraegeFromParsed(hauptAntraege, baseTimestamp);

  // 2. Array aus dem DOCX-Parser liefert alle Nebenanträge und Wortmeldungen (Buffer-Pattern)
  const { subMotions, generalStrategyNotes } = parseStrategieSubMotions(strategieText);
  console.log(
    `[DOCX-PARSER] Anzahl gefundener Nebenanträge/Wortmeldungen aus DOCX: ${subMotions.length}`,
  );
  const { nebenantraege: rawNebenantraege } = createNebenantraegeFromExtracted(
    subMotions,
    hauptantraege,
    baseTimestamp,
  );

  // 3. Expliziter Merge-Schritt
  const { finalMotions, nebenantraege, matchedSectionsCount } = mergeHauptAndNebenantraege(
    hauptantraege,
    rawNebenantraege,
    baseTimestamp,
  );

  return {
    antraege: finalMotions,
    hauptantraege,
    nebenantraege,
    strategyNotes: generalStrategyNotes,
    summary: {
      hauptAntraegeCount: hauptantraege.length,
      subAntraegeCount: nebenantraege.length,
      matchedSectionsCount,
      goExcluded,
    },
  };
}

/**
 * Erkennt automatisch in einem übergebenen Ordner (z.B. Google Drive SiP-Ordner)
 * oder einer Dateiliste:
 * 1. Die Antragsmappe (PDF mit "Antragsmappe" im Namen)
 * 2. Alle Strategiedateien (im Unterordner "Strategie" oder mit "Strategie" / .docx / .txt)
 */
export function classifySiPFolderFiles(files: File[] | FileList): {
  antragsmappeFile?: File;
  strategieFiles: File[];
  unrecognizedFiles: File[];
  goFileFile?: File;
} {
  const fileArray = Array.from(files);
  const goFileFile = fileArray.find(
    (file) => file.name.includes('GO') && /\.pdf$/i.test(file.name),
  );
  let antragsmappeFile: File | undefined;
  const strategieFiles: File[] = [];
  const unrecognizedFiles: File[] = [];

  // 1. Suche nach der Antragsmappe: Name enthält "antragsmappe" und endet mit ".pdf"
  antragsmappeFile = fileArray.find((f) => {
    const name = f.name.normalize('NFC').toLowerCase();
    return (
      f !== goFileFile &&
      name.includes('antragsmappe') &&
      name.endsWith('.pdf') &&
      !name.includes('kommentierung')
    );
  });

  if (!antragsmappeFile) {
    antragsmappeFile = fileArray.find((f) => {
      const name = f.name.normalize('NFC').toLowerCase();
      return f !== goFileFile && name.includes('antragsmappe') && name.endsWith('.pdf');
    });
  }

  // Falls nicht direkt über "Antragsmappe" im Namen gefunden: Erste PDF-Datei außerhalb von "Strategie"
  if (!antragsmappeFile) {
    antragsmappeFile = fileArray.find((f) => {
      const relPath = (f.webkitRelativePath || f.name).normalize('NFC').toLowerCase();
      return (
        f !== goFileFile &&
        f.name.toLowerCase().endsWith('.pdf') &&
        !relPath.includes('/strategie/')
      );
    });
  }

  // 2. Suche nach Strategiedateien (Unterordner "Strategie", Name mit "strategie" oder DOCX/TXT)
  for (const f of fileArray) {
    if (f === antragsmappeFile || f === goFileFile) continue;
    const name = f.name.normalize('NFC').toLowerCase();
    const relPath = (f.webkitRelativePath || f.name).normalize('NFC').toLowerCase();

    // Versteckte oder Word-Lockdateien ignorieren (~$Antrag.docx, .DS_Store)
    if (f.name.startsWith('~$') || f.name.startsWith('.')) continue;

    const isInStrategieFolder =
      relPath.includes('/strategie/') || relPath.includes('\\strategie\\');
    const isDocxOrTxt =
      name.endsWith('.docx') ||
      name.endsWith('.doc') ||
      name.endsWith('.txt') ||
      name.endsWith('.md');
    const isStrategieName = name.includes('strategie');

    if (
      isInStrategieFolder ||
      (isDocxOrTxt && (isStrategieName || isInStrategieFolder || !antragsmappeFile))
    ) {
      strategieFiles.push(f);
    } else if (isDocxOrTxt) {
      strategieFiles.push(f);
    } else {
      unrecognizedFiles.push(f);
    }
  }

  return { antragsmappeFile, strategieFiles, unrecognizedFiles, goFileFile };
}

/**
 * Extrahiert den Text aus einer einzelnen Strategie-Datei (DOCX oder Text).
 */
async function extractTextFromSingleStrategieFile(
  file: File | ArrayBuffer,
  fileName: string = '',
): Promise<string> {
  let text = '';
  const lowerName = fileName.toLowerCase();
  const isDocx = lowerName.endsWith('.docx') || lowerName.endsWith('.doc');

  if (file instanceof ArrayBuffer) {
    if (isDocx) {
      text = await extractTextFromDocxArrayBuffer(file);
    } else {
      text = new TextDecoder('utf-8').decode(file);
    }
  } else {
    if (isDocx) {
      const buffer = await file.arrayBuffer();
      text = await extractTextFromDocxArrayBuffer(buffer);
    } else {
      text = await file.text();
    }
  }

  const cleanName = fileName.normalize('NFC').trim();
  if (cleanName) {
    return `--- Strategie: ${cleanName} ---\n${text}`;
  }
  return text;
}

export interface AutoImportProgress {
  percent: number;
  currentMotionNumber?: number;
  totalMotions?: number;
  motionTitle?: string;
  statusText: string;
}

export type AutoImportProgressCallback = (progress: AutoImportProgress) => void;

export interface AutoImportOptions {
  files?: File[] | FileList;
  antragsmappeFile?: File | ArrayBuffer;
  antragsmappeText?: string;
  strategieFile?: File | ArrayBuffer;
  strategieFiles?: (File | ArrayBuffer)[];
  strategieText?: string;
  goFile?: File;
  onProgress?: AutoImportProgressCallback;
}

/**
 * Automatischer Komplett-Import von SiP-Dateien:
 * 1. Antragsmappe PDF + Unterordner "Strategie" (einzelne oder mehrere DOCX-Dateien)
 * 2. Schritt-für-Schritt-Zusammensetzen (1. Antrag + 1. Strategie, 2. Antrag + 2. Strategie, ...) mit Ladebalken
 * 3. Automatischer Ausschluss der Geschäftsordnung (GO) am Ende der Antragsmappe
 * 4. Vollzugsmeldung ("Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!")
 */
export async function executeAutoSiPImport(options: AutoImportOptions): Promise<AutoImportResult> {
  let finalAntragsmappeText = options.antragsmappeText || '';
  let finalStrategieText = options.strategieText || '';

  let targetAntragsmappe = options.antragsmappeFile;
  let targetGoFile = options.goFile;
  const targetStrategieFiles: (File | ArrayBuffer)[] = [];

  options.onProgress?.({
    percent: 5,
    statusText: 'Dateien werden identifiziert und vorbereitet...',
  });

  if (options.files && options.files.length > 0) {
    const classified = classifySiPFolderFiles(options.files);
    if (!targetAntragsmappe && classified.antragsmappeFile) {
      targetAntragsmappe = classified.antragsmappeFile;
    }
    if (classified.strategieFiles.length > 0) {
      targetStrategieFiles.push(...classified.strategieFiles);
    }
    if (!targetGoFile && classified.goFileFile) {
      targetGoFile = classified.goFileFile;
    }
  }

  if (options.strategieFile) {
    targetStrategieFiles.push(options.strategieFile);
  }
  if (options.strategieFiles && options.strategieFiles.length > 0) {
    targetStrategieFiles.push(...options.strategieFiles);
  }

  options.onProgress?.({
    percent: 15,
    statusText: 'Extrahiere Antragsmappe (PDF) und Strategiedateien...',
  });

  // 1. Text aus PDF-Antragsmappe extrahieren
  if (targetAntragsmappe) {
    try {
      const buffer =
        targetAntragsmappe instanceof ArrayBuffer
          ? targetAntragsmappe
          : await targetAntragsmappe.arrayBuffer();
      finalAntragsmappeText = await extractTextFromPdfArrayBuffer(buffer);
    } catch (err) {
      console.warn('Konnte Antragsmappen-PDF nicht extrahieren:', err);
    }
  }

  // 2. Text aus allen Strategiedateien extrahieren
  if (targetStrategieFiles.length > 0) {
    const extractedSections: string[] = [];
    for (let i = 0; i < targetStrategieFiles.length; i++) {
      const f = targetStrategieFiles[i];
      const name = f instanceof File ? f.name : `Strategie_${i + 1}.docx`;
      try {
        const text = await extractTextFromSingleStrategieFile(f, name);
        if (text && text.trim()) {
          extractedSections.push(text.trim());
        }
      } catch (err) {
        console.warn(`Konnte Strategiedatei "${name}" nicht extrahieren:`, err);
      }
    }
    if (extractedSections.length > 0) {
      finalStrategieText =
        (finalStrategieText ? `${finalStrategieText}\n\n` : '') + extractedSections.join('\n\n');
    }
  }

  // 3. Texte parsen & zusammenführen
  options.onProgress?.({
    percent: 25,
    statusText: 'Hauptanträge und Strategien werden analysiert...',
  });

  const combined = combineAntragsmappeAndStrategie(finalAntragsmappeText, finalStrategieText);
  const hauptAntraege = combined.antraege.filter((a) => a.type === 'HAUPTANTRAG');
  const total = hauptAntraege.length;

  // 4. Schritt-für-Schritt-Fortschritt: 1. Antrag & 1. Strategie, 2. Antrag & 2. Strategie, ...
  for (let hIdx = 0; hIdx < hauptAntraege.length; hIdx++) {
    const h = hauptAntraege[hIdx];
    const motionNum = hIdx + 1;
    const progressPercent = Math.min(95, Math.round(25 + ((hIdx + 1) / Math.max(1, total)) * 70));

    if (options.onProgress) {
      options.onProgress({
        percent: progressPercent,
        currentMotionNumber: motionNum,
        totalMotions: total,
        motionTitle: h.title,
        statusText: `Lade ${motionNum}. Antrag & ${motionNum}. Strategie: "${h.title}"...`,
      });
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  // 5. Abschlussmeldung: "Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!"
  if (options.onProgress) {
    options.onProgress({
      percent: 100,
      currentMotionNumber: total,
      totalMotions: total,
      statusText: 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!',
    });
  }

  const message =
    combined.antraege.length > 0
      ? 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!'
      : 'Es konnten keine Anträge aus den bereitgestellten Dateien oder Texten extrahiert werden. Bitte prüfe, ob die PDF-Antragsmappe ausgewählt wurde.';

  return {
    success: combined.antraege.length > 0,
    message,
    antraege: combined.antraege,
    hauptantraege: combined.hauptantraege,
    nebenantraege: combined.nebenantraege,
    strategyNotes: combined.strategyNotes,
    localGoFile: targetGoFile ?? null,
    summary: {
      ...combined.summary,
      strategyFilesCount: targetStrategieFiles.length,
    },
  };
}
