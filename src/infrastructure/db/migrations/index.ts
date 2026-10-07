import { Migration, MigrationProvider } from 'kysely';
import * as m0001 from './0001_core';
import * as m0002 from './0002_resources';
import * as m0003 from './0003_movements';
import * as m0004 from './0004_audit';
import * as m0005 from './0005_responsible_person';
import * as m0006 from './0006_payment_metadata';
import * as m0007 from './0007_credit_invoices';
import * as m0008 from './0008_application_liquidity';
import * as m0009 from './0009_financing_schedules';
import * as m0010 from './0010_card_closing_day';
import * as m0011 from './0011_card_invoice_reference';
import * as m0012 from './0012_loans';

/**
 * Provider em código (não em disco) — funciona igual em dev e em app empacotado (asar),
 * sem depender de leitura de diretório em runtime.
 */
export class InCodeMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '0001_core': m0001,
      '0002_resources': m0002,
      '0003_movements': m0003,
      '0004_audit': m0004,
      '0005_responsible_person': m0005,
      '0006_payment_metadata': m0006,
      '0007_credit_invoices': m0007,
      '0008_application_liquidity': m0008,
      '0009_financing_schedules': m0009,
      '0010_card_closing_day': m0010,
      '0011_card_invoice_reference': m0011,
      '0012_loans': m0012,
    };
  }
}
