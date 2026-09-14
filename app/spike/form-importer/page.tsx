import { notFound } from 'next/navigation';
import { FormImporterPrototype, type MockForm } from '@/components/spike/form-importer-prototype';
import { platformAiBaaInPlace } from '@/lib/importer/phi-gate';
import { userPreset } from '@/lib/importer/presets';

/**
 * SPIKE — spike/form-importer. Mock data, no database, no model calls.
 * Never served in production; still behind the login middleware locally.
 */

// Illustrative mock of what an import would look like, NOT recorded model
// output. The WV prompts are the state's wording from docs/golden/wv-idd-07.json.
const MOCK_FORMS: MockForm[] = [
  {
    key: 'imported_direct_support_progress_note',
    name: 'Direct Support Progress Note',
    prompts: [
      'Were there any parts of the goal in which the person did especially well or poorly?',
      'Did anything out of the ordinary occur (such as illness, behaviors, etc.)?',
      'Did the person require more support than usual?',
      'How did the person respond to support and services provided?'
    ],
    fieldLabels: ['Name of Person Who Receives Services', 'Provider Agency', 'Month of Service', 'Year of Service', 'Date', 'Time', 'Provider/Staff Initials']
  },
  {
    key: 'imported_mock_daily_note',
    name: 'Daily Shift Note (mock)',
    prompts: ['How did the shift go?', 'Anything the next shift should know?'],
    fieldLabels: ['Resident', 'Date', 'Shift', 'Staff']
  }
];

export default function FormImporterSpikePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const presets = [
    userPreset('Morning routine', '{name} completed morning routine with verbal prompts.', 'mock-org-1'),
    userPreset('Community outing', '{name} participated in a community outing with staff support.', 'mock-org-1')
  ];
  return (
    <FormImporterPrototype
      forms={MOCK_FORMS}
      initialPresets={presets}
      platformAiBaaInPlace={platformAiBaaInPlace(process.env)}
    />
  );
}
