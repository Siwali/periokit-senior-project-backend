import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import path from "path";
import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { supabase } from "../../lib/supabase";
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

const createSupabaseAdminClient = () => {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const getRequiredSupabaseAdminClient = () => {
  const supabaseAdmin = createSupabaseAdminClient();

  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return supabaseAdmin;
};

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
  supabaseAdmin: ReturnType<typeof getRequiredSupabaseAdminClient>,
  userId: string,
  file: ProfileImageUpload
) => {
  const bucketName = getProfileImagesBucketName();
  const filePath = `${userId}/${randomUUID()}${getProfileImageExtension(file)}`;
  const { error } = await supabaseAdmin.storage
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
  supabaseAdmin: ReturnType<typeof getRequiredSupabaseAdminClient>,
  filePath: string
) => {
  const { data, error } = await supabaseAdmin.storage
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
  supabaseAdmin: ReturnType<typeof getRequiredSupabaseAdminClient>,
  profile: T
) => {
  if (!profile.profile_image_url || isUrl(profile.profile_image_url)) {
    return profile;
  }

  const signedUrl = await createProfileImageSignedUrl(
    supabaseAdmin,
    profile.profile_image_url
  );

  return {
    ...profile,
    profile_image_url: signedUrl,
  };
};

const deleteProfileImage = async (
  supabaseAdmin: ReturnType<typeof getRequiredSupabaseAdminClient>,
  bucketName: string,
  filePath: string
) => {
  await supabaseAdmin.storage.from(bucketName).remove([filePath]);
};

const createPublicUserProfile = async (
  input: RegisterInput,
  userId: string,
  profileImagePathOrUrl: string | null
) => {
  const data = await prisma.public_users.create({
    data: {
      user_id: userId,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      role: "dentist",
      student_id: input.studentId ?? null,
      profile_image_url: profileImagePathOrUrl,
      is_active: true,
    },
  });

  const supabaseAdmin = getRequiredSupabaseAdminClient();
  return withSignedProfileImageUrl(supabaseAdmin, data);
};

const getPublicUserProfileByUserId = async (userId: string) => {
  const data = await prisma.public_users.findUnique({
    where: { user_id: userId },
  });

  if (!data) {
    throw new Error("User profile not found");
  }

  const supabaseAdmin = getRequiredSupabaseAdminClient();
  return withSignedProfileImageUrl(supabaseAdmin, data);
};

export const registerUser = async (
  input: RegisterInput,
  profileImage?: ProfileImageUpload
) => {
  const supabaseAdmin = getRequiredSupabaseAdminClient();
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
  const supabaseAdmin = createSupabaseAdminClient();

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
