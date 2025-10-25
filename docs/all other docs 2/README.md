This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## KB Stylish Frontend (Project Notes)

### Quick Start

- Clone the repo and install dependencies:
  - `npm install`
- Copy `.env.example` to `.env.local` and adjust as needed.
- Start the dev server: `npm run dev` (http://localhost:3000)

### Environment Variables

- `.env.example` ships with common frontend variables. Copy to `.env.local`.
- Useful vars:
  - `NEXT_PUBLIC_APP_NAME` – display name in UI.
  - `NEXT_PUBLIC_SITE_URL` – canonical site URL for links.
  - `NEXT_PUBLIC_DEBUG` – toggles verbose client logging in development.

### Scripts

- `npm run dev` – Start Next.js in dev mode (Turbopack enabled).
- `npm run build` – Production build.
- `npm start` – Run the production server after build.
- `npm run lint` – Lint the codebase.
- `npm test` – Run unit tests with Jest and React Testing Library.

### Testing

- Tests are colocated under `src/**/__tests__` and alongside components/pages.
- We mock dynamic imports and layout shells in `jest.setup.js` for deterministic rendering.
- Run a single test file: `npx jest path/to/test --runInBand --verbose`.

### Architecture Notes

- App Router (`src/app/`) with server-centric data fetching and a thin client layer.
- Large lists use virtualization; small lists render via `ProductGrid`.
- State management: Zustand store in `src/lib/store/`.
- Error isolation: `src/app/global-error.tsx` and `src/components/ui/ErrorBoundary.tsx`.

### Navigation

- Internal navigation uses `next/link` across Header, Footer, and dashboards to preserve state and enable prefetching.

### Logging

- `next.config.ts` preserves `console.error` logs in production for critical error visibility while stripping other console calls.

### Performance Tips

- Prefer dynamic imports for heavy components (charts, large tables) in non-test environments.
- Use `next/image` for all remote images (domains configured in `next.config.ts`).

## Database Seeding

KB Stylish includes a comprehensive database seeding script to populate your marketplace with realistic product data.

### Prerequisites

The seeding script requires admin access to your Supabase database. You'll need:

1. **SUPABASE_URL** - Your Supabase project URL
2. **SUPABASE_SERVICE_ROLE_KEY** - Your Supabase service role key (admin access)

### Environment Setup

Add these variables to your `.env.local` file:

```bash
# Database Seeding (Admin Access Required)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

⚠️ **Security Warning**: The service role key has admin access to your database. Never commit this to version control or expose it in client-side code.

### Running the Seed Script

Execute the seeding script from your project root:

```bash
# Run the database seed script
npx ts-node supabase/seed.ts
```

### What Gets Created

The seed script creates a complete marketplace foundation:

- **5 Fashion Brands** (Urban Threads, Elegant Essence, Boho Chic, Athletic Edge, Vintage Revival)
- **5 Product Categories** (Casual, Formal, Ethnic, Streetwear, Activewear)  
- **Product Attributes** (Size, Color, Material)
- **8 Complete Products** with multiple variants each:
  - Premium Cotton T-Shirt
  - Slim Fit Jeans  
  - Business Blazer
  - Floral Maxi Dress
  - Athletic Joggers
  - Vintage Leather Jacket
  - Silk Blouse
  - Cargo Shorts
- **Product Variants** (Size × Color combinations)
- **Inventory Records** with realistic stock levels
- **Product Images** from Unsplash
- **Test Vendor Account** (KB Stylish Store)

### Seed Script Features

- **Smart Duplicate Prevention**: Won't re-seed if products already exist
- **Realistic Data**: Uses @faker-js/faker for authentic product information
- **Complete Relationships**: Creates all necessary foreign key relationships
- **Proper Constraints**: Respects database schema and validation rules
- **Rich Product Data**: Includes descriptions, pricing, inventory, and images
- **Error Handling**: Comprehensive logging and error recovery

### Re-seeding

To re-run the seed script, you'll need to clear existing product data first:

```sql
-- ⚠️ WARNING: This will delete all product data
TRUNCATE TABLE products CASCADE;
```

Then run the seed script again:

```bash
npx ts-node supabase/seed.ts
```
