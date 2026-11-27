# Cloud library setup

The personal library works locally without an account. A dedicated Supabase project enables optional private cloud libraries. People can create their own accounts. Supabase Free limits apply to the project and the organization. See [Supabase pricing](https://supabase.com/pricing).

1. In the new Ref Manager project, enable the Data API and automatic RLS, and leave automatic Data API grants off. The migrations explicitly grant table access and define RLS policies.
2. Apply all files in [migrations](migrations/) in order through your Supabase migration workflow. The earlier team migration is retained for schema history. The current app uses the [personal library tables](migrations/20261127050315_personal_cloud_library.sql) and the [private PDF bucket](migrations/20261127091417_private_cloud_pdfs.sql). If you use Git integration, point it at the branch you use to release migrations.
3. Under **Authentication**, enable email/password sign-in and public signup. Set the Auth Site URL and allowed redirect URLs to the deployed Ref Manager origin. If email confirmation is enabled, configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) so confirmation emails can reach people outside the project's Supabase organization.
4. Set these values in `.env.local` for development and in the Ref Manager Vercel project for the environment you are deploying.

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Use the project's **publishable** key. Vite embeds these values in the browser build. Rebuild after changing them.

5. Open **Library → Cloud library** and create an account. Add or copy a local reference to test cloud edits. Sign in to the same account in another browser to verify the reference appears. Sign in to a different account to verify it has a separate library.

Cloud records refresh every 30 seconds while the view is open, when you return to the tab, and after writes. The revision check preserves a draft for review when another device has saved changes. References, collection names, tags, reading status, and the per-reference cloud note are stored per account. Local references can be copied to and from the cloud view.

The private PDF migration creates the `ref-personal-pdfs` bucket and restricts access by account. A cloud reference supports one PDF up to 20 MB. Delete its cloud attachment before deleting the reference. Use a workspace backup to transfer local attachments, annotations, and research notes.

## Test locally

Apply all migrations to a local Supabase stack with email confirmation disabled. Set `SUPABASE_TEST_KEY` to the local publishable key and run `npm run test:cloud` from the repository root. The API defaults to `http://127.0.0.1:54321`. Set `SUPABASE_TEST_URL` if your local API uses a different port. This test checks account isolation, revision handling, and private PDF access.
