export interface AuditLog {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly actorPersonId: string | null;
  readonly nucleusId: string | null;
  readonly occurredAt: Date;
  readonly beforeJson: string | null;
  readonly afterJson: string | null;
}
