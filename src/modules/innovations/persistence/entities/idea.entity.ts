import { defineComplianceEntity, fp, RetentionDuration } from '@forklaunch/core/persistence';
import type { InferEntity } from '@mikro-orm/core';
import { sqlBaseProperties } from '@uchicago-ideas/core';
import { IdeaStatusEnum } from '../../domain/enum/idea-status.enum';
import { DoctorEntity } from './doctor.entity';

/**
 * A submitted idea. Title and body are PHI-classified (encrypted at rest):
 * clinical ideas routinely reference patient scenarios, and the program
 * treats all submission content as PHI. Ideas are only accepted after the
 * submitting doctor has executed the mutual NDA.
 */
export const IdeaEntity = defineComplianceEntity({
  name: 'Idea',
  retention: {
    duration: RetentionDuration.years(7),
    action: 'anonymize'
  },
  properties: {
    ...sqlBaseProperties,
    title: fp.string().compliance('phi'),
    body: fp.text().compliance('phi'),
    status: fp.enum(() => IdeaStatusEnum).compliance('none'),
    doctor: () => fp.manyToOne(DoctorEntity),
    organizationId: fp.string().index().compliance('none')
  }
});

export type Idea = InferEntity<typeof IdeaEntity>;
