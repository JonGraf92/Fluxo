import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetDashboardSummary } from '../../src/application/use-cases/balance/GetDashboardSummary';
import { CreateExpense, CreateExpenseInput } from '../../src/application/use-cases/movement/CreateExpense';
import { ListMovements } from '../../src/application/use-cases/movement/ListMovements';
import { fuelQuantityMl } from '../../src/domain/entities/FuelDetails';
import { toMovementDto } from '../../electron/main/ipc/dto';
import { seedPersonAndNucleus, seedResource } from '../seed';
import { createTestDb, TestDb } from '../testDb';

const BALANCE = 500_000;
const AMOUNT = 25_000;
const PRICE = 5_799; // R$ 5,799 por litro

describe('Combustível — detalhes digitados no lançamento (ADR D-038)', () => {
  let db: TestDb;
  let personId: string;
  let nucleusId: string;
  let accountId: string;
  let fuelCategoryId: string;
  let otherCategoryId: string;
  let op = 0;

  beforeEach(async () => {
    db = await createTestDb();
    const { person, nucleus, categories } = await seedPersonAndNucleus(db);
    personId = person.id;
    nucleusId = nucleus.id;
    accountId = (await seedResource(db, nucleusId, personId, { initialBalanceCents: BALANCE })).id;
    fuelCategoryId = categories.find((category) => category.systemKey === 'FUEL')!.id;
    otherCategoryId = categories.find((category) => category.name === 'Transporte')!.id;
  });

  afterEach(() => db.close());

  const expense = (overrides: Partial<CreateExpenseInput> = {}) =>
    new CreateExpense(db.uow).execute({
      nucleusId, resourceId: accountId, categoryId: fuelCategoryId, amountCents: AMOUNT, description: 'Abastecimento',
      date: '2026-11-10', createdByPersonId: personId, clientOperationId: 'fuel-' + (op += 1), ...overrides,
    });
  const listed = async () => (await new ListMovements(db.repos).execute({ nucleusId })).map(toMovementDto);
  const moneyTotal = async () => (await new GetDashboardSummary(db.repos).execute({ nucleusId, periodDateFrom: '2026-01-01', periodDateTo: '2026-12-31' })).moneyTotalCents;

  it('grava preço por litro, hodômetro e combustível, e deriva os litros na leitura', async () => {
    await expense({ fuel: { fuelType: 'GASOLINE', pricePerLiterMillis: PRICE, odometerKm: 45_210 } });

    const [movement] = await listed();
    expect(movement?.fuel).toEqual({
      fuelType: 'GASOLINE', pricePerLiterMillis: PRICE, quantityMl: fuelQuantityMl(AMOUNT, { quantityMl: null, pricePerLiterMillis: PRICE }),
      odometerKm: 45_210, stationName: null, stationCnpj: null, stationAddress: null, taxTotalCents: null, taxes: [], provenance: 'MANUAL',
    });
    expect(movement?.fuel?.quantityMl).toBe(43_111); // 250,00 ÷ 5,799 = 43,111 L
    // Detalhe é leitura: o saldo só muda pelo valor da saída.
    expect(await moneyTotal()).toBe(BALANCE - AMOUNT);
  });

  it('os campos são opcionais, e sem nenhum deles nada é gravado', async () => {
    await expense({ description: 'Só hodômetro', fuel: { odometerKm: 0 } });
    await expense({ description: 'Sem detalhes', fuel: { fuelType: null, pricePerLiterMillis: null, odometerKm: null } });
    await expense({ description: 'Sem o campo' });

    const byDescription = new Map((await listed()).map((movement) => [movement.description, movement.fuel]));
    expect(byDescription.get('Só hodômetro')).toMatchObject({ odometerKm: 0, pricePerLiterMillis: null, quantityMl: null });
    expect(byDescription.get('Sem detalhes')).toBeNull();
    expect(byDescription.get('Sem o campo')).toBeNull();
  });

  it('recusa detalhes de combustível em outra categoria ou sem categoria, sem gravar o lançamento', async () => {
    const fuel = { pricePerLiterMillis: PRICE };
    await expect(expense({ categoryId: otherCategoryId, fuel })).rejects.toMatchObject({ code: 'FUEL_DETAILS_NOT_ALLOWED' });
    await expect(expense({ categoryId: null, fuel })).rejects.toMatchObject({ code: 'FUEL_DETAILS_NOT_ALLOWED' });
    expect(await listed()).toEqual([]);
    expect(await moneyTotal()).toBe(BALANCE);
  });

  it('reconhece a categoria pela chave, mesmo renomeada', async () => {
    db.raw.prepare('UPDATE categories SET name = ? WHERE id = ?').run('Posto', fuelCategoryId);
    await expense({ fuel: { pricePerLiterMillis: PRICE } });
    expect((await listed())[0]?.fuel?.pricePerLiterMillis).toBe(PRICE);
  });

  it('recusa valores fora da faixa na fronteira de persistência, desfazendo o lançamento', async () => {
    await expect(expense({ fuel: { pricePerLiterMillis: 100_000 } })).rejects.toMatchObject({ code: 'FUEL_PRICE_INVALID' });
    await expect(expense({ fuel: { pricePerLiterMillis: 5.5 } })).rejects.toMatchObject({ code: 'FUEL_PRICE_INVALID' });
    await expect(expense({ fuel: { odometerKm: -1 } })).rejects.toMatchObject({ code: 'FUEL_ODOMETER_INVALID' });
    expect(await listed()).toEqual([]);
    expect(await moneyTotal()).toBe(BALANCE);
  });
});
