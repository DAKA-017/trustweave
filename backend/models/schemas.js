import { z } from 'zod';

export const OUTCOMES = Object.freeze([
  'normal_review',
  'caution',
  'flagged',
]);

export const CAMPAIGN_CONFIDENCE = Object.freeze(['low', 'medium', 'high']);

const isoDateTime = z.string().datetime({ offset: true });

export const evidenceSchema = z.object({
  kind: z.enum(['pull_request', 'record', 'fingerprint', 'link', 'note']),
  ref: z.string().min(1).max(500),
  note: z.string().max(300).optional(),
});

export const thresholdsSchema = z
  .object({
    caution: z.number().positive().default(0.5),
    flagged: z.number().positive().default(1),
    maxDepth: z.number().int().min(1).max(5).default(3),
    minIndependentSources: z.number().int().min(2).max(5).default(2),
  })
  .default({});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  publicKey: z.string().min(1),
  maintainerIds: z.array(z.string()).default([]),
  trustConfig: z.record(z.string(), z.number().min(0).max(1)).default({}),
  thresholds: thresholdsSchema,
});

export const contributorSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1),
  accountCreatedAt: isoDateTime,
});

export const pullRequestSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  contributorId: z.string().min(1),
  createdAt: isoDateTime,
  contentFingerprint: z.string().min(1),
  contentSample: z.string().max(4000).optional(),
  changedPathsSummary: z.string().min(1),
  size: z.number().int().nonnegative(),
  outcome: z.enum(['open', 'merged', 'closed', 'closed_as_spam']),
});

export const recordCoreSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['vouch', 'denounce', 'revoke']),
  issuerProjectId: z.string().min(1),
  subjectContributorId: z.string().min(1),
  subjectRecordId: z.string().min(1).optional(),
  createdAt: isoDateTime,
  expiresAt: isoDateTime.optional(),
  reasonCode: z.string().min(1).max(120),
  evidence: z.array(evidenceSchema).default([]),
});

export const signedRecordSchema = recordCoreSchema.extend({
  previousRecordHash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
});

export const createRecordBodySchema = recordCoreSchema
  .omit({ id: true, createdAt: true })
  .extend({
    createdAt: isoDateTime.optional(),
    expiresAt: isoDateTime.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'revoke' && !value.subjectRecordId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subjectRecordId'],
        message: 'Revocations must reference subjectRecordId',
      });
    }
  });

export const assessmentQuerySchema = z.object({
  asProject: z.string().min(1),
});

export const recordsQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  tamper: z.enum(['none', 'signature', 'chain']).default('none'),
});

export const simulateBodySchema = z.object({
  seed: z.number().int().min(1).max(2_147_483_647).optional(),
  size: z.number().int().min(20).max(50).optional(),
  campaignSize: z.number().int().min(10).max(15).optional(),
});

export const metricsQuerySchema = z.object({
  multi: z.enum(['0', '1']).default('0'),
});

export const referenceSchema = z.object({
  kind: z.enum([
    'record',
    'pull_request',
    'signal',
    'project',
    'contributor',
    'campaign',
    'policy',
  ]),
  id: z.string().min(1),
  projectId: z.string().optional(),
  note: z.string().max(500).optional(),
});

export const reasonSchema = z.object({
  type: z.string().min(1),
  weight: z.number(),
  message: z.string().min(1),
  references: z.array(referenceSchema).default([]),
});

export const assessmentSchema = z.object({
  evaluatingProjectId: z.string().min(1),
  contributorId: z.string().min(1),
  outcome: z.enum(OUTCOMES),
  reasons: z.array(reasonSchema),
  contributingRecords: z.array(signedRecordSchema),
  signals: z.array(z.any()),
  whatWouldChangeThis: z.string().min(1),
  note: z.string().optional(),
});

export const campaignSignalSchema = z.object({
  type: z.string().min(1),
  weight: z.number(),
  description: z.string().min(1),
  evidence: z.array(referenceSchema).default([]),
});

export const campaignSchema = z.object({
  id: z.string().min(1),
  memberContributorIds: z.array(z.string()),
  affectedProjectIds: z.array(z.string()),
  signalsFired: z.array(campaignSignalSchema),
  window: z.object({ start: isoDateTime, end: isoDateTime }),
  evidence: z.array(referenceSchema),
  confidence: z.object({
    label: z.enum(CAMPAIGN_CONFIDENCE),
    reasons: z.array(z.string()),
  }),
});
