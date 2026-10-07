import { FinancingAssetType, LOAN_FINANCING_TYPE, LoanTerms, loanTermsProblem } from '../../../domain/entities/Financing';
import { DomainError } from '../../../domain/errors/DomainError';

const LOAN_PROBLEM_MESSAGES = {
  LOAN_PRINCIPAL_INVALID: 'Informe o valor emprestado, maior que zero.',
  LOAN_INTEREST_RATE_INVALID: 'Informe a taxa de juros entre 0% e 1000%, com até duas casas decimais.',
  LOAN_INTEREST_PERIOD_INVALID: 'Informe se a taxa de juros é ao mês ou ao ano.',
} as const;

/**
 * Condições de empréstimo coerentes com o tipo do plano (ADR D-036). Falha fechado nos
 * dois sentidos: empréstimo sem condições é recusado, e condições num plano que não é
 * empréstimo também — nunca são descartadas em silêncio.
 */
export function resolveLoanTerms(assetType: FinancingAssetType, loan: LoanTerms | null | undefined): LoanTerms | null {
  if (assetType !== LOAN_FINANCING_TYPE) {
    if (loan !== null && loan !== undefined) {
      throw new DomainError('LOAN_TERMS_NOT_ALLOWED', 'Valor emprestado e taxa de juros só existem em planos do tipo Empréstimo.');
    }
    return null;
  }
  if (loan === null || loan === undefined) {
    throw new DomainError('LOAN_TERMS_REQUIRED', 'Informe o valor emprestado e a taxa de juros do empréstimo.');
  }
  const problem = loanTermsProblem(loan);
  if (problem !== null) throw new DomainError(problem, LOAN_PROBLEM_MESSAGES[problem]);
  return {
    principalAmountCents: loan.principalAmountCents,
    interestRateBps: loan.interestRateBps,
    interestRatePeriod: loan.interestRatePeriod,
  };
}
