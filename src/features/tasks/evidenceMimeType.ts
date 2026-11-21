import { ALLOWED_EVIDENCE_MIME_TYPES } from '@/features/tasks/taskCompletionAttempt';

// Content-Type header -> allowed evidence MIME, or null. Parameters
// ("; charset=…") and case are ignored; anything outside the bucket's own
// allow-list (including application/octet-stream) is refused rather than
// guessed.
export function normalizeEvidenceMimeType(contentType: string): string | null {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return (ALLOWED_EVIDENCE_MIME_TYPES as readonly string[]).includes(mime) ? mime : null;
}
