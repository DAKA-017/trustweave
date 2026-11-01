export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message) {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function badRequest(message, details) {
  return new ApiError(400, 'BAD_REQUEST', message, details);
}

export function forbidden(message, details) {
  return new ApiError(403, 'READ_ONLY_WORLD', message, details);
}
