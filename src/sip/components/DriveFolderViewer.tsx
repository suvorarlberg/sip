import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Edit2,
  Check,
  FolderOpen,
  Sparkles,
  FileText,
  Download,
  Trash2,
  Upload,
  HardDrive,
  RefreshCw,
  FileUp,
} from 'lucide-react';
import { SipUploadedDocument } from '../types';
import { fetchSipDocuments, uploadSipDocument, deleteSipDocument } from '../utils/sipDocumentService';

interface DriveFolderViewerProps {
  driveFolderUrl: string;
  isStrictAdmin: boolean;
  sessionId?: string;
  onUpdateFolderUrl: (url: string) => void;
  onOpenParser: () => void;
}

export const DriveFolderViewer: React.FC<DriveFolderViewerProps> = ({
  driveFolderUrl,
  isStrictAdmin,
  sessionId,
  onUpdateFolderUrl,
  onOpenParser,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [sourceMode, setSourceMode] = useState<'drive' | 'local'>('local');
  const [urlInput, setUrlInput] = useState(driveFolderUrl);

  const [documents, setDocuments] = useState<SipUploadedDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const applicationInputRef = useRef<HTMLInputElement>(null);
  const strategyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    strategyInputRef.current?.setAttribute('webkitdirectory', '');
    strategyInputRef.current?.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [sessionId]);

  async function loadDocuments() {
    setIsLoadingDocs(true);
    try {
      const docs = await fetchSipDocuments(sessionId);
      setDocuments(docs);
    } catch (err) {
      console.warn('Konnte Dokumente nicht laden:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (urlInput.trim()) {
      onUpdateFolderUrl(urlInput.trim());
      setIsEditing(false);
    }
  }

  async function handleUploadSinglePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;
    setIsUploading(true);
    try {
      await uploadSipDocument({
        file,
        docType: 'antragsmappe',
        sessionId,
        title: file.name,
      });
      await loadDocuments();
    } catch (err: any) {
      console.error('Fehler beim Upload der Antragsmappe:', err);
      alert('Upload fehlgeschlagen: ' + (err?.message || err));
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }

  async function handleUploadStrategieFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !sessionId) return;

    const docxFiles = files.filter((f) => {
      const n = f.name.toLowerCase();
      return (
        (n.endsWith('.docx') || n.endsWith('.doc')) &&
        !f.name.startsWith('~$') &&
        !f.name.startsWith('.')
      );
    });

    if (docxFiles.length === 0) {
      alert('Keine .docx Word-Dateien im ausgewählten Ordner gefunden.');
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      for (const f of docxFiles) {
        await uploadSipDocument({
          file: f,
          docType: 'strategie',
          sessionId,
          title: f.name,
        });
      }
      await loadDocuments();
    } catch (err: any) {
      console.error('Fehler beim Upload der Strategiedateien:', err);
      alert('Upload teilweise fehlgeschlagen: ' + (err?.message || err));
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }

  async function handleDelete(docId: string, title: string) {
    if (!confirm(`Möchtest du die Datei „${title}“ wirklich löschen?`)) return;
    try {
      await deleteSipDocument(docId);
      await loadDocuments();
    } catch (err) {
      console.error('Fehler beim Löschen:', err);
    }
  }

  // Erstelle eingebettete URL falls möglich
  const getEmbedUrl = (raw: string) => {
    if (!raw) return '';
    try {
      if (raw.includes('drive.google.com/drive/folders/')) {
        const id = raw.split('drive/folders/')[1]?.split('?')[0];
        if (id) {
          return `https://drive.google.com/embeddedfolderview?id=${id}#list`;
        }
      }
      return raw;
    } catch (_err) {
      return raw;
    }
  };

  const embedUrl = getEmbedUrl(driveFolderUrl);

  const antragsmappeDocs = documents.filter((d) => d.doc_type === 'antragsmappe');
  const strategieDocs = documents.filter((d) => d.doc_type === 'strategie');
  const otherDocs = documents.filter(
    (d) => d.doc_type !== 'antragsmappe' && d.doc_type !== 'strategie'
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl space-y-5">
      {/* Header & Modus-Umschaltung */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold">
              SiP-Dokumente & Antragsunterlagen
            </h3>
            <p className="text-xs text-slate-400">
              Zentrale Antrags- und Beschlussunterlagen für dieses Schüler:innenparlament
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Umschalter: Lokaler Backend-Dateispeicher vs Google Drive */}
          <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              aria-pressed={sourceMode === 'local'}
              onClick={() => {
                setSourceMode('local');
                setIsEditing(false);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                sourceMode === 'local'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Lokale Unterlagen ({documents.length})</span>
            </button>
            <button
              type="button"
              aria-pressed={sourceMode === 'drive'}
              onClick={() => {
                setSourceMode('drive');
                setIsEditing(false);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                sourceMode === 'drive'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Google Drive</span>
            </button>
          </div>

          {sourceMode === 'drive' && driveFolderUrl && (
            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400 transition"
            >
              <span>In Google Drive öffnen</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {sourceMode === 'drive' && isStrictAdmin && (
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Drive-Link ändern</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor für den Drive-Ordnerlink */}
      {isEditing && sourceMode === 'drive' && isStrictAdmin && (
        <form
          onSubmit={handleSave}
          className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-3 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">Google Drive Ordner-Link aktualisieren:</span>
            <span className="text-[11px] text-slate-400">
              Kann für jedes SiP individuell angepasst werden
            </span>
          </div>
          <input
            type="url"
            required
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/DEINE_ORDNER_ID..."
            className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs sm:text-sm focus:outline-none focus:border-sky-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold shadow cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Speichern & synchronisieren</span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* ANSICHT 1: LOKAL HOCHGELADENE UNTERLAGEN (PocketBase Backend) */}
      {/* ========================================================================= */}
      {sourceMode === 'local' && (
        <div className="space-y-5 animate-in fade-in">
          {/* Action Bar für Admin */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200">
                Im Backend gespeicherte Dokumente ({documents.length})
              </span>
              {isLoadingDocs && (
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin ml-1" />
              )}
            </div>

            {isStrictAdmin && (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={applicationInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleUploadSinglePdf}
                />
                <input
                  ref={strategyInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleUploadStrategieFolder}
                />

                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => applicationInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  title="Weitere Antragsmappe (.pdf) hochladen"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Mappe (.pdf) hochladen</span>
                </button>

                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => strategyInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  title="Ganzen Strategieordner hochladen"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Strategieordner hochladen</span>
                </button>

                <button
                  type="button"
                  onClick={loadDocuments}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Dokumentenliste aktualisieren"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {isUploading && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Datei(en) werden ins PocketBase Backend übertragen...</span>
            </div>
          )}

          {documents.length === 0 && !isLoadingDocs ? (
            <div className="p-8 text-center bg-slate-950/60 rounded-3xl border border-slate-800 text-slate-400 space-y-2">
              <FileText className="w-10 h-10 mx-auto text-slate-600 mb-1" />
              <h4 className="font-bold text-slate-200">Noch keine lokalen Dokumente hochgeladen</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Wenn du ein neues SiP über den Reiter <strong>„Archiv & Logs ➔ Neues SiP starten“</strong> mit lokalem Upload anlegst, erscheinen die Antragsmappe und alle Strategiedokumente automatisch hier.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Antragsmappe(n) */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  <span>Antragsmappe ({antragsmappeDocs.length})</span>
                </h4>

                {antragsmappeDocs.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/80 text-xs text-slate-500 text-center">
                    Keine Antragsmappe vorhanden
                  </div>
                ) : (
                  antragsmappeDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 rounded-2xl bg-slate-950 border border-sky-500/30 hover:border-sky-500/60 transition flex items-center justify-between gap-3 shadow-md"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="truncate">
                          <h5 className="text-xs sm:text-sm font-bold text-white truncate" title={doc.title}>
                            {doc.title}
                          </h5>
                          <span className="text-[10px] text-slate-400">
                            {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('de-AT') : 'Bereitgestellt'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition shadow"
                          title="PDF in neuem Tab öffnen"
                        >
                          <span>Öffnen</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <a
                          href={doc.url}
                          download={doc.title}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          title="Herunterladen"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        {isStrictAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDelete(doc.id, doc.title)}
                            className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Strategie-Dokumente */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <FolderOpen className="w-4 h-4" />
                  <span>Strategie-Unterlagen ({strategieDocs.length + otherDocs.length})</span>
                </h4>

                {strategieDocs.length === 0 && otherDocs.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/80 text-xs text-slate-500 text-center">
                    Keine Strategie-Dateien vorhanden
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {[...strategieDocs, ...otherDocs].map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/40 transition flex items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <span className="p-1.5 rounded-lg bg-purple-500/15 text-purple-300 shrink-0">
                            📄
                          </span>
                          <span className="font-medium text-slate-200 truncate" title={doc.title}>
                            {doc.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={doc.url}
                            download={doc.title}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 font-bold text-[11px] transition"
                            title="Herunterladen"
                          >
                            <Download className="w-3 h-3" />
                            <span>Laden</span>
                          </a>
                          {isStrictAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDelete(doc.id, doc.title)}
                              className="p-1 rounded-lg text-slate-500 hover:text-rose-400 cursor-pointer"
                              title="Löschen"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ANSICHT 2: GOOGLE DRIVE ONLINE-ORDNER */}
      {/* ========================================================================= */}
      {sourceMode === 'drive' && (
        <div className="space-y-4 animate-in fade-in">
          {/* Quick Action: Document Parser */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 to-slate-900 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  Anträge & Strategie online importieren
                </h4>
                <p className="text-xs text-slate-300">
                  Lädt die Antragsmappe (PDF) und alle Strategiedateien (DOCX) online aus Google Drive und kombiniert diese automatisch.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenParser}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-600/30 shrink-0 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Online aus Drive importieren</span>
            </button>
          </div>

          {/* Embedded Google Drive Frame or Interactive Card */}
          <div className="relative rounded-2xl overflow-hidden border-2 border-slate-700 bg-white min-h-[400px] sm:min-h-[520px] shadow-lg">
            {embedUrl && embedUrl.includes('drive.google.com') ? (
              <iframe
                src={embedUrl}
                title="Google Drive SiP Ordner"
                className="w-full h-[520px] border-0 bg-white"
                allow="autoplay"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center h-[360px] bg-slate-950 text-white">
                <FolderOpen className="w-14 h-14 text-slate-500 mb-3" />
                <h4 className="text-base font-bold text-white mb-1">
                  Google Drive Ordner verknüpft
                </h4>
                <p className="text-xs text-slate-300 max-w-md mb-4">
                  Klicke auf den Button, um alle SiP-Dateien, Antragsformulare und Beschlussanträge direkt in Google Drive zu öffnen.
                </p>
                <a
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/20 transition cursor-pointer"
                >
                  <span>Ordner im Browser öffnen</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
