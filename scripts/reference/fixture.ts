/**
 * The note used by the Virginia regression bar.
 *
 * Deliberately not minimal: it exercises every branch the two renderers share —
 * an addressed outcome with support and progress levels, a not-addressed one, an
 * UNANSWERED one, activities answered yes / no / not-at-all, a concern flag, an
 * activity comment, an outcome comment, a retired outcome, and an addendum. A
 * fixture that only covered the happy path would let a difference through on the
 * exact states this product exists to get right.
 */
import type {
  FormTemplate,
  Note,
  NoteActivity,
  NoteAddendum,
  NoteOutcome,
  Outcome,
  OutcomeActivity,
  Resident
} from '../../lib/types';

export const resident: Resident = {
  id: 'res-1',
  orgId: 'org-1',
  homeId: 'home-1',
  firstName: 'Jordan',
  lastName: 'Placeholder',
  preferredName: 'JP',
  pronouns: { subject: 'they', object: 'them', possessive: 'their' },
  isDemo: true,
  medicaidId: '100000000002'
};

export const note: Note = {
  id: 'note-1',
  orgId: 'org-1',
  templateId: 'tpl',
  templateVersion: 1,
  residentId: 'res-1',
  homeId: 'home-1',
  shiftId: 'shift-1',
  serviceDate: '2026-06-01',
  authorId: 'author-1',
  status: 'signed',
  structuredData: {},
  narrative:
    'Staff supported JP through the morning routine and JP chose to walk to the park. ' +
    'JP picked the route from two options and set the pace throughout. Lunch was prepared ' +
    'with verbal prompts and JP ate the whole meal. There were no problems or concerns during shift.',
  aiAssisted: false,
  aiMode: null,
  isTrainingExample: false,
  signedAt: '2026-06-01T19:04:00Z',
  signatureName: 'Demo Staff',
  signatureTitle: 'DSP',
  signatureImagePath: null,
  attestationText: 'I attest that the services described above were provided as documented.',
  locked: true,
  similarityPrev: null,
  updatedAt: '2026-06-01T19:04:00Z',
  prestagedAt: null,
  prestageConfirmedAt: null
};

export const addenda: NoteAddendum[] = [
  {
    id: 'add-1',
    noteId: 'note-1',
    body: 'Correction: the walk was to the library, not the park. Route and duration as described.',
    signatureName: 'Demo Staff',
    signatureTitle: 'DSP',
    // Fixed instant: the addendum meta line calls toLocaleString(), so a
    // "now" here would make the two renders differ for reasons that are not
    // the renderer's fault.
    createdAt: '2026-06-02T14:30:00.000Z'
  }
];

export const outcomes: Outcome[] = [
  {
    id: 'out-1',
    residentId: 'res-1',
    title: 'Getting out in the community',
    importantTo: 'Being out where things are happening',
    importantFor: null,
    targetDate: '2026-12-31',
    lens: 'integration',
    statement: 'JP goes somewhere in the community weekly in order to be part of what is happening nearby.',
    supportStrategies: 'Offer two options out loud and in pictures.',
    measure: 'JP makes the choice unprompted once a week for three months.',
    frequency: 'Weekly',
    category: null,
    sortOrder: 0,
    active: true,
    startedOn: '2026-01-01',
    endedOn: null
  },
  {
    id: 'out-2',
    residentId: 'res-1',
    title: 'Cooking my own lunch',
    importantTo: 'Eating what I like',
    importantFor: 'Maintaining a balanced diet',
    targetDate: null,
    lens: 'independence',
    statement: 'JP prepares a midday meal so that JP eats what JP chose.',
    supportStrategies: null,
    measure: null,
    frequency: 'Daily',
    category: null,
    sortOrder: 1,
    active: true,
    startedOn: null,
    endedOn: null
  },
  {
    // No note_outcomes row below — this is the UNANSWERED case, and it must
    // print as unanswered in every template. It is the whole reason the
    // three-state status exists.
    id: 'out-3',
    residentId: 'res-1',
    title: 'Handling my own money',
    importantTo: 'Buying what I want without asking',
    importantFor: null,
    targetDate: null,
    lens: 'independence',
    statement: 'JP makes a purchase weekly in order to buy things without having to ask.',
    supportStrategies: null,
    measure: null,
    frequency: 'Weekly',
    category: null,
    sortOrder: 2,
    active: true,
    startedOn: null,
    endedOn: null
  },
  {
    // Retired mid-quarter. A note signed while it was live must still print the
    // plan it was documented against.
    id: 'out-4',
    residentId: 'res-1',
    title: 'Riding the bus',
    importantTo: 'Getting to the day programme myself',
    importantFor: null,
    targetDate: null,
    lens: 'independence',
    statement: 'JP rides the number 4 bus to the day programme.',
    supportStrategies: null,
    measure: null,
    frequency: 'Weekdays',
    category: null,
    sortOrder: 3,
    active: false,
    startedOn: '2026-01-01',
    endedOn: '2026-05-15'
  }
];

export const noteOutcomes: NoteOutcome[] = [
  {
    outcomeId: 'out-1',
    addressed: true,
    supportLevel: 'verbal_prompt',
    progress: 'progressed',
    comment: 'JP chose the library over the park without being asked twice.'
  },
  { outcomeId: 'out-2', addressed: false, supportLevel: null, progress: null, comment: null },
  // out-3 is absent on purpose — the unanswered case.
  {
    outcomeId: 'out-4',
    addressed: true,
    supportLevel: 'full_support',
    progress: 'maintained',
    comment: null
  }
];

export const activities: OutcomeActivity[] = [
  {
    id: 'act-1',
    outcomeId: 'out-1',
    description: 'JP chooses where to go from two or more options.',
    measureType: 'skill_building',
    measure: 'JP makes the choice unprompted once a week for three months.',
    supportInstructions: 'Offer two options out loud and in pictures. Wait.',
    dailyQuestion: 'Did JP choose where to go?',
    sortOrder: 0,
    active: true
  },
  {
    id: 'act-2',
    outcomeId: 'out-1',
    description: 'JP goes on the outing with staff support.',
    measureType: 'routine',
    measure: 'Weekly.',
    supportInstructions: null,
    // Null daily question, so the renderer falls back to the description.
    dailyQuestion: null,
    sortOrder: 1,
    active: true
  },
  {
    id: 'act-3',
    outcomeId: 'out-2',
    description: 'JP prepares a midday meal.',
    measureType: 'routine',
    measure: 'Daily.',
    supportInstructions: null,
    dailyQuestion: 'Did JP prepare lunch?',
    sortOrder: 0,
    active: true
  },
  {
    id: 'act-4',
    outcomeId: 'out-3',
    description: 'JP pays for an item in a shop.',
    measureType: 'skill_building',
    measure: 'Weekly for two months.',
    supportInstructions: null,
    dailyQuestion: 'Did JP make a purchase today?',
    sortOrder: 0,
    active: true
  }
];

export const noteActivities: NoteActivity[] = [
  {
    activityId: 'act-1',
    completed: true,
    concern: false,
    comment: 'Picked the library straight away.'
  },
  { activityId: 'act-2', completed: false, concern: true, comment: null },
  // act-3 and act-4 unanswered on purpose.
  { activityId: 'act-3', completed: null, concern: false, comment: null }
];

/**
 * The shipped Form #680 template row, verbatim from 0004_seed_680.sql.
 *
 * Carries NONE of the layout keys added by the template system — no
 * identity_rows, no meta_rows, no signature_block, no outcome_page. That is the
 * point: this is what is actually in the production database, and every default
 * in lib/pdf/TemplatePdf.tsx has to reproduce it.
 */
export const virginiaTemplate: FormTemplate = {
  id: '00000000-0000-0000-0000-000000000100',
  key: 'daily_progress_note_680',
  version: 1,
  name: 'Daily Progress Note',
  formNumber: '680',
  jurisdiction: 'US-VA',
  schema: {
    prompts: [
      'Where did {name} choose to go?',
      'What did {name} do while there?',
      'How did {name} choose the activity?',
      'Did {subject} enjoy the activity?',
      'How did staff support {name}?'
    ],
    sections: [],
    narrative: { key: 'narrative', type: 'narrative', label: 'Progress note', min_length: 120 },
    signature: {
      key: 'signature',
      type: 'signature',
      attestation:
        'I attest that the services described above were provided as documented and that this note is a true and accurate record of this shift.'
    }
  },
  renderConfig: {
    page: { size: 'LETTER', margin: 42 },
    header: { title: 'Daily Progress Note' },
    footer: { form_line: 'Daily Progress Notes Form #680' },
    narrative_min_height: 340
  }
};

export const SHIFT_LABEL = '7AM-7PM';
export const ORG_LINE = 'ZZ Demo Agency, LLC';
export const LETTERHEAD = 'Residential Support Program';
export const ADDRESS = '19 Example Road, Richmond, VA 23220';
export const FOOTER_LINE = 'Provider #DEMO-0001';
