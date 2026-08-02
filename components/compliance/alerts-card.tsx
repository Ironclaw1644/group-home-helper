import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronRight, FileWarning, Target } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import type { ComplianceAlert } from '@/lib/compliance/checks';

const ICONS = {
  document_expired: FileWarning,
  document_expiring: FileWarning,
  outcome_stale: Target,
  no_outcomes: Target
} as const;

/**
 * What needs attention, in the order it would bite.
 *
 * Shows a clean state when there is nothing to do. A dashboard that always
 * displays a warning box trains people to stop reading it, which costs more
 * than the box was ever worth.
 */
export function ComplianceAlertsCard({ alerts }: { alerts: ComplianceAlert[] }) {
  if (alerts.length === 0) {
    return (
      <Card className="mb-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-status-signed" />
          <div>
            <p className="text-sm font-semibold text-brand-navy">Nothing needs attention</p>
            <p className="text-xs text-brand-slate">
              Every plan has outcomes, everything is being documented, and no document is close to
              expiring.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const high = alerts.filter((a) => a.severity === 'high').length;

  return (
    <Card className="mb-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-status-draft" />
        <h2 className="text-sm font-semibold text-brand-navy">Needs attention</h2>
        {high > 0 ? <Badge tone="missing">{high} urgent</Badge> : null}
        <span className="text-xs text-brand-slate">
          {alerts.length} {alerts.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <ul className="space-y-1">
        {alerts.slice(0, 12).map((alert, i) => {
          const Icon = ICONS[alert.kind];
          return (
            <li key={`${alert.kind}-${alert.residentId}-${i}`}>
              <Link
                href={alert.href}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-brand-sand/60"
              >
                <Icon
                  className={
                    alert.severity === 'high'
                      ? 'h-4 w-4 shrink-0 text-status-missing'
                      : 'h-4 w-4 shrink-0 text-status-draft'
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-brand-navy">
                    {alert.residentName} — {alert.title}
                  </span>
                  <span className="block text-xs text-brand-slate">{alert.detail}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-brand-slate" />
              </Link>
            </li>
          );
        })}
      </ul>

      {alerts.length > 12 ? (
        <p className="mt-2 text-xs text-brand-slate">and {alerts.length - 12} more</p>
      ) : null}
    </Card>
  );
}
