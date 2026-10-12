/** Phase4 seam contract. Native implementation and exact-byte checks land in Phase5. */
import { HwinfoError } from '../hwinfo/types';
import type { SensorSnapshot } from '../hwinfo/types';
export interface MacSnapshotProvider {
  read(): SensorSnapshot | null;
  current(): SensorSnapshot | null;
  untilExpiry(): number | null;
  age(): number | null;
  close(): void;
}
export function initHwsm(): void { /* Loading errors surface through the provider without terminating the app. */ }
export function openMacProvider(_ready: () => void): MacSnapshotProvider {
  void _ready;
  const error = new HwinfoError('bridge-failed', 'The native reader is not assembled yet.');
  error.name = 'MacSensorsError';
  throw error;
}
