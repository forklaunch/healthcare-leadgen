import { array, boolean, email, number, optional, string, uuid } from '@uchicago-ideas/core';

// POST /portal/access-request
export const RequestAccessSchema = {
  name: string,
  email: email,
  department: optional(string)
};

export const RequestAccessResponseSchema = {
  message: string
};

// GET /portal/nda
// NOTE: `text` is a reserved content-type key in response schemas — use ndaText
export const NdaResponseSchema = {
  version: string,
  ndaText: string
};

// POST /portal/nda/accept
export const AcceptNdaResponseSchema = {
  accepted: boolean,
  version: string,
  doctorSignedAt: string,
  orgCountersignedAt: string
};

export const IdeaSummarySchema = {
  id: uuid,
  title: string,
  body: string,
  status: string,
  submittedAt: string
};

// GET /portal/me — profile info unlocked by the emailed secure key
export const DoctorMeResponseSchema = {
  name: string,
  email: string,
  department: optional(string),
  organization: string,
  organizationName: string,
  ndaAccepted: boolean,
  currentNdaVersion: string,
  acceptedNdaVersion: optional(string),
  keyExpiresAt: string,
  ideas: array(IdeaSummarySchema)
};

// POST /portal/ideas
export const SubmitIdeaSchema = {
  title: string,
  body: string
};

// POST /portal/ideas/evaluate — AI evaluation of a draft idea
export const EvaluateIdeaSchema = {
  title: string,
  body: string,
  // one of: studyDesign | commercialization | operationalSpeedup
  focus: optional(string)
};

export const EvaluationDimensionSchema = {
  key: string,
  name: string,
  score: number,
  summary: string,
  actionableFeedback: array(string)
};

export const IdeaEvaluationResponseSchema = {
  summary: string,
  focus: optional(string),
  generatedBy: string,
  dimensions: array(EvaluationDimensionSchema)
};

// POST /portal/ideas/refine — AI revision of a draft to address feedback
export const RefineIdeaSchema = {
  title: string,
  body: string,
  // one of: studyDesign | commercialization | operationalSpeedup
  focus: string,
  feedback: array(string)
};

export const IdeaRefinementResponseSchema = {
  title: string,
  body: string,
  changes: array(string)
};

// GET /portal/storage-inspector — live proof of encryption at rest
export const StorageFieldSchema = {
  column: string,
  classification: string,
  encrypted: boolean,
  stored: string,
  decrypted: optional(string),
  note: optional(string)
};

export const StorageSectionSchema = {
  entity: string,
  table: string,
  rowCount: number,
  fields: array(StorageFieldSchema)
};

export const StorageInspectorResponseSchema = {
  algorithm: string,
  keyDerivation: string,
  storedFormat: string,
  tenant: string,
  sections: array(StorageSectionSchema)
};

// GET /admin/ideas
export const AdminIdeaSchema = {
  id: uuid,
  title: string,
  body: string,
  status: string,
  submittedAt: string,
  organizationId: string,
  organizationName: string,
  doctorName: string,
  doctorEmail: string,
  doctorDepartment: optional(string),
  ndaVersion: optional(string),
  ndaExecutedAt: optional(string)
};

export const AdminIdeasResponseSchema = {
  ideas: array(AdminIdeaSchema)
};
