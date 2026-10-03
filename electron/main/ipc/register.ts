import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  AuthContext,
  IpcContext,
  IpcResult,
  buildAuthenticatedHandler,
  buildPublicHandler,
} from './handlerFactory';
import { registerAppHandlers } from './handlers/app.handlers';
import { registerCategoryHandlers } from './handlers/category.handlers';
import { registerCreditInvoiceHandlers } from './handlers/credit-invoice.handlers';
import { registerDashboardHandlers } from './handlers/dashboard.handlers';
import { registerExportHandlers } from './handlers/export.handlers';
import { registerFinancingHandlers } from './handlers/financing.handlers';
import { registerMovementHandlers } from './handlers/movement.handlers';
import { registerMemberHandlers } from './handlers/member.handlers';
import { registerResourceHandlers } from './handlers/resource.handlers';

export type { AuthContext, IpcContext, IpcResult };

/** Canal público — ver handlerFactory.ts para quando isto é apropriado (só 2 canais). */
export function handle<Schema extends z.ZodTypeAny, Result>(
  channel: string,
  schema: Schema,
  fn: (payload: z.infer<Schema>) => Promise<Result>,
): void {
  const handler = buildPublicHandler(channel, schema, fn);
  ipcMain.handle(channel, async (_event, rawPayload) => handler(rawPayload));
}

/** Canal autenticado — deriva personId da identidade local e autoriza o núcleo do payload. */
export function handleAuthenticated<Schema extends z.ZodTypeAny, Result>(
  ctx: IpcContext,
  channel: string,
  schema: Schema,
  fn: (payload: z.infer<Schema>, auth: AuthContext) => Promise<Result>,
): void {
  const handler = buildAuthenticatedHandler(ctx, channel, schema, fn);
  ipcMain.handle(channel, async (_event, rawPayload) => handler(rawPayload));
}

export function registerIpcHandlers(ctx: IpcContext): void {
  registerAppHandlers(ctx);
  registerMemberHandlers(ctx);
  registerCreditInvoiceHandlers(ctx);
  registerFinancingHandlers(ctx);
  registerResourceHandlers(ctx);
  registerCategoryHandlers(ctx);
  registerMovementHandlers(ctx);
  registerDashboardHandlers(ctx);
  registerExportHandlers(ctx);
}
