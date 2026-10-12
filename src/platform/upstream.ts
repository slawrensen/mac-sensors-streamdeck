/** Default seam values for the pinned copied-core tests. */
export const runtime = {
  displayName: 'HWiNFO', environmentPrefix: 'HWINFO_', platformName: 'windows', forceTahoma: false,
  statisticsNotice: (source: string): string | null => source === 'gadget' ? 'Historical statistics unavailable in Gadget' : null,
  errorText: (error: unknown): string => String(error)
};
export function environment(name: string): string | undefined { return process.env[runtime.environmentPrefix + name]; }
