import {
  AuditLogRepository,
  CategoryRepository,
  CreditInvoiceRepository,
  FinancingRepository,
  LocalIdentityRepository,
  MembershipRepository,
  MovementRepository,
  NucleusRepository,
  PersonRepository,
  ResourceOwnershipRepository,
  ResourceRepository,
} from './repositories';

/** Conjunto completo de repositórios, todos amarrados ao mesmo executor (db ou transação). */
export interface RepositoryContext {
  persons: PersonRepository;
  localIdentity: LocalIdentityRepository;
  nuclei: NucleusRepository;
  memberships: MembershipRepository;
  resources: ResourceRepository;
  resourceOwnership: ResourceOwnershipRepository;
  categories: CategoryRepository;
  movements: MovementRepository;
  auditLogs: AuditLogRepository;
  creditInvoices: CreditInvoiceRepository;
  financings: FinancingRepository;
}
