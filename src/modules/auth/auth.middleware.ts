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
    console.error("Authentication failed", error);

    res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }
};
