# Cloud library setup

The personal library works locally without an account. A dedicated Supabase project enables optional private cloud libraries. People can create their own accounts. Supabase Free limits apply to the project and the organization. See [Supabase pricing](https://supabase.com/pricing).

1. In the new Ref Manager project, enable the Data API and automatic RLS, and leave automatic Data API grants off. The migrations explicitly grant table access and define RLS policies.
2. In **Project Settings → Integrations**, connect `SweetAlpac4/ref-manager` with working directory `.`. If you enable production deployment, use the repository's production branch `master`. The personal cloud library migration is [here](migrations/20261127050315_personal_cloud_library.sql). The earlier team tables and migration history are retained. To set up without GitHub, apply migrations to the dedicated project with the Supabase CLI.
3. Under **Authentication**, enable email/password sign-in and public signup. Set the Auth Site URL and allowed redirect URLs to the deployed Ref Manager origin. If email confirmation is enabled, configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) so confirmation emails can reach people outside the project's Supabase organization.
4. Set these values in `.env.local` for development and in the Ref Manager Vercel project for the environment you are deploying.

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Use the project's **publishable** key. Vite embeds these values in the browser build. Rebuild after changing them.

5. Open **Library → Cloud library** and create an account. Add or copy a local reference to test cloud edits. Sign in to the same account in another browser to verify the reference appears. Sign in to a different account to verify it has a separate library.

Cloud records refresh every 30 seconds while the view is open, when you return to the tab, and after writes. The revision check rejects stale changes. References, collection names, tags, reading status, and the per-reference cloud note are stored per account. Local references can be copied to and from the cloud view. PDFs, annotations, and existing local notes stay on the device and can be transferred in a library backup.
