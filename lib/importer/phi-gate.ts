/**
 * The gate in front of Path 3: photos of notes that were already written.
 *
 * SPIKE — spike/form-importer. Nothing here is wired into a route that stores
 * anything.
 *
 * A written note is patient information, and for a substance-use program it is
 * likely a 42 CFR Part 2 record. Two agreements have to exist before one of
 * those images may be sent to a model, and they belong to two different
 * parties:
 *
 *   a. The CLIENT's BAA with FlipBrief. Signed in the app. The acceptance IS the
 *      signature: signer name, role, the exact BAA version they were shown, and
 *      when. A checkbox saying "the agreements are signed" is not a signature
 *      and is deliberately not a way to satisfy this.
 *
 *   b. FlipBrief's OWN BAA with the AI provider that processes the images. That
 *      is FlipBrief's obligation, not the client's, so nothing a client can
 *      click may set it. It is a server-side config value and it defaults OFF.
 *
 * Path 3 opens only when both are true. Either one false is a refusal, and the
 * refusal says which, so a supervisor who has signed is not told they have not.
 */
import { BAA_DOCUMENT_VERSION } from './baa-draft';

/** What the in-app e-signature records. Mocked in the spike; never written to the DB. */
export type BaaAcceptance = {
  orgId: string;
  signerName: string;
  signerRole: string;
  /** The version of the BAA text the signer was shown. */
  baaVersion: string;
  /** ISO 8601. */
  acceptedAt: string;
};

export type GateRefusal =
  | 'client_baa_missing'
  | 'client_baa_incomplete'
  | 'client_baa_wrong_org'
  | 'client_baa_outdated_version'
  | 'platform_ai_baa_not_in_place';

export type GateResult =
  | { allowed: true; reasons: [] }
  | { allowed: false; reasons: GateRefusal[] };

/**
 * FlipBrief's BAA with the AI provider. Server-side only, default OFF.
 *
 * Only the exact string "true" turns it on, so a typo, an empty value or a
 * missing variable all fail closed. It takes an env object rather than reading
 * process.env directly so it can be tested without mutating the environment,
 * and so there is no client-bundle path to it: this module is never imported
 * by a 'use client' file with a real env.
 */
export const PLATFORM_AI_BAA_ENV = 'FLIPBRIEF_AI_PROVIDER_BAA_IN_PLACE';

export function platformAiBaaInPlace(env: Record<string, string | undefined>): boolean {
  return env[PLATFORM_AI_BAA_ENV] === 'true';
}

/** Validate the client's e-signature for this org, against the current BAA text. */
export function checkClientBaa(
  acceptance: BaaAcceptance | null | undefined,
  orgId: string
): GateRefusal | null {
  if (!acceptance) return 'client_baa_missing';
  const complete =
    acceptance.signerName.trim().length >= 2 &&
    acceptance.signerRole.trim().length >= 2 &&
    !Number.isNaN(Date.parse(acceptance.acceptedAt));
  if (!complete) return 'client_baa_incomplete';
  if (acceptance.orgId !== orgId) return 'client_baa_wrong_org';
  // A signature on an older text is not consent to the current one.
  if (acceptance.baaVersion !== BAA_DOCUMENT_VERSION) return 'client_baa_outdated_version';
  return null;
}

export function path3Gate(input: {
  orgId: string;
  acceptance: BaaAcceptance | null | undefined;
  platformAiBaaInPlace: boolean;
}): GateResult {
  const reasons: GateRefusal[] = [];
  const client = checkClientBaa(input.acceptance, input.orgId);
  if (client) reasons.push(client);
  // Strict boolean check: a truthy non-boolean smuggled in from JSON is not a yes.
  if (input.platformAiBaaInPlace !== true) reasons.push('platform_ai_baa_not_in_place');
  return reasons.length === 0 ? { allowed: true, reasons: [] } : { allowed: false, reasons };
}

export const GATE_REFUSAL_COPY: Record<GateRefusal, string> = {
  client_baa_missing: 'Your organization has not signed the Business Associate Agreement.',
  client_baa_incomplete: 'The BAA signature is missing a name, a role or a date.',
  client_baa_wrong_org: 'That BAA signature belongs to a different organization.',
  client_baa_outdated_version: 'The BAA has changed since it was signed. It needs signing again.',
  platform_ai_baa_not_in_place:
    'FlipBrief has not yet enabled processing of written notes. This is on our side, not yours.'
};
