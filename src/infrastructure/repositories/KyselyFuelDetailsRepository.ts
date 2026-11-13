import { Kysely } from 'kysely';
import { FuelDetailsRepository } from '../../application/ports/repositories';
import { FuelDetails, fuelDetailsProblem, FuelProvenance, FuelType } from '../../domain/entities/FuelDetails';
import { DomainError } from '../../domain/errors/DomainError';
import { Database } from '../db/types';

export class KyselyFuelDetailsRepository implements FuelDetailsRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /** Fronteira de persistência (ADR D-030): detalhe inválido ou nota repetida não é gravado. */
  async save(details: FuelDetails): Promise<void> {
    const problem = fuelDetailsProblem(details);
    if (problem) throw new DomainError(problem, 'Os detalhes do abastecimento estão inválidos.');
    if (details.accessKey !== null) {
      const duplicate = await this.db.selectFrom('fuel_details').select('movement_id').where('access_key', '=', details.accessKey).executeTakeFirst();
      if (duplicate) throw new DomainError('FUEL_DOCUMENT_ALREADY_IMPORTED', 'Esta nota fiscal já foi lançada.');
    }
    await this.db.insertInto('fuel_details').values({
      movement_id: details.movementId,
      fuel_type: details.fuelType,
      price_per_liter_millis: details.pricePerLiterMillis,
      quantity_ml: details.quantityMl,
      odometer_km: details.odometerKm,
      station_name: details.stationName,
      station_cnpj: details.stationCnpj,
      station_address: details.stationAddress,
      tax_total_cents: details.taxTotalCents,
      provenance: details.provenance,
      access_key: details.accessKey,
    }).execute();
    if (details.taxes.length) {
      await this.db.insertInto('fuel_detail_taxes')
        .values(details.taxes.map((tax) => ({ movement_id: details.movementId, tax_code: tax.taxCode, amount_cents: tax.amountCents })))
        .execute();
    }
  }

  async listByMovementIds(movementIds: string[]): Promise<FuelDetails[]> {
    if (movementIds.length === 0) return [];
    const rows = await this.db.selectFrom('fuel_details').selectAll().where('movement_id', 'in', movementIds).execute();
    if (rows.length === 0) return [];
    const taxes = await this.db.selectFrom('fuel_detail_taxes').selectAll()
      .where('movement_id', 'in', rows.map((row) => row.movement_id)).orderBy('tax_code').execute();
    return rows.map((row) => ({
      movementId: row.movement_id,
      fuelType: row.fuel_type as FuelType | null,
      pricePerLiterMillis: row.price_per_liter_millis,
      quantityMl: row.quantity_ml,
      odometerKm: row.odometer_km,
      stationName: row.station_name,
      stationCnpj: row.station_cnpj,
      stationAddress: row.station_address,
      taxTotalCents: row.tax_total_cents,
      taxes: taxes.filter((tax) => tax.movement_id === row.movement_id).map((tax) => ({ taxCode: tax.tax_code, amountCents: tax.amount_cents })),
      provenance: row.provenance as FuelProvenance,
      accessKey: row.access_key,
    }));
  }
}
