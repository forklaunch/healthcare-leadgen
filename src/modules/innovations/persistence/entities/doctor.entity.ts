import { defineComplianceEntity, fp, RetentionDuration } from '@forklaunch/core/persistence';
import type { InferEntity } from '@mikro-orm/core';
import { sqlBaseProperties } from '@uchicago-ideas/core';

/**
 * A doctor participating in the ideas waitlist. All identifying fields are
 * classified as PHI per program policy — the portal treats submitter identity
 * and idea content with the same handling as patient data.
 *
 * emailLookupHash is a salted-hash lookup column so doctors can be found by
 * email without decrypting the encrypted email column (encrypted columns are
 * not queryable).
 */
export const DoctorEntity = defineComplianceEntity({
  name: 'Doctor',
  retention: {
    duration: RetentionDuration.years(7),
    action: 'anonymize'
  },
  properties: {
    ...sqlBaseProperties,
    name: fp.string().compliance('phi'),
    email: fp.string().compliance('phi'),
    emailLookupHash: fp.string().unique().index().compliance('none'),
    department: fp.string().nullable().compliance('phi'),
    organizationId: fp.string().index().compliance('none')
  }
});

export type Doctor = InferEntity<typeof DoctorEntity>;
