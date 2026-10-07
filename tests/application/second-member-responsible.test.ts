import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CreateExpense } from '../../src/application/use-cases/movement/CreateExpense';
import { CreateIncome } from '../../src/application/use-cases/movement/CreateIncome';
import { AddNucleusMember } from '../../src/application/use-cases/person/AddNucleusMember';
import { CreatePerson } from '../../src/application/use-cases/person/CreatePerson';
import { DomainError } from '../../src/domain/errors/DomainError';
import { seedPersonAndNucleus, seedResource } from '../seed';
import { createTestDb, TestDb } from '../testDb';

/**
 * Etapa A, tarefa A3: a segunda pessoa do casal precisa poder ser cadastrada no núcleo e
 * escolhida como Responsável de um lançamento feito pela primeira (as duas usam o mesmo
 * computador e o mesmo usuário do Windows — plano de validação, PV-10).
 */
describe('Segunda pessoa no núcleo como Responsável', () => {
  let db: TestDb;
  let ownerId: string;
  let nucleusId: string;
  let accountId: string;

  beforeEach(async () => {
    db = await createTestDb();
    const { person, nucleus } = await seedPersonAndNucleus(db);
    ownerId = person.id;
    nucleusId = nucleus.id;
    accountId = (await seedResource(db, nucleusId, ownerId, { initialBalanceCents: 100_000 })).id;
  });

  afterEach(() => db.close());

  it('cadastra a segunda pessoa e ela passa a aparecer na lista do núcleo', async () => {
    const second = await new AddNucleusMember(db.uow).execute({ nucleusId, displayName: '  Bia  ' });

    const members = await db.repos.persons.listByNucleus(nucleusId);
    expect(members.map((member) => member.id).sort()).toEqual([ownerId, second.id].sort());
    expect(second.displayName).toBe('Bia');
    expect(await db.repos.memberships.findByPersonAndNucleus(second.id, nucleusId)).not.toBeNull();
  });

  it('recusa nome repetido (sem diferenciar maiúsculas) e nome vazio', async () => {
    await new AddNucleusMember(db.uow).execute({ nucleusId, displayName: 'Bia' });

    await expect(new AddNucleusMember(db.uow).execute({ nucleusId, displayName: 'bia' })).rejects.toMatchObject({
      code: 'MEMBER_ALREADY_EXISTS',
    });
    await expect(new AddNucleusMember(db.uow).execute({ nucleusId, displayName: '   ' })).rejects.toMatchObject({
      code: 'PERSON_NAME_REQUIRED',
    });
  });

  it('saída lançada pela primeira pessoa registra a segunda como responsável', async () => {
    const second = await new AddNucleusMember(db.uow).execute({ nucleusId, displayName: 'Bia' });

    const { movementId } = await new CreateExpense(db.uow).execute({
      nucleusId,
      resourceId: accountId,
      categoryId: null,
      amountCents: 2_500,
      description: 'Mercado',
      date: '2026-11-05',
      createdByPersonId: ownerId,
      responsiblePersonId: second.id,
      clientOperationId: 'op-saida-bia',
    });

    const movement = await db.repos.movements.findById(movementId);
    expect(movement?.responsiblePersonId).toBe(second.id);
    expect(movement?.createdByPersonId).toBe(ownerId);
  });

  it('entrada lançada pela primeira pessoa registra a segunda como responsável', async () => {
    const second = await new AddNucleusMember(db.uow).execute({ nucleusId, displayName: 'Bia' });

    const { movementId } = await new CreateIncome(db.uow).execute({
      nucleusId,
      resourceId: accountId,
      categoryId: null,
      amountCents: 10_000,
      description: 'Salário',
      date: '2026-11-05',
      createdByPersonId: ownerId,
      responsiblePersonId: second.id,
      clientOperationId: 'op-entrada-bia',
    });

    const movement = await db.repos.movements.findById(movementId);
    expect(movement?.responsiblePersonId).toBe(second.id);
    expect(movement?.createdByPersonId).toBe(ownerId);
  });

  it('pessoa que não pertence ao núcleo não pode ser responsável', async () => {
    const outsider = await new CreatePerson(db.uow).execute({ displayName: 'Fora do núcleo' });

    const attempt = new CreateExpense(db.uow).execute({
      nucleusId,
      resourceId: accountId,
      categoryId: null,
      amountCents: 2_500,
      description: 'Mercado',
      date: '2026-11-05',
      createdByPersonId: ownerId,
      responsiblePersonId: outsider.id,
      clientOperationId: 'op-saida-fora',
    });

    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ code: 'MEMBER_NOT_IN_NUCLEUS' });
    expect(await db.repos.movements.list({ nucleusId })).toEqual([]);
  });
});
