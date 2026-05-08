import { Response } from "express";

/**
 * Custom error class for application-specific errors.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle errors by logging them server-side and returning a safe message to the client.
 */
export const handleError = (
  res: Response,
  error: unknown,
  fallbackMessage: string,
  statusCode = 400
) => {
  // Log the real error server-side
  console.error(`[ERROR] ${new Date().toISOString()}:`, error);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  // If it's a known Error but not an AppError, it might still have a message we want to mask
  // or it might be a system error (Prisma, Supabase, etc.)
  return res.status(statusCode).json({
    success: false,
    message: fallbackMessage,
  });
};
