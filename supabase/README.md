# Team library setup

Ref Manager connects to one private team library per deployment. Supabase Free covers a team of up to 30 accounts within the project's database and egress quotas. A Free project can pause after inactivity. See [Supabase pricing](https://supabase.com/pricing).

1. Create a dedicated Supabase project for Ref Manager. Apply the SQL in [the shared library migration](migrations/20261127044906_shared_team_library.sql) using the project's SQL Editor, or apply the migration with the Supabase CLI linked to that project.
2. Enable email/password sign-in in Supabase Auth. For an invitation-only setup, disable public signup, create each account under **Authentication → Users**, and use confirmed accounts. Give each member their credentials privately.
3. Add the invited account's user ID to the membership table from the SQL Editor.

   ```sql
   insert into public.ref_team_members (user_id)
   values ('00000000-0000-0000-0000-000000000000');
   ```

   Replace the example UUID with the actual Auth user ID. To revoke access, delete that user's row from `public.ref_team_members`.

4. Set the project coordinates for Vite in `.env.local` locally and in Vercel for the target environment.

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Use the project's **publishable** key. Vite embeds these values in the client build. Rebuild the app after changing them.

5. Open **Library → Team library**, sign in as an invited member, and create a reference. Open the same team library as a second member to check shared access. Edit the same reference from both accounts to confirm the stale edit is rejected. A signed-in account without a membership row should see an access message.

The team view refreshes every 30 seconds while visible, on return to the tab, and after edits. A record's revision prevents silently overwriting another member's work. The member who created a team reference can delete it. Publishing copies bibliographic metadata, including the abstract, collection names, and tags. Personal notes, PDFs, and annotations are outside the shared library.
