import { createHash } from 'node:crypto';

/** Campos da marcação que entram no hash (ordem de chaves fixa). */
export interface TimeEntryContent {
  companyId: string;
  employeeId: string;
  unitId: string;
  nsr: string;
  kind: string;
  recordedAt: string;
  deviceRecordedAt: string | null;
  referencesEntryId: string | null;
  adjustmentRequestId: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  geofenceStatus: string;
  selfieFileId: string | null;
  source: string;
  createdBy: string;
}

/** JSON com chaves em ordem alfabética: a mesma marcação sempre gera o mesmo texto. */
export function canonicalJson(content: TimeEntryContent): string {
  const sorted = Object.keys(content)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = content[key as keyof TimeEntryContent];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

/**
 * Hash encadeado (regra 3): SHA-256 do hash da marcação anterior do mesmo funcionário com o
 * conteúdo desta. Alterar ou remover qualquer marcação quebra a cadeia a partir dela.
 */
export function chainHash(previousHash: string | null, content: TimeEntryContent): string {
  return createHash('sha256')
    .update(`${previousHash ?? ''}\n${canonicalJson(content)}`, 'utf8')
    .digest('hex');
}

export interface ChainLink {
  id: string;
  previousHash: string | null;
  hash: string;
  content: TimeEntryContent;
}

/** Confere a cadeia em ordem; devolve a primeira marcação inconsistente, se houver. */
export function verifyChain(links: readonly ChainLink[]): {
  valid: boolean;
  brokenAtId: string | null;
} {
  let previous: string | null = null;
  for (const link of links) {
    if (link.previousHash !== previous || chainHash(previous, link.content) !== link.hash) {
      return { valid: false, brokenAtId: link.id };
    }
    previous = link.hash;
  }
  return { valid: true, brokenAtId: null };
}
