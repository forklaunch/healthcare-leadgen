import { defineComplianceEntity, fp } from '@forklaunch/core/persistence';
import type { InferEntity } from '@mikro-orm/core';
import { sqlBaseProperties } from '@uchicago-ideas/core';
import { DoctorEntity } from './doctor.entity';

/**
 * A secure access key emailed to a doctor. Only the SHA-256 hash is stored —
 * the plaintext key exists once, in the email. The key authenticates the
 * doctor on the portal ("How it works" tab, NDA acceptance, idea submission)
 * without a password.
 */
export const AccessKeyEntity = defineComplianceEntity({
  name: 'AccessKey',
  properties: {
    ...sqlBaseProperties,
    keyHash: fp.string().unique().index().compliance('none'),
    expiresAt: fp.datetime().compliance('none'),
    lastUsedAt: fp.datetime().nullable().compliance('none'),
    revokedAt: fp.datetime().nullable().compliance('none'),
    doctor: () => fp.manyToOne(DoctorEntity),
    organizationId: fp.string().index().compliance('none')
  }
});

export type AccessKey = InferEntity<typeof AccessKeyEntity>;
