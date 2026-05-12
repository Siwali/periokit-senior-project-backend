import { randomUUID } from "crypto";
import path from "path";
import { user_role } from "@prisma/client";
import { env } from "../../lib/env";
import { supabase, supabaseAdmin, type SupabaseAdminClient } from "../../lib/supabase";
import {
  createUserProfile,
  requireUserProfileByUserId,
} from "../users/users.repository";
import { LoginInput, RegisterInput } from "./auth.validation";

export type ProfileImageUpload = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

const createUserMetadata = (input: RegisterInput) => ({
  firstName: input.firstName,
  lastName: input.lastName,
  role: "dentist",
  studentId: input.studentId,
  profileImageUrl: input.profileImageUrl,
});

const removeUndefinedValues = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );

const getProfileImagesBucketName = () =>
  env.SUPABASE_PROFILE_IMAGES_BUCKET;

const getProfileImageSignedUrlExpiresIn = () =>
  env.SUPABASE_PROFILE_IMAGE_SIGNED_URL_EXPIRES_IN;

const getProfileImageExtension = (file: ProfileImageUpload) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (extension) {
    return extension;
  }

  const mimeExtensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };

  return mimeExtensions[file.mimetype] ?? "";
};

const uploadProfileImage = async (
  supabaseAdminClient: SupabaseAdminClient,
  userId: string,
  file: ProfileImageUpload
) => {
  const bucketName = getProfileImagesBucketName();
  const filePath = `${userId}/${randomUUID()}${getProfileImageExtension(file)}`;
  const { error } = await supabaseAdminClient.storage
    .from(bucketName)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return {
    bucketName,
    filePath,
  };
};

const createProfileImageSignedUrl = async (
  supabaseAdminClient: SupabaseAdminClient,
  filePath: string
) => {
  const { data, error } = await supabaseAdminClient.storage
    .from(getProfileImagesBucketName())
    .createSignedUrl(filePath, getProfileImageSignedUrlExpiresIn());

  if (error) {
    throw error;
  }

  return data.signedUrl;
};

const isUrl = (value: string) => /^https?:\/\//i.test(value);

const withSignedProfileImageUrl = async <
  T extends { profile_image_url?: string | null }
>(
  supabaseAdminClient: SupabaseAdminClient,
  profile: T
) => {
  if (!profile.profile_image_url || isUrl(profile.profile_image_url)) {
    return profile;
  }

  const signedUrl = await createProfileImageSignedUrl(
    supabaseAdminClient,
    profile.profile_image_url
  );

  return {
    ...profile,
    profile_image_url: signedUrl,
  };
};

const deleteProfileImage = async (
  supabaseAdminClient: SupabaseAdminClient,
  bucketName: string,
  filePath: string
) => {
  await supabaseAdminClient.storage.from(bucketName).remove([filePath]);
};

const createPublicUserProfile = async (
  input: RegisterInput,
  userId: string,
  profileImagePathOrUrl: string | null
) => {
  const data = await createUserProfile({
    userId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    role: user_role.dentist,
    studentId: input.studentId,
    profileImageUrl: profileImagePathOrUrl,
  });

  return withSignedProfileImageUrl(supabaseAdmin, data);
};

const getPublicUserProfileByUserId = async (userId: string) => {
  const data = await requireUserProfileByUserId(userId);
  return withSignedProfileImageUrl(supabaseAdmin, data);
};

export const registerUser = async (
  input: RegisterInput,
  profileImage?: ProfileImageUpload
) => {
  const { email, password } = input;
  const metadata = removeUndefinedValues(createUserMetadata(input));

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
    },
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("Supabase sign up did not return a user");
  }

  let profile;
  let uploadedProfileImage:
    | Awaited<ReturnType<typeof uploadProfileImage>>
    | undefined;

  try {
    if (profileImage) {
      uploadedProfileImage = await uploadProfileImage(
        supabaseAdmin,
        data.user.id,
        profileImage
      );
    }

    const profileImagePathOrUrl =
      uploadedProfileImage?.filePath ?? input.profileImageUrl ?? null;

    if (profileImagePathOrUrl) {
      const updatedMetadata = removeUndefinedValues({
        ...metadata,
        profileImagePath: uploadedProfileImage?.filePath,
        profileImageUrl: input.profileImageUrl,
      });

      await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
        user_metadata: updatedMetadata,
      });
    }

    profile = await createPublicUserProfile(
      input,
      data.user.id,
      profileImagePathOrUrl
    );
  } catch (profileError) {
    if (uploadedProfileImage) {
      await deleteProfileImage(
        supabaseAdmin,
        uploadedProfileImage.bucketName,
        uploadedProfileImage.filePath
      );
    }

    await supabaseAdmin.auth.admin.deleteUser(data.user.id);

    const message =
      profileError instanceof Error
        ? profileError.message
        : "Unknown profile creation error";

    throw new Error(`Profile creation failed: ${message}`);
  }

  return {
    user: data.user,
    session: data.session,
    profile,
  };
};

export const getAuthenticatedUserProfile = async (userId: string) => {
  return getPublicUserProfileByUserId(userId);
};

export const loginUser = async (input: LoginInput) => {
  const { data, error } = await supabase.auth.signInWithPassword(input);

  if (error) {
    throw error;
  }

  return {
    user: data.user,
    session: data.session,
  };
};

export const getUserByAccessToken = async (accessToken: string) => {
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error) {
    throw error;
  }

  return data.user;
};

export const logoutUser = async (accessToken: string) => {
  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, "global");

  if (error) {
    return {
      revoked: false,
      reason: error.message,
    };
  }

  return {
    revoked: true,
  };
};
