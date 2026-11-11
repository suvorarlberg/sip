import React, { useState, useEffect, useMemo } from 'react';
import {
  Archive,
  Calendar,
  Download,
  Trash2,
  Eye,
  PlusCircle,
  FileText,
  Clock,
  CheckCircle2,
  X,
  AlertTriangle,
  Play,
  FolderOpen,
  Sparkles,
  Check,
  Upload,
  HardDrive,
  FileUp,
} from 'lucide-react';
import {
  SipArchivedSession,
  SipSession,
  SipAntrag,
  ANTRAG_TYPE_CONFIG,
  SipUploadedDocument,
} from '../types';
import { AppSettings } from '../../types';
import {
  fetchArchivedSessions,
  archiveCurrentSession,
  deleteArchivedSession,
} from '../utils/archiveService';
import { downloadSipProtocol } from '../utils/protocolExporter';
import {
  AutoImportResult,
  AutoImportProgress,
  parseAntragsmappeText,
  createHauptantraegeFromParsed,
  mergeHauptAndNebenantraege,
  executeAutoSiPImport,
} from '../utils/sipAutoImporter';
import {
  executeOnlineDriveImport,
  downloadAndParseDriveStrategieFiles,
  GoogleDriveFolderManifest,
} from '../utils/driveFolderCrawler';
import { extractTextFromPdfArrayBuffer } from '../utils/pdfHelper';
import { uploadSipDocument } from '../utils/sipDocumentService';

/**
 * Berechnet intelligent den Folgetitel für ein Schüler:innenparlament:
 * Standardmäßig 2 SiPs pro Schuljahr. Nach dem 2. SiP 24/25 folgt das 1. SiP 25/26.
 */
export function getNextSipTitle(currentTitle: string): string {
  const match = currentTitle.match(
    /(\d+)\.\s*(?:Schüler:innenparlament\s*\(SiP\)|SiP)?\s*.*?(\d{2,4})\s*[/–-]\s*(\d{2,4})/i,
  );

  if (match) {
    const num = parseInt(match[1], 10);
    const startYearStr = match[2];
    const endYearStr = match[3];

    let startYear = parseInt(startYearStr, 10);
    let endYear = parseInt(endYearStr, 10);
    if (startYear < 100) startYear += 2000;
    if (endYear < 100) endYear += 2000;

    if (num === 1) {
      const displayStart =
        startYearStr.length === 2
          ? (startYear % 100).toString().padStart(2, '0')
          : startYear.toString();
      const displayEnd =
        endYearStr.length === 2 ? (endYear % 100).toString().padStart(2, '0') : endYear.toString();
      return `2. Schüler:innenparlament (SiP) ${displayStart}/${displayEnd}`;
    } else {
      const nextStartYear = startYear + 1;
      const nextEndYear = endYear + 1;
      const displayStart =
        startYearStr.length === 2
          ? (nextStartYear % 100).toString().padStart(2, '0')
          : nextStartYear.toString();
      const displayEnd =
        endYearStr.length === 2
          ? (nextEndYear % 100).toString().padStart(2, '0')
          : nextEndYear.toString();
      return `1. Schüler:innenparlament (SiP) ${displayStart}/${displayEnd}`;
    }
  }

  return `1. Schüler:innenparlament (SiP) 2025/26`;
}

interface SipArchiveViewProps {
  currentSession: SipSession;
  settings: AppSettings;
  currentUserName: string;
  onArchiveAndClearSession?: () => Promise<void>;
  onStartNewSession: (options: {
    id?: string;
    title: string;
    driveFolderUrl: string;
    skipArchive?: boolean;
    antraege?: SipAntrag[];
    strategyNotes?: string;
    uploadedDocuments?: SipUploadedDocument[];
  }) => Promise<void>;
}

export const SipArchiveView: React.FC<SipArchiveViewProps> = ({
  currentSession,
  settings,
  currentUserName,
  onArchiveAndClearSession,
  onStartNewSession,
}) => {
  const [archives, setArchives] = useState<SipArchivedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectingArchive, setInspectingArchive] = useState<SipArchivedSession | null>(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newDriveFolderUrl, setNewDriveFolderUrl] = useState('');
  const [importSourceMode, setImportSourceMode] = useState<'local' | 'drive'>('local');
  const [localAntragsmappeFile, setLocalAntragsmappeFile] = useState<File | null>(null);
  const [localGoFile, setLocalGoFile] = useState<File | null>(null);
  const [localStrategieFiles, setLocalStrategieFiles] = useState<File[]>([]);
  const [localStrategieFolderName, setLocalStrategieFolderName] = useState<string>('');
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const filesInputRef = React.useRef<HTMLInputElement>(null);

  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [importProgress, setImportProgress] = useState<AutoImportProgress | null>(null);
  const [importResult, setImportResult] = useState<AutoImportResult | null>(null);
  const [pendingHauptantraege, setPendingHauptantraege] = useState<SipAntrag[]>([]);
  const [pendingNebenantraege, setPendingNebenantraege] = useState<SipAntrag[]>([]);
  const [pendingStrategyNotes, setPendingStrategyNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualUploadRequired, setManualUploadRequired] = useState(false);
  const [pendingManifest, setPendingManifest] = useState<GoogleDriveFolderManifest | null>(null);
  const [manualUploadFileName, setManualUploadFileName] = useState<string>('');

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, [showNewSessionModal, importSourceMode]);

  useEffect(() => {
    loadArchives();
  }, [settings]);

  // Prüft, ob das aktuelle SiP bereits archiviert wurde
  const isCurrentSessionAlreadyArchived = useMemo(() => {
    return archives.some(
      (a) =>
        a.sessionTitle === currentSession.title &&
        (currentSession.antraege.length === 0 ||
          a.antraegeCount === currentSession.antraege.length),
    );
  }, [archives, currentSession.title, currentSession.antraege.length]);

  async function loadArchives() {
    setLoading(true);
    try {
      const data = await fetchArchivedSessions(settings);
      setArchives(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleArchiveNow() {
    if (
      !window.confirm(
        `Möchtest du das aktuelle SiP "${currentSession.title}" jetzt ins Archiv übertragen?\n\nAlle Kategorien (Anträge & Wortmeldungen, Vergangene Anträge, Strategie, Drive Unterlagen, Meme-Feed) werden dadurch für das Plenum geleert und sind danach nur noch hier im Archiv einsehbar.`,
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (onArchiveAndClearSession) {
        await onArchiveAndClearSession();
      } else {
        await archiveCurrentSession(currentSession, currentUserName, settings);
      }
      await loadArchives();
      alert(
        'Sitzung erfolgreich im Archiv gesichert und alle Kategorien für die Vorbereitung geleert!',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(archiveId: string, title: string) {
    if (
      !window.confirm(`Möchtest du das archivierte SiP "${title}" wirklich unwiderruflich löschen?`)
    ) {
      return;
    }
    const updated = await deleteArchivedSession(archiveId, settings);
    setArchives(updated);
    if (inspectingArchive?.id === archiveId) {
      setInspectingArchive(null);
    }
  }

  async function handleOnlineDriveImport(customUrl?: string) {
    const urlToUse = (customUrl || newDriveFolderUrl || '').trim();
    if (!urlToUse) {
      alert('Bitte gib zuerst einen Google Drive Ordner-Link ein.');
      return;
    }

    setIsProcessingFiles(true);
    setManualUploadRequired(false);
    setPendingManifest(null);
    setPendingHauptantraege([]);
    setPendingNebenantraege([]);
    setPendingStrategyNotes('');
    setImportProgress({ percent: 5, statusText: 'Verbinde mit Google Drive Ordner...' });
    setImportResult(null);

    try {
      const res = await executeOnlineDriveImport({
        folderUrlOrId: urlToUse,
        onProgress: (p) => setImportProgress(p),
      });

      const hauptantraege =
        res.hauptantraege || res.antraege.filter((a) => a.type === 'HAUPTANTRAG');
      const nebenantraege =
        res.nebenantraege || res.antraege.filter((a) => a.type !== 'HAUPTANTRAG');

      setPendingHauptantraege(hauptantraege);
      setPendingNebenantraege(nebenantraege);
      setPendingStrategyNotes(res.strategyNotes || '');

      const finalMotions = [...hauptantraege, ...nebenantraege];
      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length,
      );

      setImportResult({
        ...res,
        antraege: finalMotions,
        hauptantraege,
        nebenantraege,
      });
      setManualUploadRequired(false);
      setPendingManifest(null);
    } catch (err: any) {
      console.error('Fehler beim Online-Google-Drive-Import:', err);
      if (
        err.isDownloadBlocked ||
        err.name === 'DriveDownloadBlockedError' ||
        /403|408|blockier/i.test(err.message)
      ) {
        setManualUploadRequired(true);
        if (err.manifest) {
          setPendingManifest(err.manifest);
        }
        if (Array.isArray(err.pendingNebenantraege) && err.pendingNebenantraege.length > 0) {
          setPendingNebenantraege(err.pendingNebenantraege);
        }
        if (err.strategyNotes) {
          setPendingStrategyNotes(err.strategyNotes);
        }
        if (err.file?.name) {
          setManualUploadFileName(err.file.name);
        }
        setImportProgress(null);
      } else {
        alert(err.message || 'Fehler beim Abrufen der Google Drive Dokumente.');
        setImportProgress(null);
      }
    } finally {
      setIsProcessingFiles(false);
    }
  }

  async function handleManualPdfSelected(file: File) {
    if (!file) return;
    setIsProcessingFiles(true);
    setImportProgress({
      percent: 15,
      statusText: `Lese manuell hochgeladene Datei ${file.name} ein...`,
    });

    try {
      // 1. Manuelle PDF parsen und in pendingHauptantraege speichern
      const arrayBuffer = await file.arrayBuffer();
      const pdfText = await extractTextFromPdfArrayBuffer(arrayBuffer.slice(0));
      const { hauptAntraege, goExcluded } = parseAntragsmappeText(pdfText);
      const parsedHauptantraege = createHauptantraegeFromParsed(hauptAntraege);

      console.log(
        'Manuell hochgeladene PDF geparst. Anzahl Hauptanträge:',
        parsedHauptantraege.length,
      );
      setPendingHauptantraege(parsedHauptantraege);

      // 2. Sicherstellen, dass die DOCX-Nebenanträge (pendingNebenantraege) ebenfalls vorliegen
      let currentNebenantraege = pendingNebenantraege;
      let currentStrategyNotes = pendingStrategyNotes;
      let strategyFilesCount = pendingManifest?.strategieFiles.length || 0;
      let currentGoFile = pendingManifest?.goFile ?? null;

      if (
        currentNebenantraege.length === 0 &&
        pendingManifest &&
        pendingManifest.strategieFiles.length > 0
      ) {
        setImportProgress({
          percent: 45,
          statusText: 'Lade zugehörige Strategiedateien (DOCX) aus Google Drive...',
        });
        const stratRes = await downloadAndParseDriveStrategieFiles(
          pendingManifest,
          (p) => setImportProgress(p),
          45,
          35,
        );
        currentNebenantraege = stratRes.nebenantraege;
        currentStrategyNotes = stratRes.strategyNotes;
        setPendingNebenantraege(currentNebenantraege);
        setPendingStrategyNotes(currentStrategyNotes);
      } else if (currentNebenantraege.length === 0 && newDriveFolderUrl.trim()) {
        setImportProgress({
          percent: 45,
          statusText: 'Lade zugehörige Strategiedateien (DOCX) aus Google Drive...',
        });
        const driveRes = await executeOnlineDriveImport({
          folderUrlOrId: newDriveFolderUrl.trim(),
          manualPdfBuffer: arrayBuffer.slice(0),
          cachedManifest: pendingManifest || undefined,
          onProgress: (p) => setImportProgress(p),
        });
        currentNebenantraege =
          driveRes.nebenantraege || driveRes.antraege.filter((a) => a.type !== 'HAUPTANTRAG');
        currentStrategyNotes = driveRes.strategyNotes || '';
        currentGoFile = driveRes.goFile ?? currentGoFile;
        strategyFilesCount = driveRes.summary.strategyFilesCount;
        setPendingNebenantraege(currentNebenantraege);
        setPendingStrategyNotes(currentStrategyNotes);
      }

      // 3. Expliziter Merge-Schritt der getrennten States (pendingHauptantraege + pendingNebenantraege)
      const merged = mergeHauptAndNebenantraege(parsedHauptantraege, currentNebenantraege);
      const hauptantraege = merged.hauptantraege;
      const nebenantraege = merged.nebenantraege;
      const finalMotions = [...hauptantraege, ...nebenantraege];

      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length,
      );

      setPendingHauptantraege(hauptantraege);
      setPendingNebenantraege(nebenantraege);

      const finalResult: AutoImportResult = {
        success: finalMotions.length > 0,
        message: 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!',
        antraege: finalMotions,
        hauptantraege,
        nebenantraege,
        strategyNotes: currentStrategyNotes || '',
        summary: {
          hauptAntraegeCount: hauptantraege.length,
          subAntraegeCount: nebenantraege.length,
          matchedSectionsCount: merged.matchedSectionsCount,
          goExcluded,
          strategyFilesCount,
        },
        goFile: currentGoFile,
      };

      setImportProgress({
        percent: 100,
        currentMotionNumber: hauptantraege.length,
        totalMotions: hauptantraege.length,
        statusText: 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!',
      });
      setImportResult(finalResult);
      setManualUploadRequired(false);
      setPendingManifest(null);
    } catch (err: any) {
      console.error('Fehler nach manuellem PDF-Upload:', err);
      alert('Fehler beim Verarbeiten der hochgeladenen PDF-Datei: ' + (err?.message || err));
      setImportProgress(null);
    } finally {
      setIsProcessingFiles(false);
    }
  }

  async function handleAnalyzeLocalFiles() {
    if (!localAntragsmappeFile && !localGoFile && localStrategieFiles.length === 0) {
      alert('Bitte wähle eine GO-PDF, Antragsmappe oder Strategiedateien aus.');
      return;
    }

    setIsProcessingFiles(true);
    setImportResult(null);
    try {
      const result = await executeAutoSiPImport({
        antragsmappeFile: localAntragsmappeFile || undefined,
        goFile: localGoFile || undefined,
        files: localStrategieFiles,
        onProgress: (p) => setImportProgress(p),
      });
      setImportResult(result);
      if (result.success) {
        setPendingHauptantraege(result.antraege.filter((a) => a.type === 'HAUPTANTRAG'));
        setPendingNebenantraege(result.antraege.filter((a) => a.type !== 'HAUPTANTRAG'));
        setPendingStrategyNotes(result.strategyNotes || '');
      }
    } catch (err: any) {
      console.error('Fehler bei der Analyse der lokalen Dateien:', err);
      alert('Fehler beim Analysieren der Dateien: ' + (err?.message || err));
      setImportProgress(null);
    } finally {
      setIsProcessingFiles(false);
    }
  }

  async function handleConfirmNewSession(e: React.FormEvent) {
    e.preventDefault();
    if (!newSessionTitle.trim()) {
      alert('Bitte gib einen Namen für das neue SiP ein.');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalImportResult = importResult;

      // 1. Falls lokaler Upload aktiv ist und noch nicht manuell analysiert wurde:
      if (
        importSourceMode === 'local' &&
        !finalImportResult &&
        pendingHauptantraege.length === 0 &&
        (localAntragsmappeFile || localGoFile || localStrategieFiles.length > 0)
      ) {
        try {
          setIsProcessingFiles(true);
          finalImportResult = await executeAutoSiPImport({
            antragsmappeFile: localAntragsmappeFile || undefined,
            goFile: localGoFile || undefined,
            files: localStrategieFiles,
            onProgress: (p) => setImportProgress(p),
          });
          setImportResult(finalImportResult);
        } catch (err: any) {
          console.warn('Automatische Analyse der lokalen Dateien fehlgeschlagen:', err);
        } finally {
          setIsProcessingFiles(false);
        }
      }

      // 2. Falls Drive-Import aktiv ist und noch nicht geladen wurde:
      if (
        importSourceMode === 'drive' &&
        !finalImportResult &&
        newDriveFolderUrl.trim() &&
        pendingHauptantraege.length === 0
      ) {
        try {
          setIsProcessingFiles(true);
          finalImportResult = await executeOnlineDriveImport({
            folderUrlOrId: newDriveFolderUrl.trim(),
            onProgress: (p) => setImportProgress(p),
          });
          setImportResult(finalImportResult);
        } catch (err: any) {
          console.warn('Automatischer Drive-Download beim Erstellen fehlgeschlagen:', err);
        } finally {
          setIsProcessingFiles(false);
        }
      }

      const hauptantraege =
        pendingHauptantraege.length > 0
          ? pendingHauptantraege
          : (finalImportResult?.antraege || []).filter((a) => a.type === 'HAUPTANTRAG');
      const nebenantraege =
        pendingNebenantraege.length > 0
          ? pendingNebenantraege
          : (finalImportResult?.antraege || []).filter((a) => a.type !== 'HAUPTANTRAG');

      const finalMotions = [...hauptantraege, ...nebenantraege];
      console.log(
        'FINAL MERGE: Hauptanträge:',
        hauptantraege.length,
        'Nebenanträge:',
        nebenantraege.length,
        'Gesamt:',
        finalMotions.length,
      );

      const newSessionId = `session_${Date.now()}`;
      const uploadedDocs: SipUploadedDocument[] = [];

      // 3. Dateien in PocketBase sip_documents hochladen
      if (importSourceMode === 'local') {
        if (localAntragsmappeFile) {
          try {
            const doc = await uploadSipDocument({
              file: localAntragsmappeFile,
              docType: 'antragsmappe',
              sessionId: newSessionId,
              title: localAntragsmappeFile.name,
            });
            uploadedDocs.push(doc);
          } catch (uploadErr) {
            console.warn('Fehler beim Backend-Upload der Antragsmappe:', uploadErr);
          }
        }

        const goFileToUpload = localGoFile ?? finalImportResult?.localGoFile ?? null;
        if (goFileToUpload) {
          try {
            const doc = await uploadSipDocument({
              file: goFileToUpload,
              docType: 'go',
              sessionId: newSessionId,
              title: goFileToUpload.name,
            });
            uploadedDocs.push(doc);
          } catch (uploadErr) {
            console.error('Fehler beim Backend-Upload der GO-Datei:', uploadErr);
            alert(
              'Die GO-Datei konnte nicht gespeichert werden. Das SiP wird ohne die GO-Datei gestartet.',
            );
          }
        }

        for (const sFile of localStrategieFiles) {
          try {
            const doc = await uploadSipDocument({
              file: sFile,
              docType: 'strategie',
              sessionId: newSessionId,
              title: sFile.name,
            });
            uploadedDocs.push(doc);
          } catch (uploadErr) {
            console.warn(
              'Fehler beim Backend-Upload der Strategiedatei ' + sFile.name + ':',
              uploadErr,
            );
          }
        }
      }

      if (importSourceMode === 'drive' && finalImportResult?.goFile?.downloadUrl) {
        const response = await fetch(finalImportResult.goFile.downloadUrl);
        if (!response.ok) {
          throw new Error('Die GO-PDF konnte nicht aus Google Drive geladen werden.');
        }

        const blob = await response.blob();
        const driveGoFile = new File([blob], finalImportResult.goFile.name, {
          type: blob.type || finalImportResult.goFile.mimeType || 'application/pdf',
        });

        const doc = await uploadSipDocument({
          file: driveGoFile,
          docType: 'go',
          sessionId: newSessionId,
          title: driveGoFile.name,
        });
        uploadedDocs.push(doc);
      }

      await onStartNewSession({
        id: newSessionId,
        title: newSessionTitle.trim(),
        driveFolderUrl: newDriveFolderUrl.trim(),
        skipArchive: isCurrentSessionAlreadyArchived,
        antraege: finalMotions,
        strategyNotes: finalImportResult?.strategyNotes || pendingStrategyNotes || '',
        uploadedDocuments: uploadedDocs,
      });
      setLocalAntragsmappeFile(null);
      setLocalGoFile(null);
      setLocalStrategieFiles([]);
      setShowNewSessionModal(false);
      setNewSessionTitle('');
      setNewDriveFolderUrl('');
      setLocalStrategieFolderName('');
      const importedMsg = finalImportResult ? `\n\n${finalImportResult.message}` : '';
      const docMsg =
        uploadedDocs.length > 0
          ? `\n${uploadedDocs.length} Datei(en) sicher im Backend gespeichert.`
          : '';
      setImportResult(null);
      setPendingHauptantraege([]);
      setPendingNebenantraege([]);
      setPendingStrategyNotes('');
      setImportProgress(null);
      await loadArchives();
      alert(
        `Neues SiP "${newSessionTitle.trim()}" gestartet!\n${
          isCurrentSessionAlreadyArchived
            ? 'Das vorherige SiP war bereits archiviert.'
            : 'Das vorherige SiP wurde im Archiv gesichert.'
        }${importedMsg}${docMsg}`,
      );
    } catch (err) {
      console.error('Fehler beim Starten des neuen SiP:', err);
      const message = err instanceof Error ? err.message : String(err);
      alert(`Das SiP konnte nicht gestartet werden: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 border-2 border-amber-500/30 rounded-3xl p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <Archive className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Geschützter Bereich • Nur Strategieführung & Admin
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              SiP Sitzungs-Archiv & Protokolle
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Hier werden vergangene Schüler:innenparlamente sicher gespeichert. Du kannst
              historische Anträge und Wortmeldungen einsehen oder das lückenlose Audit-Protokoll
              (wer hat wann was eingereicht/geändert) exportieren.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleArchiveNow}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-bold text-xs sm:text-sm transition cursor-pointer shadow"
              title="Sichert den aktuellen Stand der laufenden Sitzung im Archiv"
            >
              <Archive className="w-4 h-4" />
              <span>Aktuelles SiP archivieren</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNewSessionTitle(getNextSipTitle(currentSession.title));
                setNewDriveFolderUrl('');
                setShowNewSessionModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Neues SiP starten...</span>
            </button>
          </div>
        </div>
      </div>

      {/* Archive List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Gespeicherte Sitzungen ({archives.length})
          </h3>
          <button
            type="button"
            onClick={loadArchives}
            className="text-xs text-sky-400 hover:text-sky-300 font-semibold"
          >
            Aktualisieren
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm bg-slate-900 rounded-3xl border border-slate-800">
            Lade Archiv...
          </div>
        ) : archives.length === 0 ? (
          <div className="p-10 text-center bg-slate-900/60 rounded-3xl border border-slate-800 text-slate-400">
            <Archive className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <h4 className="font-bold text-slate-200">Noch keine archivierten SiPs vorhanden</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Klicke oben auf <strong>„Aktuelles SiP archivieren“</strong> oder starte ein neues
              SiP, um den bisherigen Verlauf hier dauerhaft zu sichern.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {archives.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-lg flex flex-col justify-between gap-4 transition"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.archivedAt).toLocaleDateString('de-AT', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Archiviert von: {item.archivedBy}
                    </span>
                  </div>

                  <h4 className="text-base sm:text-lg font-black text-white mb-2 leading-snug">
                    {item.sessionTitle}
                  </h4>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>📋 {item.antraegeCount} Anträge</span>
                    <span>⏱️ {item.activityCount} Protokoll-Einträge</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setInspectingArchive(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    <span>Anschauen</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadSipProtocol(item.sessionData)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold transition cursor-pointer"
                    title="Vollständiges Protokoll dieses SiPs als Textdatei exportieren"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Protokoll</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.sessionTitle)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                    title="Archivierten Eintrag löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Neues SiP starten */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-5 sm:p-7 shadow-2xl text-white my-auto max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white">Neues SiP starten</h3>
                  <span className="text-xs text-amber-300 font-semibold">
                    {isCurrentSessionAlreadyArchived
                      ? 'Vorheriges SiP ist bereits archiviert'
                      : 'Vorheriges SiP wird automatisch archiviert'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSessionModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleConfirmNewSession}
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 space-y-4">
                {isCurrentSessionAlreadyArchived ? (
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      Das bisherige SiP <strong>„{currentSession.title}“</strong> wurde bereits
                      gesichert. Es ist keine neuerliche Archivierung erforderlich.
                    </span>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Das derzeitige SiP <strong>„{currentSession.title}“</strong> wird mit allen
                      Claims, eingereichten Anträgen und Protokolleinträgen automatisch im Archiv
                      gesichert.
                    </span>
                  </div>
                )}

                {/* Titel des neuen SiP */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Name des neuen SiP:
                    </label>
                    <span className="text-[11px] text-amber-400/90 font-medium">
                      (Standard: 2 SiPs pro Schuljahr)
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    value={newSessionTitle}
                    onChange={(e) => setNewSessionTitle(e.target.value)}
                    placeholder="z.B. 1. Schüler:innenparlament (SiP) 2025/26"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[11px] text-slate-400">Vorschlag:</span>
                    <button
                      type="button"
                      onClick={() => setNewSessionTitle(getNextSipTitle(currentSession.title))}
                      className="px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold transition cursor-pointer border border-slate-700"
                    >
                      {getNextSipTitle(currentSession.title)}
                    </button>
                  </div>
                </div>

                {/* Import-Modus Auswahl: Lokaler Upload vs Google Drive */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Antragsmappe & Strategie importieren:
                    </label>
                    <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setImportSourceMode('local');
                          setImportResult(null);
                          setPendingHauptantraege([]);
                          setPendingNebenantraege([]);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          importSourceMode === 'local'
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>Lokaler Upload</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImportSourceMode('drive');
                          setImportResult(null);
                          setPendingHauptantraege([]);
                          setPendingNebenantraege([]);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          importSourceMode === 'drive'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Google Drive</span>
                      </button>
                    </div>
                  </div>

                  {/* 1. LOKALER UPLOAD */}
                  {importSourceMode === 'local' && (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/30 via-slate-950 to-slate-900 border border-amber-500/40 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                            Direkter Datei-Upload vom Computer (im Backend gespeichert)
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {/* Box 1: Antragsmappe PDF */}
                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-2.5">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-sky-400" />
                                <span>1. SiP Antragsmappe (.pdf)</span>
                              </span>
                              {localAntragsmappeFile && (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold">
                                  Bereit
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Offizielle Antragsmappe als PDF. Die Geschäftsordnung (GO) am Ende
                              wird automatisch ignoriert.
                            </p>
                          </div>

                          {localAntragsmappeFile ? (
                            <div className="p-2.5 rounded-xl bg-slate-950 border border-emerald-500/40 flex items-center justify-between gap-2">
                              <div className="truncate min-w-0">
                                <span className="text-xs font-bold text-emerald-300 block truncate">
                                  📄 {localAntragsmappeFile.name}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {(localAntragsmappeFile.size / 1024 / 1024).toFixed(2)} MB
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setLocalAntragsmappeFile(null);
                                  setImportResult(null);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 cursor-pointer"
                                title="Datei entfernen"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center border border-dashed border-sky-500/40 hover:border-sky-400 bg-slate-950/70 hover:bg-slate-950 rounded-xl p-3 cursor-pointer transition group">
                              <FileUp className="w-5 h-5 text-sky-400 mb-1 group-hover:scale-110 transition-transform" />
                              <span className="text-xs font-bold text-slate-200">
                                Antragsmappe auswählen
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Klicken zum Durchsuchen (.pdf)
                              </span>
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setLocalAntragsmappeFile(file);
                                    setImportResult(null);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>

                        {/* Box 2: Strategieordner DOCX */}
                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-2.5">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <FolderOpen className="w-4 h-4 text-purple-400" />
                                <span>2. Strategieordner (.docx)</span>
                              </span>
                              {localStrategieFiles.length > 0 && (
                                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-md font-bold">
                                  {localStrategieFiles.length} Datei(en)
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Wähle den Ordner „Strategie“ als Ganzes oder markiere mehrere
                              Word-Dateien.
                            </p>
                          </div>

                          {localStrategieFiles.length > 0 ? (
                            <div className="p-2.5 rounded-xl bg-slate-950 border border-purple-500/40 flex items-center justify-between gap-2">
                              <div className="truncate min-w-0">
                                <span className="text-xs font-bold text-purple-300 block truncate">
                                  📁 {localStrategieFolderName || 'Strategieordner'}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {localStrategieFiles.length} Word-Dateien erkannt
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setLocalStrategieFiles([]);
                                  setLocalStrategieFolderName('');
                                  setImportResult(null);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 cursor-pointer"
                                title="Dateien entfernen"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <input
                                ref={folderInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || []);
                                  const wordFiles = files.filter((f) => {
                                    const n = f.name.toLowerCase();
                                    return (
                                      (n.endsWith('.docx') || n.endsWith('.doc')) &&
                                      !f.name.startsWith('~$') &&
                                      !f.name.startsWith('.')
                                    );
                                  });
                                  if (wordFiles.length > 0) {
                                    setLocalStrategieFiles(wordFiles);
                                    const folder =
                                      files[0]?.webkitRelativePath?.split('/')[0] || 'Strategie';
                                    setLocalStrategieFolderName(folder);
                                    setImportResult(null);
                                  } else if (files.length > 0) {
                                    alert('Keine .docx Word-Dateien im gewählten Ordner gefunden.');
                                  }
                                }}
                              />
                              <input
                                ref={filesInputRef}
                                type="file"
                                multiple
                                accept=".docx,.doc,.txt"
                                className="hidden"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || []).filter(
                                    (f) => !f.name.startsWith('~$') && !f.name.startsWith('.'),
                                  );
                                  if (files.length > 0) {
                                    setLocalStrategieFiles(files);
                                    setLocalStrategieFolderName(`${files.length} Word-Dateien`);
                                    setImportResult(null);
                                  }
                                }}
                              />

                              <button
                                type="button"
                                onClick={() => folderInputRef.current?.click()}
                                className="flex-1 flex flex-col items-center justify-center border border-dashed border-purple-500/40 hover:border-purple-400 bg-slate-950/70 hover:bg-slate-950 rounded-xl p-3 cursor-pointer transition group"
                              >
                                <FolderOpen className="w-5 h-5 text-purple-400 mb-1 group-hover:scale-110 transition-transform" />
                                <span className="text-xs font-bold text-slate-200">
                                  Ordner auswählen
                                </span>
                                <span className="text-[10px] text-slate-400">Ganzer Ordner</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => filesInputRef.current?.click()}
                                className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-700 hover:border-slate-500 bg-slate-950/70 hover:bg-slate-950 rounded-xl p-3 cursor-pointer transition group"
                              >
                                <FileUp className="w-5 h-5 text-slate-400 mb-1 group-hover:scale-110 transition-transform" />
                                <span className="text-xs font-bold text-slate-300">
                                  Dateien wählen
                                </span>
                                <span className="text-[10px] text-slate-400">Einzelne .docx</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/30 bg-slate-900/90 p-3.5">
                        <div className="mb-2 text-xs font-bold text-white">
                          Geschäftsordnung (GO, PDF)
                        </div>

                        {localGoFile ? (
                          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-slate-950 p-2.5">
                            <span className="truncate text-xs text-emerald-300">
                              {localGoFile.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setLocalGoFile(null);
                                setImportResult(null);
                              }}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-900 hover:text-rose-400"
                              aria-label="GO-Datei entfernen"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                setLocalGoFile(file);
                                setImportResult(null);
                              }
                              event.target.value = '';
                            }}
                            className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500/20 file:px-3 file:py-2 file:text-emerald-300"
                          />
                        )}
                      </div>
                      {/* Analyse Button */}
                      <div className="flex items-center justify-between pt-1">
                        <p className="text-[11px] text-slate-400">
                          Dateien werden im Browser analysiert & anschließend sicher im
                          PocketBase-Server gespeichert.
                        </p>
                        <button
                          type="button"
                          disabled={
                            isProcessingFiles ||
                            (!localAntragsmappeFile &&
                              !localGoFile &&
                              localStrategieFiles.length === 0)
                          }
                          onClick={handleAnalyzeLocalFiles}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition cursor-pointer shrink-0"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>
                            {isProcessingFiles ? 'Analysiere...' : 'Dateien analysieren & prüfen'}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. GOOGLE DRIVE IMPORT */}
                  {importSourceMode === 'drive' && (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-950 to-indigo-950/40 border border-purple-500/40 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                          Online-Import aus Google Drive
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                          Google Drive Ordner (Link):
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="relative flex-1">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                              <FolderOpen className="w-4 h-4" />
                            </div>
                            <input
                              type="url"
                              value={newDriveFolderUrl}
                              onChange={(e) => {
                                setNewDriveFolderUrl(e.target.value);
                                setImportResult(null);
                                setManualUploadRequired(false);
                                setPendingManifest(null);
                              }}
                              placeholder="https://drive.google.com/drive/folders/..."
                              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <button
                            type="button"
                            disabled={isProcessingFiles || !newDriveFolderUrl.trim()}
                            onClick={() => handleOnlineDriveImport()}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-purple-600/30 transition cursor-pointer shrink-0"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>
                              {isProcessingFiles
                                ? 'Lädt online...'
                                : 'Dokumente online aus Drive laden'}
                            </span>
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Greift online direkt über den eingefügten Link auf den freigegebenen Google
                        Drive-Ordner zu. Das Programm lädt vollautomatisch die{' '}
                        <strong>Antragsmappe (.pdf)</strong> und die Strategiedateien aus dem
                        Unterordner <strong>„Strategie“ (.docx)</strong> herunter und kombiniert
                        diese Antrag für Antrag.{' '}
                        <em>Alle anderen Dateien und Ordner werden automatisch ignoriert.</em>
                      </p>

                      {/* Fallback auf manuellen Upload (Der Lebensretter) */}
                      {manualUploadRequired && !importResult && (
                        <div className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/50 text-amber-200 space-y-3 animate-in fade-in">
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5 border border-amber-500/30">
                              <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="font-bold text-sm text-amber-300">
                                Google blockiert den automatischen Download der Antragsmappe. Bitte
                                lade die Datei hier manuell hoch.
                              </h4>
                              <p className="text-xs text-slate-300 leading-relaxed">
                                Google Drive verweigert den automatischen Browser-Download (Anti-Bot
                                / HTTP 403).
                                {manualUploadFileName
                                  ? ` Erwartet: „${manualUploadFileName}“. `
                                  : ' '}
                                Die Strategiedateien aus Google Drive werden anschließend
                                automatisch mit der Mappe zusammengeführt.
                              </p>
                            </div>
                          </div>

                          <div className="pt-1">
                            <label className="flex flex-col items-center justify-center border-2 border-dashed border-amber-500/50 hover:border-amber-400 bg-slate-950/80 hover:bg-slate-950 rounded-2xl p-4 cursor-pointer transition group shadow-inner">
                              <Upload className="w-7 h-7 text-amber-400 mb-1.5 group-hover:scale-110 transition-transform" />
                              <span className="text-xs sm:text-sm font-bold text-white mb-0.5">
                                Antragsmappe (.pdf) auswählen
                              </span>
                              <span className="text-[11px] text-slate-400">
                                Hier klicken, um die Datei vom Rechner hochzuladen
                              </span>
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    await handleManualPdfSelected(file);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Gemeinsamer Ladebalken während Analyse / Upload */}
                  {isProcessingFiles && importProgress && (
                    <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/40 space-y-2.5 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                          <span>
                            {importProgress.currentMotionNumber
                              ? `Lade Antrag ${importProgress.currentMotionNumber} von ${importProgress.totalMotions}...`
                              : 'Verarbeitung läuft...'}
                          </span>
                        </span>
                        <span className="font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded-lg border border-amber-500/30">
                          {importProgress.percent}%
                        </span>
                      </div>

                      <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5 shadow-inner">
                        <div
                          className="bg-gradient-to-r from-amber-500 via-sky-500 to-emerald-400 h-full rounded-full transition-all duration-200 ease-out shadow-sm shadow-amber-500/50"
                          style={{ width: `${importProgress.percent}%` }}
                        />
                      </div>

                      <p
                        className="text-[11px] text-slate-300 truncate"
                        title={importProgress.statusText}
                      >
                        {importProgress.statusText}
                      </p>
                    </div>
                  )}

                  {/* Erfolgsmeldung nach Upload / Analyse */}
                  {importResult && !isProcessingFiles && (
                    <div
                      className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-3 animate-in fade-in ${
                        importResult.success
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      }`}
                    >
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-black text-sm text-emerald-300 block">
                          {importResult.success
                            ? 'Alle Anträge hochgeladen! Das SiP ist nun einsatzbereit!'
                            : 'Hinweis beim Import:'}
                        </span>
                        <span className="text-slate-300 block">
                          {importResult.summary.hauptAntraegeCount} Hauptanträge und{' '}
                          {importResult.summary.subAntraegeCount} Nebenanträge wurden
                          zusammengestellt.
                          {importResult.summary.goExcluded &&
                            ' Die Geschäftsordnung am Schluss wurde automatisch ignoriert.'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 mt-3 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNewSessionModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
                >
                  {isSubmitting
                    ? 'Wird initialisiert...'
                    : isCurrentSessionAlreadyArchived
                      ? 'Neues SiP initialisieren'
                      : 'Altes SiP archivieren & Neues starten'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Archivierte Sitzung ansehen */}
      {inspectingArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl text-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800 shrink-0">
              <div>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-400">
                  Archivierte Sitzung • Schreibgeschützt
                </span>
                <h3 className="text-lg sm:text-xl font-black text-white">
                  {inspectingArchive.sessionTitle}
                </h3>
                <span className="text-xs text-slate-400">
                  Archiviert am {new Date(inspectingArchive.archivedAt).toLocaleString('de-AT')} von{' '}
                  {inspectingArchive.archivedBy}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadSipProtocol(inspectingArchive.sessionData)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Protokoll (.txt)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectingArchive(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Tabs / Scrollable Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Chronological Log */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Chronologischer Sitzungsverlauf (Audit Trail)</span>
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {(inspectingArchive.sessionData.activityLog || []).length === 0 ? (
                    <span className="text-xs text-slate-500 italic">
                      Keine Einträge protokolliert.
                    </span>
                  ) : (
                    (inspectingArchive.sessionData.activityLog || []).map((entry) => (
                      <div key={entry.id} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-slate-500 font-mono shrink-0">
                          {new Date(entry.timestamp).toLocaleTimeString('de-AT', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        <strong className="text-sky-300 shrink-0">{entry.performedBy}:</strong>
                        <span>{entry.details}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Anträge List */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Behandelte Anträge ({inspectingArchive.sessionData.antraege.length})
                </h4>
                <div className="space-y-2.5">
                  {inspectingArchive.sessionData.antraege.map((a) => {
                    const cfg = ANTRAG_TYPE_CONFIG[a.type] || ANTRAG_TYPE_CONFIG.SONSTIGES;
                    return (
                      <div
                        key={a.id}
                        className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-white"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.badgeColor}`}
                            >
                              {cfg.shortLabel}
                            </span>
                            <span className="text-xs font-semibold text-slate-300">
                              Autor: {a.author}
                            </span>
                          </div>
                          {a.claimedBy && (
                            <span className="text-xs text-emerald-400 font-medium">
                              🎙️ Redner:in: {a.claimedBy}
                            </span>
                          )}
                        </div>
                        <h5 className="font-bold text-sm text-slate-100">{a.title}</h5>
                        {a.forderungspunkte && a.forderungspunkte.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-slate-300">
                            {a.forderungspunkte.map((fp, idx) => (
                              <div key={idx}>• {fp}</div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-slate-400 mt-2 line-clamp-3 italic">
                          {a.rede || a.content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
