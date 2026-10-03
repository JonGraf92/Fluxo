import { z } from 'zod';
import { CompleteOnboarding } from '../../../../src/application/use-cases/onboarding/CompleteOnboarding';
import { GetAppState } from '../../../../src/application/use-cases/onboarding/GetAppState';
import { AppStateDto, CHANNELS, CompleteOnboardingSchema, OnboardingResultDto } from '../../../../src/shared/ipc-contract';
import { IpcContext, handle } from '../register';

const AppGetStateSchema = z.undefined();

/**
 * Estes dois canais ficam de propósito como `handle` (público) em vez de
 * `handleAuthenticated`: são exatamente os únicos dois pontos de entrada que precisam
 * funcionar ANTES de existir uma identidade local — é assim que o renderer descobre que
 * precisa (ou não) mostrar o onboarding, e é o onboarding que cria a identidade.
 * `CompleteOnboarding` tem sua própria guarda contra uma segunda execução (ADR D-026).
 */
export function registerAppHandlers(ctx: IpcContext): void {
  handle<typeof AppGetStateSchema, AppStateDto>(CHANNELS.appGetState, AppGetStateSchema, async () => {
    const result = await new GetAppState(ctx.repos).execute();
    return result;
  });

  handle<typeof CompleteOnboardingSchema, OnboardingResultDto>(
    CHANNELS.onboardingComplete,
    CompleteOnboardingSchema,
    async (payload) => {
      const result = await new CompleteOnboarding(ctx.uow).execute(payload);
      return { personId: result.person.id, nucleusId: result.nucleus.id, resourceId: result.resource.id };
    },
  );
}
