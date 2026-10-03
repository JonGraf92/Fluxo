/** Retorna o vencimento mínimo da compra conforme o dia mensal de corte do cartão. */
export function firstEligibleInvoiceDueDate(purchaseDate: string, closingDay: number, dueDay: number): string {
  const [yearPart, monthPart, dayPart] = purchaseDate.split('-').map(Number);
  let year = yearPart ?? 0;
  let month = monthPart ?? 1;
  const day = dayPart ?? 1;
  if (day > closingDay) month += 1;
  if (month > 12) { year += Math.floor((month - 1) / 12); month = ((month - 1) % 12) + 1; }
  if (dueDay <= closingDay) { month += 1; if (month > 12) { month = 1; year += 1; } }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
}

export function nextInvoiceDueDate(dueDate: string): string {
  const [yearPart, monthPart, dayPart] = dueDate.split('-').map(Number);
  let year = yearPart ?? 0;
  let month = (monthPart ?? 1) + 1;
  if (month > 12) { month = 1; year += 1; }
  const day = dayPart ?? 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
