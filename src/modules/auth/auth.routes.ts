import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { login, logout, me, register } from "./auth.controller";
import { authenticate } from "./auth.middleware";

const router = Router();

const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Profile image must be an image file"));
      return;
    }

    cb(null, true);
  },
});

const uploadProfileImage = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  profileImageUpload.single("profileImage")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    res.status(400).json({
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to upload profile image",
    });
  });
};

router.post("/register", uploadProfileImage, register);
router.post("/login", login);
router.get("/me", authenticate, me);
router.post("/logout", authenticate, logout);

export default router;
