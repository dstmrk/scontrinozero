import { createClient } from "@supabase/supabase-js";

export const E2E_USER = {
  email: "e2e-test@scontrinozero.it",
  password: "E2e_Test_Password1!",
};

export const E2E_BUSINESS = {
  firstName: "Test",
  lastName: "Utente",
  address: "Via Roma",
  streetNumber: "1",
  zipCode: "00100",
  city: "Roma",
  province: "RM",
};

export const E2E_ADE = {
  codiceFiscale: "TSTMCK80A01H501T",
  password: "password123",
  pin: "123456",
};

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required for E2E tests",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestUser(
  email = E2E_USER.email,
  password = E2E_USER.password,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`);
  }

  // Create the profile row that normally gets created during signUp()
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ auth_user_id: data.user.id, email });

  if (profileError) {
    throw new Error(
      `Failed to create test user profile: ${profileError.message}`,
    );
  }

  return data.user.id;
}

export async function deleteTestUser(email = E2E_USER.email): Promise<void> {
  const admin = createAdminClient();

  // List all users to find by email (project is small, no pagination needed)
  const { data: users, error: listError } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) {
    console.warn(`Could not list users for cleanup: ${listError.message}`);
    return;
  }

  const user = users.users.find((u) => u.email === email);
  if (!user) return;

  // Delete profile first (cascades to businesses, ade_credentials, documents, etc.)
  // profiles has no FK to auth.users, so we must clean it up manually
  await admin.from("profiles").delete().eq("auth_user_id", user.id);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.warn(`Could not delete test user (${email}): ${error.message}`);
  }
}
