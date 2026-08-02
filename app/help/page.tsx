import Link from 'next/link';
import { FileDown, Printer, Smartphone, Sparkles, Target, Upload } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { AppShell } from '@/components/app-shell';
import { Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  {
    icon: Printer,
    title: 'Printing a note',
    steps: [
      'Open a signed note and press PDF at the top right.',
      'It opens in your browser’s PDF viewer. Press the print icon there, or Ctrl+P on Windows, ⌘P on a Mac.',
      'On an iPhone or iPad, tap the share icon and choose Print.',
      'Choose Letter paper and 100% scale. The form is laid out for Letter, so “fit to page” can shrink the signature line.'
    ]
  },
  {
    icon: FileDown,
    title: 'Printing a batch for an audit',
    steps: [
      'Go to Oversight and use the export panel.',
      'Pick a date range and a resident, or the whole house.',
      'You get one merged PDF with every signed note in order — print it in one go.',
      'For a plan review, use Reports and take the quarterly PDF for that person instead.'
    ]
  },
  {
    icon: Sparkles,
    title: 'Writing a note with the assistant',
    steps: [
      'Open a resident’s shift from Today.',
      'Tap what actually happened — the chips, and the outcomes from their service plan.',
      'Press “Write from my entries”. The assistant only describes what you recorded.',
      'Read it. Edit anything that is not right. Then sign — signing locks it permanently.'
    ]
  },
  {
    icon: Target,
    title: 'Setting up a service plan',
    steps: [
      'Residents → pick a person → Service plan.',
      'Start from a template if you like, then rewrite each one in their own words from the ISP.',
      'Add support activities underneath — those become the yes/no questions staff answer each shift.',
      'Progress against the plan then builds automatically as notes are signed.'
    ]
  },
  {
    icon: Upload,
    title: 'Adding residents',
    steps: [
      'One at a time: Residents → Add resident.',
      'A whole roster: Residents → Import. Paste from a spreadsheet or choose a CSV file.',
      'It reads First Name, Last Name, Preferred Name, Room, Group, Date of Birth, Pronouns and Medicaid ID, under about thirty different column headings.',
      'It shows you what it understood before anything is saved. Untick any row you do not want.'
    ]
  },
  {
    icon: Smartphone,
    title: 'Getting it on a phone',
    steps: [
      'Send staff to the download page — it works without an account.',
      'iPhone: open in Safari, tap share, then Add to Home Screen.',
      'Android: install the app file from the same page.',
      'It updates itself whenever the site is updated. No reinstalling.'
    ]
  }
];

export default async function HelpPage() {
  const session = await requireSession();

  return (
    <AppShell session={session}>
      <PageHeader title="Help" subtitle="How to do the things people ask about most" />

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-navy">
              <section.icon className="h-4 w-4 text-brand-teal" />
              {section.title}
            </h2>
            <ol className="space-y-2">
              {section.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm text-brand-navy">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-sand text-xs font-semibold text-brand-slate">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-brand-navy">Something not working?</h2>
        <p className="text-sm text-brand-slate">
          Every note you write is saved as you type, on the device first and then to the server. If
          the connection drops mid-shift, keep going — it syncs when you are back. A note you have
          signed can never be lost or altered.
        </p>
        <Link
          href="/download"
          className="mt-3 inline-block text-sm font-semibold text-brand-teal hover:underline"
        >
          Install it on a phone →
        </Link>
      </Card>
    </AppShell>
  );
}
