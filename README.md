# CustomerHowFar

Find trusted artisans and businesses near you.

CustomerHowFar is a Nigerian marketplace connecting customers with trusted artisans and local businesses. It is built with Next.js (App Router), TypeScript and Tailwind CSS.

## Requirements

- Node.js (LTS)
- npm
- Git

## Getting started

```bash
git clone https://github.com/dprogrammar/CustomerHowFar.git
cd CustomerHowFar
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000 in your browser.

## Scripts

| Command                | Description                      |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Start the development server     |
| `npm run build`        | Create a production build        |
| `npm run start`        | Run the production build         |
| `npm run lint`         | Lint the code with ESLint        |
| `npm run format`       | Format the code with Prettier    |
| `npm run format:check` | Check formatting without writing |

## Project structure

```
src/
  app/          Routes, layouts and pages (App Router)
  components/   Reusable UI components
  config/       Site-wide configuration (name, tagline, etc.)
  lib/          Utilities and shared logic
  types/        Shared TypeScript types
```
