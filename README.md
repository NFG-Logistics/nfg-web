# NFG Web Dashboard

Production-grade web dashboard for the NFG Trucking Management System.

## Stack

- **Next.js 14** — App Router
- **TypeScript** — Strict mode
- **Tailwind CSS** — Utility-first styling
- **ShadCN UI** — Accessible component library
- **Supabase** — Auth, database, realtime

## Structure

```
nfg-web/
  ├── app/            # Next.js App Router pages & layouts
  ├── components/     # Reusable UI components (ShadCN + custom)
  ├── lib/            # Supabase client, utilities, helpers
  ├── hooks/          # Custom React hooks
  ├── types/          # TypeScript type definitions
  ├── public/         # Static assets
  ├── styles/         # Global styles
  ├── middleware.ts   # Auth middleware
  ├── package.json
  ├── tailwind.config.ts
  └── tsconfig.json
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ohuddpwqnwdvyejwlumo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9odWRkcHdxbndkdnllandsdW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNTUzNzgsImV4cCI6MjA4NjYzMTM3OH0.2EV99tVUBOWvOB_UgyNvBRWxi3a06OPRLnq-nRybk-4
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. First Login

Before logging in, make sure you've:
1. Run `schema.sql` and `rls.sql` in Supabase
2. Created a user in Supabase Auth
3. Added that user to the `users` table with `admin` role

See `../nfg-backend/SETUP.md` for detailed backend setup.
