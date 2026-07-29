import type { Organization } from '../organizations';

/**
 * The mutual NDA presented to doctors before idea submission. Bump
 * CURRENT_NDA_VERSION whenever the text changes — doctors must re-accept
 * after a version bump before submitting again. The text is templated per
 * tenant organization.
 */
export const CURRENT_NDA_VERSION = '2026-07-v1';

export function buildNdaText(org: Organization): string {
  return `MUTUAL NON-DISCLOSURE AGREEMENT (${CURRENT_NDA_VERSION})

This Mutual Non-Disclosure Agreement (the "Agreement") is entered into
between ${org.legalName} ("${org.displayName}") and
the submitting physician (the "Discloser"), together the "Parties".

1. Purpose. The Parties wish to exchange information regarding clinical and
   operational innovation ideas (the "Ideas Program") and to protect the
   confidentiality of information disclosed by either Party.

2. Confidential Information. "Confidential Information" means all ideas,
   submissions, clinical scenarios, program evaluations, and related
   materials disclosed by either Party, in any form. Submissions are handled
   under ${org.displayName}'s PHI safeguards, including encryption at rest
   and access controls.

3. Mutual Obligations. Each Party shall (a) use the other Party's
   Confidential Information solely for evaluating and administering the
   Ideas Program; (b) not disclose it to any third party without prior
   written consent; and (c) protect it with at least the same care used for
   its own confidential information, and no less than reasonable care.

4. Ownership. Each idea remains the intellectual property of its submitting
   physician. Review of a submission grants ${org.displayName} no license or
   ownership interest except as separately agreed in writing.

5. Term. Obligations under this Agreement survive for five (5) years from
   the date of each disclosure.

6. Execution. The Discloser executes this Agreement electronically by
   clicking "I Accept" while authenticated with their secure access key.
   ${org.displayName} counter-executes automatically upon recording the
   acceptance, and both execution timestamps are retained as the record of
   mutual execution.`;
}
