import { deleteTestUser } from "./helpers/supabase";

export default async function globalTeardown() {
  await deleteTestUser();
}
