import { defineComplianceEntity, fp } from '@forklaunch/core/persistence';
import type { InferEntity } from '@mikro-orm/core';
import { sqlBaseProperties } from '@uchicago-ideas/core';
import { DoctorEntity } from './doctor.entity';

/**
 * Record of a mutually executed NDA. The doctor signs by click-through
 * (doctorSignedAt) and UChicago Medicine counter-executes automatically
 * (orgCountersignedAt) — both timestamps plus the NDA version and a snapshot
 * of the signer's name form the execution record. Idea submission is gated
 * on an acceptance row existing for the current NDA version.
 */
export const NdaAcceptanceEntity = defineComplianceEntity({
  name: 'NdaAcceptance',
  properties: {
    ...sqlBaseProperties,
    ndaVersion: fp.string().index().compliance('none'),
    doctorSignedAt: fp.datetime().compliance('none'),
    orgCountersignedAt: fp.datetime().compliance('none'),
    signerNameSnapshot: fp.string().compliance('phi'),
    signerIpAddress: fp.string().nullable().compliance('pii'),
    doctor: () => fp.manyToOne(DoctorEntity),
    organizationId: fp.string().index().compliance('none')
  }
});

export type NdaAcceptance = InferEntity<typeof NdaAcceptanceEntity>;
