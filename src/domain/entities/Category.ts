import { CategoryKind } from '../value-objects/enums';

export interface Category {
  readonly id: string;
  readonly nucleusId: string;
  readonly name: string;
  readonly kind: CategoryKind;
  readonly isSystem: boolean;
  readonly createdAt: Date;
}

/** Categorias padrão criadas junto com o núcleo — seção 21. Editáveis depois. */
export const DEFAULT_INCOME_CATEGORIES = ['Salário', 'Benefício', 'Outros recebimentos'] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Moradia',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Educação',
  'Lazer',
  'Compras',
  'Assinaturas',
  'Contas',
  'Financiamentos',
  'Empréstimos',
  'Outros',
] as const;
