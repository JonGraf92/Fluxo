import { CreateAdjustment } from '../../../../src/application/use-cases/movement/CreateAdjustment';
import { CreateExpense } from '../../../../src/application/use-cases/movement/CreateExpense';
import { CreateIncome } from '../../../../src/application/use-cases/movement/CreateIncome';
import { CreateTransfer } from '../../../../src/application/use-cases/movement/CreateTransfer';
import { CancelMovement } from '../../../../src/application/use-cases/movement/CancelMovement';
import { ListMovements } from '../../../../src/application/use-cases/movement/ListMovements';
import {
  CancelMovementSchema,
  CHANNELS,
  CreateAdjustmentSchema,
  CreateExpenseSchema,
  CreateIncomeSchema,
  CreateTransferSchema,
  ListMovementsSchema,
  MovementDto,
} from '../../../../src/shared/ipc-contract';
import { toMovementDto } from '../dto';
import { IpcContext, handleAuthenticated } from '../register';
import { NotFoundError } from '../../../../src/domain/errors/DomainError';
import { assertNucleusAccess } from '../handlerFactory';

/**
 * Todo `createdByPersonId`/`actorPersonId` passado aos casos de uso abaixo vem de
 * `auth.personId` — nunca do payload do renderer (ADR D-024). O cancelamento não tem
 * `nucleusId` no payload (só `movementId`), então a checagem automática de núcleo do
 * `handleAuthenticated` não se aplica aqui; `CancelMovement` faz essa verificação por
 * conta própria, a partir do núcleo real da movimentação (ADR D-025).
 */
export function registerMovementHandlers(ctx: IpcContext): void {
  handleAuthenticated(ctx, CHANNELS.movementCreateIncome, CreateIncomeSchema, async (payload, auth) => {
    return new CreateIncome(ctx.uow).execute({
      ...payload,
      categoryId: payload.categoryId ?? null,
      responsiblePersonId: payload.responsiblePersonId,
      createdByPersonId: auth.personId,
    });
  });

  handleAuthenticated(ctx, CHANNELS.movementCreateExpense, CreateExpenseSchema, async (payload, auth) => {
    return new CreateExpense(ctx.uow).execute({
      ...payload,
      categoryId: payload.categoryId ?? null,
      responsiblePersonId: payload.responsiblePersonId,
      createdByPersonId: auth.personId,
    });
  });

  handleAuthenticated(ctx, CHANNELS.movementCreateTransfer, CreateTransferSchema, async (payload, auth) => {
    return new CreateTransfer(ctx.uow).execute({ ...payload, createdByPersonId: auth.personId });
  });

  handleAuthenticated(ctx, CHANNELS.movementCreateAdjustment, CreateAdjustmentSchema, async (payload, auth) => {
    return new CreateAdjustment(ctx.uow).execute({ ...payload, createdByPersonId: auth.personId });
  });

  // `movement:cancel` não recebe nucleusId no payload (só o movementId), então declara
  // explicitamente como autorizar: resolve o núcleo REAL do movimento e confirma que a
  // pessoa atual é membro dele. Antes isso era implícito, e um canal sem nucleusId passava
  // sem nenhuma verificação (ver a diretriz fail-closed em handlerFactory.ts).
  handleAuthenticated(ctx, CHANNELS.movementCancel, CancelMovementSchema, async (payload, auth) => {
    await new CancelMovement(ctx.uow).execute({
      movementId: payload.movementId,
      reason: payload.reason,
      actorPersonId: auth.personId,
    });
    return { cancelled: true };
  }, {
    authorize: async (payload, personId) => {
      const movement = await ctx.repos.movements.findById(payload.movementId);
      if (!movement) throw new NotFoundError('Movimentação', payload.movementId);
      await assertNucleusAccess(ctx.repos, personId, movement.nucleusId);
    },
  });

  handleAuthenticated<typeof ListMovementsSchema, MovementDto[]>(
    ctx,
    CHANNELS.movementList,
    ListMovementsSchema,
    async (payload) => {
      const entries = await new ListMovements(ctx.repos).execute(payload);
      return entries.map(toMovementDto);
    },
  );
}
