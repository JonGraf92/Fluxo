import { ExportSnapshot } from './ExportSnapshot';

/** Exportação JSON completa — seção 38/39. Formato estável para reimportação futura. */
export function exportToJson(snapshot: ExportSnapshot): string {
  return JSON.stringify(
    {
      formatVersion: 1,
      exportedAt: snapshot.exportedAt.toISOString(),
      nucleus: snapshot.nucleus,
      resources: snapshot.resources,
      categories: snapshot.categories,
      movements: snapshot.movements,
      legs: snapshot.legs,
      adjustments: snapshot.adjustments,
    },
    null,
    2,
  );
}
