import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import path from "path";
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
  role: input.role,
  studentId: input.studentId,
  profileImageUrl: input.profileImageUrl,
});

const removeUndefinedValues = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );

const createSupabaseAdminClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

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
  process.env.SUPABASE_PROFILE_IMAGES_BUCKET ?? "profile-images";

const getProfileImageSignedUrlExpiresIn = () =>
  Number(process.env.SUPABASE_PROFILE_IMAGE_SIGNED_URL_EXPIRES_IN ?? 604800);

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
  supabaseAdmin: ReturnType<typeof getRequiredSupabaseAdminClient>,
  input: RegisterInput,
  userId: string,
  profileImagePathOrUrl: string | null
) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      user_id: userId,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      role: input.role,
      student_id: input.studentId ?? null,
      profile_image_url: profileImagePathOrUrl,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return withSignedProfileImageUrl(supabaseAdmin, data);
};

const getPublicUserProfileByUserId = async (
  supabaseAdmin: ReturnType<typeof getRequiredSupabaseAdminClient>,
  userId: string
) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select()
    .eq("user_id", userId)
    .single();

  if (error) {
    throw error;
  }

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
      supabaseAdmin,
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
  const supabaseAdmin = getRequiredSupabaseAdminClient();

  return getPublicUserProfileByUserId(supabaseAdmin, userId);
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

  if (!supabaseAdmin) {
    return {
      revoked: false,
      reason: "SUPABASE_SERVICE_ROLE_KEY is not configured",
    };
  }

  const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, "global");

  if (error) {
    throw error;
  }

  return {
    revoked: true,
  };
};
