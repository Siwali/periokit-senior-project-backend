import { NextFunction, Request, Response } from "express";
import { getUserByAccessToken } from "./auth.service";

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authorizationHeader = req.headers.authorization;
  const accessToken = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : null;

  if (!accessToken) {
    res.status(401).json({
      success: false,
      message: "Authorization bearer token is required",
    });
    return;
  }

  try {
    const user = await getUserByAccessToken(accessToken);

    req.auth = {
      accessToken,
      user,
    };

    next();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid authentication token";

    res.status(401).json({
      success: false,
      message,
    });
  }
};
