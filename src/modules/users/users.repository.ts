import { user_role } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type CreateUserProfileInput = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: user_role;
  studentId?: number | null;
  profileImageUrl?: string | null;
};

export const createUserProfile = async (input: CreateUserProfileInput) => {
  return prisma.public_users.create({
    data: {
      user_id: input.userId,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      role: input.role,
      student_id: input.studentId ?? null,
      profile_image_url: input.profileImageUrl ?? null,
      is_active: true,
    },
  });
};

export const findUserProfileByUserId = async (userId: string) => {
  return prisma.public_users.findUnique({
    where: { user_id: userId },
  });
};

export const requireUserProfileByUserId = async (userId: string) => {
  const profile = await findUserProfileByUserId(userId);

  if (!profile) {
    throw new Error("User profile not found");
  }

  return profile;
};
