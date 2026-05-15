import { createClient } from '@supabase/supabase-js'

export const SUPABASE_ENABLED = !!(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const supabase = SUPABASE_ENABLED
  ? createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          // Implicit flow: tokens come back in URL hash. No PKCE verifier
          // needed in localStorage, which avoids "OAuth state has expired"
          // on iOS PWA where storage isn't shared across the OAuth redirect.
          flowType: 'implicit',
        },
      }
    )
  : null
