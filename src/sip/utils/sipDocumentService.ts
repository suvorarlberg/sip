import { pb, POCKETBASE_URL } from '../../utils/pocketbaseSync';
import { SipUploadedDocument } from '../types';

export const SIP_DOCUMENTS_COLLECTION = 'sip_documents';

/**
 * Lädt ein Dokument (PDF-Antragsmappe oder DOCX-Strategiedatei) in die PocketBase-Collection sip_documents hoch.
 */
export async function uploadSipDocument(options: {
  file: File;
  docType: 'antragsmappe' | 'strategie' | 'general' | 'go';
  sessionId: string;
  title?: string;
}): Promise<SipUploadedDocument> {
  const { file, docType, sessionId, title } = options;
  const docTitle = title || file.name;

  const formData = new FormData();
  formData.append('title', docTitle);
  formData.append('session_id', sessionId);
  formData.append('file', file);
  if (docType) {
    formData.append('doc_type', docType);
  }

  let record: any;
  try {
    record = await pb.collection(SIP_DOCUMENTS_COLLECTION).create(formData);
  } catch (err: any) {
    // Falls doc_type im PocketBase-Schema als Select mit abweichenden Optionen hinterlegt ist,
    // versuchen wir einen sicheren Fallback ohne doc_type, damit der Dateiupload nicht scheitert.
    if (err?.data?.doc_type) {
      console.warn('doc_type Validierungsfehler, versuche Fallback ohne doc_type:', err);
      const fallbackFormData = new FormData();
      fallbackFormData.append('title', docTitle);
      fallbackFormData.append('session_id', sessionId);
      fallbackFormData.append('file', file);
      record = await pb.collection(SIP_DOCUMENTS_COLLECTION).create(fallbackFormData);
    } else {
      throw err;
    }
  }

  const fileUrl =
    pb.files.getUrl(record, record.file) ||
    `${POCKETBASE_URL}/api/files/${SIP_DOCUMENTS_COLLECTION}/${record.id}/${record.file}`;

  return {
    id: record.id,
    title: record.title || docTitle,
    doc_type: (record.doc_type as any) || docType,
    file: record.file,
    url: fileUrl,
    size: file.size,
    session_id: sessionId,
    createdAt: record.created,
  };
}

/**
 * Ruft alle zu einer SiP-Sitzung gehörenden Dokumente aus PocketBase ab.
 */
export async function fetchSipDocuments(sessionId?: string): Promise<SipUploadedDocument[]> {
  try {
    const records = await pb.collection(SIP_DOCUMENTS_COLLECTION).getFullList({
      filter: sessionId ? `session_id = "${sessionId}"` : undefined,
      sort: '-created',
      requestKey: null,
    });

    return records.map((r: any) => {
      const fileUrl =
        pb.files.getUrl(r, r.file) ||
        `${POCKETBASE_URL}/api/files/${SIP_DOCUMENTS_COLLECTION}/${r.id}/${r.file}`;
      return {
        id: r.id,
        title: r.title || 'Dokument',
        doc_type: (r.doc_type as any) || 'general',
        file: r.file,
        url: fileUrl,
        session_id: r.session_id,
        createdAt: r.created,
      };
    });
  } catch (err) {
    console.warn('Konnte Dokumente aus PocketBase nicht abrufen:', err);
    return [];
  }
}

/**
 * Löscht ein Dokument aus der PocketBase-Collection sip_documents.
 */
export async function deleteSipDocument(documentId: string): Promise<boolean> {
  try {
    await pb.collection(SIP_DOCUMENTS_COLLECTION).delete(documentId);
    return true;
  } catch (err) {
    console.error('Fehler beim Löschen des Dokuments:', err);
    return false;
  }
}
