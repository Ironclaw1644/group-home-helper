import { requireSupervisor } from '@/lib/auth/session';
import { listInvitations, listStaff } from '@/lib/onboarding/invites';
import { AppShell } from '@/components/app-shell';
import { InvitePanel } from '@/components/onboarding/invite-panel';
import { Badge, Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const session = await requireSupervisor();

  const [staff, invitations] = await Promise.all([listStaff(), listInvitations()]);

  // Expired and revoked links are noise once there are a few; keep the list to
  // what a supervisor might still act on, plus recent history.
  const visibleInvites = invitations.filter(
    (i) => i.usable || new Date(i.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
  );

  return (
    <AppShell session={session}>
      <PageHeader
        title="Staff"
        subtitle={`${staff.length} ${staff.length === 1 ? 'person' : 'people'} with access`}
      />

      <div className="mb-6">
        <InvitePanel
          homes={session.homes}
          invitations={visibleInvites}
          canInviteAdmin={session.profile.role === 'admin'}
        />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-brand-navy">Who has access</h2>
        <ul className="space-y-2">
          {staff.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center gap-2 border-b border-brand-navy/5 pb-2 last:border-0 last:pb-0"
            >
              <span className="text-sm font-medium text-brand-navy">{member.fullName}</span>
              <span className="text-xs text-brand-slate">{member.title}</span>
              <span className="ml-auto flex items-center gap-2">
                {member.id === session.profile.id ? <Badge tone="info">You</Badge> : null}
                <Badge tone={member.active ? 'signed' : 'missing'}>
                  {member.active ? member.role : 'inactive'}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-4 text-xs text-brand-slate">
        A signed note keeps the name and title of whoever signed it, so deactivating someone never
        changes the notes they already wrote.
      </p>
    </AppShell>
  );
}
