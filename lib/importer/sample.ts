import { buildPrintContext } from '@/lib/pdf/print-context';
import type { FormTemplate, Note, PrintContext, Resident } from '@/lib/types';
import { SAMPLE_NARRATIVE } from './editable';

/**
 * A made-up note for showing an agency what its form will look like filled
 * in. Nobody real: "Sam Sample", no Medicaid ID, the house called "Sample
 * House". The agency's own name, provider ID and the reviewer's own name are
 * real, because seeing those in the right boxes is the point of the preview.
 */
export function samplePrint(input: {
  template: FormTemplate;
  orgLine: string;
  providerId: string | null;
  signerName: string;
  signerTitle: string;
  serviceDate: string;
}): { note: Note; resident: Resident; ctx: PrintContext } {
  const note: Note = {
    id: '00000000-0000-0000-0000-000000000000',
    orgId: '',
    templateId: input.template.id,
    templateVersion: input.template.version,
    residentId: '',
    homeId: '',
    shiftId: '',
    serviceDate: input.serviceDate,
    authorId: '',
    status: 'draft',
    structuredData: {},
    narrative: SAMPLE_NARRATIVE,
    aiAssisted: false,
    aiMode: null,
    isTrainingExample: true,
    signedAt: null,
    signatureName: input.signerName,
    signatureTitle: input.signerTitle,
    signatureImagePath: null,
    attestationText: null,
    locked: false,
    similarityPrev: null,
    updatedAt: new Date().toISOString(),
    prestagedAt: null,
    prestageConfirmedAt: null
  };
  const resident: Resident = {
    id: '',
    orgId: '',
    homeId: '',
    firstName: 'Sam',
    lastName: 'Sample',
    preferredName: null,
    pronouns: { subject: 'they', object: 'them', possessive: 'their' },
    isDemo: true,
    medicaidId: null
  };
  const ctx = buildPrintContext({
    note,
    resident,
    shift: { label: 'Day shift', startTime: '07:00:00', endTime: '15:00:00' },
    orgLine: input.orgLine,
    providerId: input.providerId,
    placeOfService: 'Sample House',
    serviceType: input.template.renderConfig.service_type,
    groupSize: 1
  });
  return { note, resident, ctx };
}
