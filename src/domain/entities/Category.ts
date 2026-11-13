import { CategoryKind } from '../value-objects/enums';

/** Categorias que o código reconhece pela CHAVE, nunca pelo nome (ADR D-032, D-038). */
export type SystemCategoryKey = 'FUEL' | 'CARD_CHARGES';

export interface Category {
  readonly id: string;
  readonly nucleusId: string;
  readonly name: string;
  readonly kind: CategoryKind;
  readonly isSystem: boolean;
  /** Nula em toda categoria sem regra própria. O usuário pode renomear; a chave não muda. */
  readonly systemKey: SystemCategoryKey | null;
  readonly createdAt: Date;
}

/** Categorias padrão criadas junto com o núcleo — seção 21. Editáveis depois. */
export const DEFAULT_INCOME_CATEGORIES = ['Salário', 'Benefício', 'Outros recebimentos'] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Moradia',
  'Alimentação',
  'Transporte',
  'Combustível',
  'Saúde',
  'Educação',
  'Lazer',
  'Compras',
  'Assinaturas',
  'Contas',
  'Financiamentos',
  'Empréstimos',
  'Juros e encargos',
  'Outros',
] as const;

const SYSTEM_KEY_BY_DEFAULT_NAME: Readonly<Record<string, SystemCategoryKey>> = {
  Combustível: 'FUEL',
  'Juros e encargos': 'CARD_CHARGES',
};

/** Lista padrão de um núcleo novo, já com as chaves de sistema. */
export function buildDefaultCategories(nucleusId: string, createdAt: Date, newId: () => string): Category[] {
  const build = (name: string, kind: CategoryKind): Category => ({
    id: newId(),
    nucleusId,
    name,
    kind,
    isSystem: true,
    systemKey: SYSTEM_KEY_BY_DEFAULT_NAME[name] ?? null,
    createdAt,
  });
  return [
    ...DEFAULT_INCOME_CATEGORIES.map((name) => build(name, 'INCOME')),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => build(name, 'EXPENSE')),
  ];
}
