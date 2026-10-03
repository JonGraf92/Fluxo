import { Kysely } from 'kysely';
import { RepositoryContext } from '../../application/ports/RepositoryContext';
import { Database } from '../db/types';
import { KyselyAuditLogRepository } from './KyselyAuditLogRepository';
import { KyselyCategoryRepository } from './KyselyCategoryRepository';
import { KyselyCreditInvoiceRepository } from './KyselyCreditInvoiceRepository';
import { KyselyFinancingRepository } from './KyselyFinancingRepository';
import { KyselyLocalIdentityRepository } from './KyselyLocalIdentityRepository';
import { KyselyMembershipRepository } from './KyselyMembershipRepository';
import { KyselyMovementRepository } from './KyselyMovementRepository';
import { KyselyNucleusRepository } from './KyselyNucleusRepository';
import { KyselyPersonRepository } from './KyselyPersonRepository';
import { KyselyResourceOwnershipRepository } from './KyselyResourceOwnershipRepository';
import { KyselyResourceRepository } from './KyselyResourceRepository';

/**
 * Constrói um RepositoryContext inteiro amarrado a um único executor Kysely — que pode
 * ser a conexão principal (para leituras) ou uma transação (`trx`, para escritas atômicas
 * dentro de SqliteUnitOfWork.run(...)). Nunca misturar executores dentro da mesma operação.
 */
export function createRepositoryContext(executor: Kysely<Database>): RepositoryContext {
  return {
    persons: new KyselyPersonRepository(executor),
    localIdentity: new KyselyLocalIdentityRepository(executor),
    nuclei: new KyselyNucleusRepository(executor),
    memberships: new KyselyMembershipRepository(executor),
    resources: new KyselyResourceRepository(executor),
    resourceOwnership: new KyselyResourceOwnershipRepository(executor),
    categories: new KyselyCategoryRepository(executor),
    movements: new KyselyMovementRepository(executor),
    auditLogs: new KyselyAuditLogRepository(executor),
    creditInvoices: new KyselyCreditInvoiceRepository(executor),
    financings: new KyselyFinancingRepository(executor),
  };
}
