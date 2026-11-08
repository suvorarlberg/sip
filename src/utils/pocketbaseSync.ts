import PocketBase from 'pocketbase';
import { AppSettings, SipStateRecord } from '../types';

export const pb = new PocketBase('https://api.sip.schuelerunion-vorarlberg.at');
// Verhindert automatisches Stornieren von Requests bei schnellen aufeinanderfolgenden Aufrufen
pb.autoCancellation(false);

export const SIP_DB_ROW_ID = 'currentsession0';
export const SIP_CONFIG_ROW_ID = 'sipusersconfig0';
export const SIP_ARCHIVE_ROW_ID = 'siparchives0000';

export interface CloudTwoFactorToken {
  code: string;
  email: string;
  expiresAt: string;
}

/**
 * Einheitliche SiP-Collection in PocketBase:
 * Die Collection heißt 'sip_state' mit den Systemfeldern id, created, updated und dem JSON-Feld payload.
 */
export const SIP_DATABASE_TABLE = 'sip_state';

/**
 * Universelle Get-or-Create Abfrage für SiP-Datensätze aus der PocketBase-Collection sip_state.
 * Sequenzielle Logik ohne verschachtelte try-catch-Blöcke.
 */
export async function querySipRow(
  rowIdOrClient: any,
  maybeRowId?: string
): Promise<{ data: SipStateRecord | null; error: any | null; tableUsed: string }> {
  const rowId = typeof rowIdOrClient === 'string' ? rowIdOrClient : (maybeRowId || '');
  if (!rowId) {
    const emptyErr = new Error('Keine rowId übergeben');
    return { data: null, error: emptyErr, tableUsed: SIP_DATABASE_TABLE };
  }

  let rawRecord: any = null;
  let readError: any = null;

  try {
    rawRecord = await pb.collection(SIP_DATABASE_TABLE).getOne(rowId, {
      requestKey: null,
      query: { _t: Date.now() },
    });
  } catch (err: any) {
    readError = err;
  }

  if (!readError && rawRecord) {
    const record = rawRecord as unknown as SipStateRecord;
    return { data: record, error: null, tableUsed: SIP_DATABASE_TABLE };
  }

  const status = readError ? readError.status : 0;
  if (status === 404) {
    const emptyPayload = {};
    const createObj = {
      id: rowId,
      payload: emptyPayload,
    };

    let createdRaw: any = null;
    let createError: any = null;

    try {
      createdRaw = await pb.collection(SIP_DATABASE_TABLE).create(createObj, {
        requestKey: null,
      });
    } catch (err: any) {
      createError = err;
      console.error(`[PocketBase Sync] Fehler beim Erstellen von Datensatz "${rowId}":`, err);
    }

    if (!createError && createdRaw) {
      const createdRecord = createdRaw as unknown as SipStateRecord;
      return { data: createdRecord, error: null, tableUsed: SIP_DATABASE_TABLE };
    }

    return { data: null, error: createError, tableUsed: SIP_DATABASE_TABLE };
  }

  if (readError) {
    console.error(`[PocketBase Sync] Fehler beim Laden von Datensatz "${rowId}":`, readError);
  }

  return { data: null, error: readError, tableUsed: SIP_DATABASE_TABLE };
}

/**
 * Universelles Upsert für SiP-Datensätze in die PocketBase-Collection sip_state.
 * Sequenzielle Logik ohne verschachtelte try-catch-Blöcke.
 */
export async function upsertSipRow(
  rowOrClient: any,
  maybeRow?: {
    id: string;
    payload: any;
  }
): Promise<{ success: boolean; data?: any; error?: any; tableUsed: string }> {
  const row = (maybeRow || rowOrClient) as {
    id: string;
    payload: any;
  };

  if (!row || !row.id) {
    const invalidErr = new Error('Ungültiger Datensatz für Upsert');
    console.error('[PocketBase Sync] Upsert fehlgeschlagen:', invalidErr);
    return { success: false, error: invalidErr, tableUsed: SIP_DATABASE_TABLE };
  }

  const rowId = row.id;
  const actualPayload = row.payload !== undefined ? row.payload : {};
  const recordData = {
    id: rowId,
    payload: actualPayload,
  };

  let updatedRaw: any = null;
  let updateError: any = null;

  try {
    updatedRaw = await pb.collection(SIP_DATABASE_TABLE).update(rowId, recordData, {
      requestKey: null,
    });
  } catch (err: any) {
    updateError = err;
  }

  if (!updateError && updatedRaw) {
    const updatedRecord = updatedRaw as unknown as SipStateRecord;
    return { success: true, data: updatedRecord, tableUsed: SIP_DATABASE_TABLE };
  }

  const status = updateError ? updateError.status : 0;
  if (status === 404) {
    const createObj = {
      id: rowId,
      payload: actualPayload,
    };

    let createdRaw: any = null;
    let createError: any = null;

    try {
      createdRaw = await pb.collection(SIP_DATABASE_TABLE).create(createObj, {
        requestKey: null,
      });
    } catch (err: any) {
      createError = err;
      console.error(`[PocketBase Sync] Fehler beim Neuanlegen von Datensatz "${rowId}":`, err);
    }

    if (!createError && createdRaw) {
      const createdRecord = createdRaw as unknown as SipStateRecord;
      return { success: true, data: createdRecord, tableUsed: SIP_DATABASE_TABLE };
    }

    return { success: false, error: createError, tableUsed: SIP_DATABASE_TABLE };
  }

  if (updateError) {
    console.error(`[PocketBase Sync] Fehler beim Aktualisieren von Datensatz "${rowId}":`, updateError);
  }

  return { success: false, error: updateError, tableUsed: SIP_DATABASE_TABLE };
}

/**
 * Generiert einen 2FA-Bestätigungscode und speichert ihn im Cloud-Token-Feld in PocketBase (sipusersconfig0).
 */
export async function sendAdmin2FAEmail(
  _settings: AppSettings,
  targetEmail: string
): Promise<{ rateLimited: boolean; backupCode?: string }> {
  const cleanEmail = targetEmail.trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');
  }

  const backupCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const res = await querySipRow(SIP_CONFIG_ROW_ID);
  const currentRecord = res ? res.data : null;
  const payload = currentRecord && currentRecord.payload ? currentRecord.payload : {};

  const twoFactorToken = {
    code: backupCode,
    email: cleanEmail.toLowerCase(),
    expiresAt: expiresAt,
  };

  const tokenPayload = {
    ...payload,
    twoFactorToken: twoFactorToken,
  };

  const recordData = {
    id: SIP_CONFIG_ROW_ID,
    payload: tokenPayload,
  };

  await upsertSipRow(recordData);

  return { rateLimited: false, backupCode: backupCode };
}

/**
 * Prüft den eingegebenen 2FA-Code (6-8-stelliger Zahlencode) oder Bestätigungs-Link
 * gegen den in PocketBase hinterlegten Cloud-Token.
 */
export async function verifyAdmin2FACode(
  _settings: AppSettings,
  email: string,
  tokenOrLink: string
): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  const rawInput = tokenOrLink.trim();
  if (!rawInput) return false;

  async function checkCloudTwoFactorToken(candidateCode: string): Promise<boolean> {
    const cleanCandidate = candidateCode.trim();
    if (!cleanCandidate) return false;

    const res = await querySipRow(SIP_CONFIG_ROW_ID);
    const data = res ? res.data : null;
    const payload = data ? data.payload : null;
    const t = payload ? (payload.twoFactorToken as unknown as CloudTwoFactorToken | undefined) : undefined;
    if (
      t &&
      t.code === cleanCandidate &&
      t.email.toLowerCase() === cleanEmail &&
      new Date(t.expiresAt).getTime() > Date.now()
    ) {
      return true;
    }
    return false;
  }

  // 1. Falls eine URL eingefügt wurde
  if (
    rawInput.startsWith('http://') ||
    rawInput.startsWith('https://') ||
    rawInput.startsWith('localhost') ||
    rawInput.includes('access_token=') ||
    rawInput.includes('token=') ||
    rawInput.includes('2fa_code=') ||
    rawInput.includes('code=')
  ) {
    let directCode: string | null = null;
    try {
      const normalizedUrlStr = rawInput.startsWith('localhost')
        ? `http://${rawInput}`
        : rawInput.startsWith('http')
        ? rawInput
        : `https://dummy.local/?${rawInput.replace(/^#/, '')}`;
      const parsedUrl = new URL(normalizedUrlStr);

      directCode =
        parsedUrl.searchParams.get('2fa_code') ||
        parsedUrl.searchParams.get('code') ||
        parsedUrl.searchParams.get('token');
    } catch (err: any) {
      const errorMessage = err ? err.message : 'URL parse error';
      void errorMessage;
    }

    if (directCode) {
      const isMatch = await checkCloudTwoFactorToken(directCode);
      if (isMatch) return true;
    }
  }

  // 2. Prüfung gegen 6-stelligen Cloud-Token
  const cleanToken = rawInput.replace(/\s+/g, '');
  const isValid = await checkCloudTwoFactorToken(cleanToken);
  if (isValid) {
    return true;
  }

  return false;
}
