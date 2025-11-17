import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Shared Supabase client for server-side usage (Bun backend, migrations, scripts, etc.)
// Expects the following environment variables to be set for the Bun process:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (service role key, keep this secret)

const SUPABASE_URL = Bun.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = Bun.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables for Supabase client.',
  );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    // We are on the server – no need to persist sessions or use cookies.
    persistSession: false,
    autoRefreshToken: false,
  },
});

