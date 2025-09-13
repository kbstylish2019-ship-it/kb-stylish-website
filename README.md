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
