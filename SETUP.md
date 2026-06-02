# Setup Guide (read this slowly, do one step at a time)

This guide gets the dashboard talking to a free database called **Supabase**.
Supabase is where we keep the clients, the ad accounts, and all the numbers.
You don't need to be technical. Just follow each step in order.

You will do five things:

1. Make a free Supabase project.
2. Copy three secret values out of Supabase.
3. Paste those values into a file called `.env.local`.
4. Run three blocks of code in Supabase (copy and paste).
5. Make yourself the boss ("admin") user.

---

## Step 1 — Make a free Supabase project

1. Go to **https://supabase.com** and click **Start your project**. Sign in
   (you can use Google or GitHub).
2. Click **New project**.
3. Give it a name like `funnels-dashboard`.
4. Make a **database password** and save it somewhere safe (a notes app is fine).
5. Pick the region closest to you.
6. Click **Create new project**. Wait about a minute while it builds.

---

## Step 2 — Copy three secret values

In your new project, click the **gear icon** (Project Settings) on the left.

**Value 1 — the Project URL**
- Open **Data API** (older menus call it **API**).
- Copy the **Project URL**. It looks like `https://something.supabase.co`.

**Value 2 — the anon key, and Value 3 — the service_role key**
- Open **API Keys**.
- Copy the **anon** key (also called "public"). It is a long string.
- Copy the **service_role** key. It is also long. This one is a SECRET —
  treat it like a password. Never share it.

Keep these three values handy for the next step.

---

## Step 3 — Paste the values into `.env.local`

1. In the project folder, find the file **`.env.local.example`**.
2. Make a copy of it and rename the copy to **`.env.local`** (note the dot at
   the start). This new file is private and is never uploaded.
3. Open `.env.local` and fill in the Supabase lines:

```
NEXT_PUBLIC_SUPABASE_URL=        <- paste your Project URL here
NEXT_PUBLIC_SUPABASE_ANON_KEY=   <- paste the anon key here
SUPABASE_SERVICE_ROLE_KEY=       <- paste the service_role key here
```

4. For `TOKEN_ENCRYPTION_KEY=`, open your computer's Terminal app and run:

```
openssl rand -base64 32
```

   Copy the random text it prints and paste it after `TOKEN_ENCRYPTION_KEY=`.

5. Save the file.

---

## Step 4 — Run the database setup code

Supabase has a built-in code runner. We'll paste three blocks into it.

1. In Supabase, click **SQL Editor** on the left.
2. Click **New query**.

**Block 1 — create the tables**
- Open the file `supabase/migrations/0001_init.sql` in the project.
- Copy ALL of it, paste it into the SQL Editor, and click **Run**.
- You should see "Success". This makes all the tables.

**Block 2 — turn on security**
- Click **New query** again.
- Open `supabase/migrations/0002_rls.sql`, copy all of it, paste, click **Run**.
- This makes sure clients can only ever see their own data.

**Block 3 — add demo data (optional but recommended)**
- Click **New query** again.
- Open `supabase/seed.sql`, copy all of it, paste, click **Run**.
- This adds a few pretend clients and 30 days of pretend numbers so the
  dashboard isn't empty.

**Block 4 — auto-create a profile for every new login (required for logins)**
- Click **New query** again.
- Open `supabase/migrations/0003_profile_trigger.sql`, copy all of it, paste,
  click **Run**.
- This makes sure every new person who signs in automatically gets a profile
  row (so the app knows their role). Without it, brand-new logins would have no
  role and couldn't be checked.

Run them **in this order**: 0001, then 0002, then 0003, then seed.

---

## Step 5 — Make yourself the admin (the boss)

Right now nobody can log in yet (that's the next phase). But you can create
your own login and make it the admin so you're ready.

1. In Supabase, click **Authentication** on the left, then **Users**.
2. Click **Add user** -> **Create new user**.
3. Enter your email and a password. Click **Create user**.
4. Now go back to **SQL Editor**, click **New query**, and run this. Change
   the email to YOUR email first:

```sql
-- Promote a user to admin. Replace the email with yours.
insert into public.profiles (id, role, full_name)
select id, 'admin', 'Site Admin'
from auth.users
where email = 'you@example.com'
on conflict (id) do update set role = 'admin';
```

5. You should see "Success". You are now an admin and will see ALL clients
   when logins are turned on in the next phase.

That's it. The foundation is ready.

---

## How the live numbers update

There is a little **sync robot** that fetches the latest numbers from Meta
(Facebook) and saves them into the database. The dashboard then just reads from
the database, so it loads fast.

**1. Give the robot a password**

The robot's door is locked with a secret so strangers can't trigger it. Make
the secret by running this in Terminal:

```
openssl rand -hex 32
```

Copy what it prints and paste it after `CRON_SECRET=` in `.env.local`. On
Vercel, also add `CRON_SECRET` under **Project Settings -> Environment
Variables** with the same value.

**2. The robot runs on a timer (the "cron")**

The file `vercel.json` tells Vercel to call the robot every 15 minutes
(`*/15 * * * *`). Vercel automatically sends the secret for you, so the timed
runs just work once `CRON_SECRET` is set on Vercel.

> **Plan note:** Vercel's free **Hobby** plan only lets a cron run **once per
> day**. To get the every-15-minutes refresh you need the **Pro** plan. On
> Hobby it will simply run once a day instead — still fine, just less fresh. You
> can always refresh manually (below) any time.

**3. Refresh by hand whenever you want**

Open this URL in your browser (swap in your real secret):

```
https://YOUR-SITE.vercel.app/api/sync?secret=YOUR_CRON_SECRET
```

That pulls the last few days for every account right now. To pull a long
history for one account (used when you first add an account):

```
https://YOUR-SITE.vercel.app/api/sync/backfill?accountId=THE_ACCOUNT_ID&secret=YOUR_CRON_SECRET
```

If you haven't set up Supabase yet, the robot politely says so instead of
crashing.

---

## Good to know

- The dashboard still works **without** Supabase set up — it falls back to the
  built-in demo data. Supabase only becomes required in later phases.
- The three keys live only in `.env.local`, which is private and never uploaded.
- If you ever change the tables in the `.sql` files, re-run them in the SQL
  Editor (they are written to be safe to run again).
