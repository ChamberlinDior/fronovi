export function formatMoney(value?: number | null, currency = 'XAF') {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('fr-FR');
}

export function compactStatus(value?: string | null) {
  if (!value) return '—';
  return value.replaceAll('_', ' ');
}
