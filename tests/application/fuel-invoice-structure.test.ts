import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { ListMovements } from '../../src/application/use-cases/movement/ListMovements';
import { FuelDetails } from '../../src/domain/entities/FuelDetails';
import { CreateExpenseSchema } from '../../src/shared/ipc-contract';
import { formatLiterPrice, parseLiterPriceToMillis } from '../../src/shared/liter-price-parsing';
import { toMovementDto } from '../../electron/main/ipc/dto';
import { seedPersonAndNucleus, seedResource } from '../seed';
import { createTestDb, TestDb } from '../testDb';

const BALANCE = 500_000;
const AMOUNT = 25_000;

/** A captura de nota fiscal (QR Code ou OCR) grava pelo mesmo repositório que estes testes usam. */
describe('Combustível — estrutura pronta para a captura de nota fiscal (ADR D-038)', () => {
  let db: TestDb;
  let nucleusId: string;
  let newFuelExpense: () => Promise<string>;

  beforeEach(async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    nucleusId = nucleus.id;
    const accountId = (await seedResource(db, nucleusId, person.id, { initialBalanceCents: BALANCE })).id;
    const categoryId = categories.find((category) => category.systemKey === 'FUEL')!.id;
    let op = 0;
    newFuelExpense = async () =>
      (await new CreateExpense(db.uow).execute({ nucleusId, resourceId: accountId, categoryId, amountCents: AMOUNT, description: 'Abastecimento', date: '2026-11-10', createdByPersonId: person.id, clientOperationId: 'nf-' + (op += 1) })).movementId;
  });

  afterEach(() => db.close());

  const fromInvoice = (movementId: string, overrides: Partial<FuelDetails> = {}): FuelDetails => ({
    movementId, fuelType: 'ETHANOL', pricePerLiterMillis: 3_899, quantityMl: 40_000, odometerKm: null,
    stationName: 'Posto Fabricado Ltda', stationCnpj: '12345678000195', stationAddress: 'Av. Teste, 100 - Cidade/UF',
    taxTotalCents: 4_321, taxes: [{ taxCode: 'ICMS', amountCents: 3_000 }, { taxCode: 'PIS', amountCents: 400 }, { taxCode: 'COFINS', amountCents: 921 }],
    provenance: 'QR_SEFAZ', accessKey: '1'.repeat(44), ...overrides,
  });
  const listed = async () => (await new ListMovements(db.repos).execute({ nucleusId })).map(toMovementDto);

  it('guarda posto, CNPJ, endereço, volume e impostos segregados; a tela recebe tudo menos a chave', async () => {
    await db.repos.fuelDetails.save(fromInvoice(await newFuelExpense()));

    const [movement] = await listed();
    expect(movement?.fuel).toMatchObject({
      fuelType: 'ETHANOL', stationName: 'Posto Fabricado Ltda', stationCnpj: '12345678000195', stationAddress: 'Av. Teste, 100 - Cidade/UF',
      quantityMl: 40_000, pricePerLiterMillis: 3_899, taxTotalCents: 4_321, provenance: 'QR_SEFAZ',
      taxes: [{ taxCode: 'COFINS', amountCents: 921 }, { taxCode: 'ICMS', amountCents: 3_000 }, { taxCode: 'PIS', amountCents: 400 }],
    });
    expect(movement?.fuel).not.toHaveProperty('accessKey');
    // Imposto já está dentro do valor pago: nunca é somado de novo.
    const summary = await new GetDashboardSummary(db.repos).execute({ nucleusId, periodDateFrom: '2026-01-01', periodDateTo: '2026-12-31' });
    expect(summary.moneyTotalCents).toBe(BALANCE - AMOUNT);
    expect(summary.periodExpenseCents).toBe(AMOUNT);
  });

  it('a mesma nota não entra duas vezes', async () => {
    await db.repos.fuelDetails.save(fromInvoice(await newFuelExpense()));
    await expect(db.repos.fuelDetails.save(fromInvoice(await newFuelExpense()))).rejects.toMatchObject({ code: 'FUEL_DOCUMENT_ALREADY_IMPORTED' });
  });

  it('falha fechado em dado fiscal malformado ou proveniência incoerente', async () => {
    const movementId = await newFuelExpense();
    const save = (overrides: Partial<FuelDetails>) => db.repos.fuelDetails.save(fromInvoice(movementId, overrides));
    await expect(save({ stationCnpj: '123' })).rejects.toMatchObject({ code: 'FUEL_STATION_CNPJ_INVALID' });
    await expect(save({ accessKey: '123' })).rejects.toMatchObject({ code: 'FUEL_ACCESS_KEY_INVALID' });
    await expect(save({ quantityMl: 0 })).rejects.toMatchObject({ code: 'FUEL_QUANTITY_INVALID' });
    await expect(save({ taxes: [{ taxCode: 'ICMS', amountCents: 1 }, { taxCode: 'ICMS', amountCents: 2 }] })).rejects.toMatchObject({ code: 'FUEL_TAX_INVALID' });
    await expect(save({ taxes: [{ taxCode: 'ICMS', amountCents: 1.5 }] })).rejects.toMatchObject({ code: 'FUEL_TAX_INVALID' });
    await expect(save({ accessKey: null })).rejects.toMatchObject({ code: 'FUEL_PROVENANCE_INVALID' });
    await expect(save({ provenance: 'MANUAL' })).rejects.toMatchObject({ code: 'FUEL_PROVENANCE_INVALID' });
    expect((await listed())[0]?.fuel).toBeNull();
  });

  it('o renderer não consegue enviar dado de nota fiscal', () => {
    const base = { nucleusId: '11111111-1111-4111-8111-111111111111', resourceId: '22222222-2222-4222-8222-222222222222', amountCents: AMOUNT, description: 'x', date: '2026-11-10', clientOperationId: '33333333-3333-4333-8333-333333333333' };
    expect(CreateExpenseSchema.safeParse({ ...base, fuel: { pricePerLiterMillis: 5_799, odometerKm: 10 } }).success).toBe(true);
    for (const forged of [{ stationName: 'Posto' }, { accessKey: '1'.repeat(44) }, { provenance: 'QR_SEFAZ' }, { taxes: [] }, { pricePerLiterMillis: 5.799 }]) {
      expect(CreateExpenseSchema.safeParse({ ...base, fuel: forged }).success, JSON.stringify(forged)).toBe(false);
    }
  });

  it('preço por litro: três casas, formato brasileiro, sem adivinhar', () => {
    expect(parseLiterPriceToMillis('5,799')).toBe(5_799);
    expect(parseLiterPriceToMillis('6')).toBe(6_000);
    expect(parseLiterPriceToMillis('R$ 5,8')).toBe(5_800);
    for (const input of ['', '0', '0,000', '5.799', '5,7999', '-5', '123,4', 'abc']) {
      expect(parseLiterPriceToMillis(input), input).toBeNull();
    }
    for (const millis of [1, 999, 5_799, 6_000, 99_999]) {
      expect(parseLiterPriceToMillis(formatLiterPrice(millis))).toBe(millis);
    }
  });
});
