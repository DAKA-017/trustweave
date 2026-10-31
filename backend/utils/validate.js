import { z } from 'zod';
import { ApiError } from './errors.js';

export function parseOrThrow(schema, value) {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, 'VALIDATION_ERROR', `Request validation failed: ${summary}`);
  }
  return result.data;
}

export const idSchema = z.string().min(1).max(120);
