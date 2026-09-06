/**
 * One definition of what counts as an acceptable password.
 *
 * Sign-up, invitation redemption and password reset all have to agree. They
 * did not have to before, because two of those three did not exist.
 *
 * Deliberately no complexity rules. Length is the property that resists
 * guessing; character-class requirements mostly produce Password1! and a
 * sticky note on the medication cabinet, which in a group home is a worse
 * outcome than a long lowercase passphrase.
 */
export const MIN_PASSWORD_LENGTH = 10;

/** Returns a message to show the person, or null when the password is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
