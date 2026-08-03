import Link from 'next/link';
import { ChevronRight, DoorClosed, Plus, Upload, UserRound } from 'lucide-react';
import { requireSession, isSupervisor } from '@/lib/auth/session';
import { listGroupings, listResidents } from '@/lib/residents/repo';
import { AppShell } from '@/components/app-shell';
import { RosterControls } from '@/components/residents/roster-controls';
import { AddTrainingResident } from '@/components/residents/add-training-resident';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { displayName, type ResidentSort } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SORTS: ResidentSort[] = ['last_name', 'first_name', 'room', 'recent'];

export default async function ResidentsPage({
  searchParams
}: {
  searchParams: Promise<{
    home?: string;
    q?: string;
    group?: string;
    sort?: string;
    status?: string;
  }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  if (session.homes.length === 0) {
    return (
      <AppShell session={session}>
        <EmptyState
          title="No home assigned yet"
          body="Your account is active but has not been assigned to a house."
        />
      </AppShell>
    );
  }

  const home = session.homes.find((h) => h.id === params.home) ?? session.homes[0];
  const canEdit = isSupervisor(session.profile);

  const sort = SORTS.includes(params.sort as ResidentSort)
    ? (params.sort as ResidentSort)
    : 'last_name';
  const status =
    params.status === 'inactive' || params.status === 'all' ? params.status : 'active';

  const [residents, groupings] = await Promise.all([
    listResidents({ homeId: home.id, search: params.q, grouping: params.group, sort, status }),
    listGroupings(home.id)
  ]);

  const searching = Boolean(params.q || params.group);

  // Whether a practice resident exists anywhere in the org, so the offer to add
  // one back only appears when there genuinely isn't one. Deleting them is
  // allowed, and this is what makes that decision reversible.
  const supabase = await createSupabaseServerClient();
  const { count: trainingCount } = await supabase
    .from('residents')
    .select('id', { count: 'exact', head: true })
    .eq('is_demo', true);

  return (
    <AppShell session={session}>
      <PageHeader
        title="Residents"
        subtitle={`${home.name} · ${residents.length} ${residents.length === 1 ? 'person' : 'people'}`}
        actions={
          canEdit ? (
            <>
              <Button href={`/residents/import?home=${home.id}`} variant="ghost" size="sm">
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <Button href={`/residents/new?home=${home.id}`} size="sm">
                <Plus className="h-4 w-4" />
                Add resident
              </Button>
            </>
          ) : null
        }
      />

      <RosterControls homes={session.homes} groupings={groupings} activeHomeId={home.id} />

      {residents.length === 0 ? (
        searching ? (
          <EmptyState
            title="No residents match"
            body="Try a different name, or clear the filters."
          />
        ) : status === 'inactive' ? (
          <EmptyState title="Nobody discharged" body="Everyone on this roster is current." />
        ) : (
          <EmptyState
            title="No residents yet"
            body={
              canEdit
                ? 'Add residents one at a time, or import a roster from a spreadsheet.'
                : 'Ask a supervisor to add the people living in this house.'
            }
          />
        )
      ) : (
        <ul className="space-y-2">
          {residents.map((r) => {
            const known = displayName(r);
            // Only show the "known as" hint when it actually differs, or every
            // row picks up a redundant parenthetical.
            const showLegal = known.toLowerCase() !== r.firstName.toLowerCase();

            return (
              <li key={r.id}>
                <Card className="p-0">
                  <Link
                    href={canEdit ? `/residents/${r.id}` : `/?home=${home.id}`}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 transition hover:bg-brand-sand/60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-aqua/25 text-sm font-semibold text-brand-navy">
                      {known.charAt(0)}
                      {r.lastName.charAt(0)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-brand-navy">
                          {known} {r.lastName}
                        </span>
                        {r.isDemo ? <Badge tone="info">Training</Badge> : null}
                        {!r.active ? <Badge tone="missing">Discharged</Badge> : null}
                      </span>

                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-brand-slate">
                        {showLegal ? <span>Legal name: {r.firstName}</span> : null}
                        {r.room ? (
                          <span className="inline-flex items-center gap-1">
                            <DoorClosed className="h-3 w-3" />
                            Room {r.room}
                          </span>
                        ) : null}
                        {r.grouping ? <span>{r.grouping}</span> : null}
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" />
                          {r.pronouns.subject}/{r.pronouns.object}
                        </span>
                      </span>
                    </span>

                    {canEdit ? <ChevronRight className="h-4 w-4 shrink-0 text-brand-slate" /> : null}
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (trainingCount ?? 0) === 0 ? (
        <div className="mt-4">
          <AddTrainingResident homeId={home.id} />
        </div>
      ) : null}
    </AppShell>
  );
}
