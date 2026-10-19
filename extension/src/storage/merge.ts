import type { SyncMeta } from '../shared/types';

/**
 * Last-write-wins merge of one record.
 *
 * Returns the record that must be written locally, or null when the local
 * copy is already up to date.
 */
export function mergeRecord<T extends SyncMeta>(local: T | undefined, incoming: T): T | null {
  return !local || incoming.updatedAt > local.updatedAt ? incoming : null;
}
