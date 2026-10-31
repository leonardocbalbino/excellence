import { PAYROLL_STATUS_LABELS, type PayrollStatus } from '@excellence/shared';
import { Badge } from '@/components/ui/badge';

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  const variant = status === 'closed' ? 'default' : status === 'published' ? 'soft' : 'outline';
  return <Badge variant={variant}>{PAYROLL_STATUS_LABELS[status]}</Badge>;
}
