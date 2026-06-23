/** Per-destination migration job names when creating one job per target PACS. */
export function migrationJobNames(baseName: string, destinationCount: number): string[] {
  const base = baseName.trim() || "Migration job";
  if (destinationCount <= 0) return [];
  if (destinationCount === 1) return [base];
  return Array.from({ length: destinationCount }, (_, index) => `${base} #${index + 1}`);
}
