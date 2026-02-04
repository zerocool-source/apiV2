import { createHash } from 'crypto';

export function makeQueryHash(text: string, category?: string): string {
  const normalizedText = (text || '').trim().toLowerCase();
  const normalizedCategory = (category || '').trim().toLowerCase();
  return createHash('sha256').update(`${normalizedText}|${normalizedCategory}`).digest('hex');
}
