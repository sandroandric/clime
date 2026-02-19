import type { FastifyReply, FastifyRequest } from "fastify";

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function success<T>(data: T) {
  return { ok: true as const, data };
}

export function errorEnvelope(
  request: FastifyRequest,
  code: string,
  message: string,
  details?: Record<string, unknown>
) {
  return {
    ok: false as const,
    error: {
      code,
      message,
      details,
      request_id: String(request.id)
    }
  };
}

export function sendApiError(request: FastifyRequest, reply: FastifyReply, error: ApiError) {
  return reply.status(error.statusCode).send(errorEnvelope(request, error.code, error.message, error.details));
}
