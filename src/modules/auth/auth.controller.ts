import { Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, handleError } from "../../utils/errors";
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
    if (error instanceof Error && error.message.includes("already registered")) {
      handleError(res, new AppError("Email already exists", 400), "Failed to register user");
      return;
    }
    handleError(res, error, "Failed to register user");
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
    if (error instanceof Error && error.message.includes("Invalid login credentials")) {
      handleError(res, new AppError("Invalid email or password", 401), "Failed to log in");
      return;
    }
    handleError(res, error, "Failed to log in", 401);
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
        user: {
          id: user.id,
          email: user.email,
        },
        profile: {
          firstName: profile.first_name,
          lastName: profile.last_name,
          role: profile.role,
          studentId: profile.student_id,
          profileImageUrl: profile.profile_image_url,
        },
      },
    });
  } catch (error) {
    handleError(res, error, "Failed to retrieve authenticated user");
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

    if (!data.revoked) {
      res.status(503).json({
        success: false,
        message: "Failed to revoke session server-side",
        data,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "User logged out successfully",
      data,
    });
  } catch (error) {
    handleError(res, error, "Failed to log out");
  }
};
