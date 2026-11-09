import React, { useState } from 'react';
import {
  ExternalLink,
  FolderSync,
  Edit2,
  Check,
  FolderOpen,
  Sparkles,
  FileText,
  AlertCircle,
} from 'lucide-react';

interface DriveFolderViewerProps {
  driveFolderUrl: string;
  isStrictAdmin: boolean;
  onUpdateFolderUrl: (url: string) => void;
  onOpenParser: () => void;
}

export const DriveFolderViewer: React.FC<DriveFolderViewerProps> = ({
  driveFolderUrl,
  isStrictAdmin,
  onUpdateFolderUrl,
  onOpenParser,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [urlInput, setUrlInput] = useState(driveFolderUrl);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (urlInput.trim()) {
      onUpdateFolderUrl(urlInput.trim());
      setIsEditing(false);
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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold">SiP-Dokumente & Google Drive Ordner</h3>
            <p className="text-xs text-slate-400">
              Zentrale Antrags- und Beschlussunterlagen für dieses Schüler:innenparlament
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isStrictAdmin && (
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Ordner ändern</span>
            </button>
          )}

          <a
            href={driveFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs sm:text-sm shadow-md shadow-sky-500/20 transition cursor-pointer"
          >
            <span>In Google Drive öffnen</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Editor für den Ordnerlink (Strategieführung) */}
      {isEditing && (
        <form
          onSubmit={handleSave}
          className="mb-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">Google Drive Ordner-Link aktualisieren:</span>
            <span className="text-[11px] text-slate-400">
              Kann für jedes neue SiP individuell angepasst werden
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
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
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

      {/* Quick Action: Document Parser */}
      <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 to-slate-900 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">
              Anträge & Strategie automatisch importieren
            </h4>
            <p className="text-xs text-slate-300">
              Lädt die Antragsmappe (PDF) und alle Strategiedateien (DOCX) online aus dem verknüpften Google Drive Ordner und kombiniert diese automatisch. Die Geschäftsordnung am Schluss wird ignoriert!
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
  );
};
