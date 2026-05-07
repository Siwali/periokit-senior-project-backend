import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  getAuthenticatedUserProfile,
  loginUser,
  logoutUser,
  registerUser,
} from "./auth.service";
import { loginSchema, registerSchema } from "./auth.validation";

const formatValidationErrors = (error: ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const register = async (req: Request, res: Response) => {
  const validation = registerSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formatValidationErrors(validation.error),
    });
    return;
  }

  try {
    const data = await registerUser(validation.data, req.file);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: getErrorMessage(error, "Failed to register user"),
    });
  }
};

export const login = async (req: Request, res: Response) => {
  const validation = loginSchema.safeParse(req.body);

  if (!validation.success) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formatValidationErrors(validation.error),
    });
    return;
  }

  try {
    const data = await loginUser(validation.data);

    res.status(200).json({
      success: true,
      message: "User logged in successfully",
      data,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: getErrorMessage(error, "Failed to log in"),
    });
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    const user = req.auth?.user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Authentication context is missing",
      });
      return;
    }

    const profile = await getAuthenticatedUserProfile(user.id);

    res.status(200).json({
      success: true,
      message: "Authenticated user retrieved successfully",
      data: {
        user,
        profile,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: getErrorMessage(error, "Failed to retrieve authenticated user"),
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const accessToken = req.auth?.accessToken;

    if (!accessToken) {
      res.status(401).json({
        success: false,
        message: "Authentication context is missing",
      });
      return;
    }

    const data = await logoutUser(accessToken);

    res.status(200).json({
      success: true,
      message: "User logged out successfully",
      data,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: getErrorMessage(error, "Failed to log out"),
    });
  }
};
