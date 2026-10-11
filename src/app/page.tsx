import { siteConfig } from "@/config/site";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-green-50 to-white px-6 py-16 text-center">
      <div className="flex w-full max-w-xl flex-col items-center gap-6">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-700 text-2xl font-bold text-white shadow-sm"
        >
          C
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-green-900 sm:text-5xl">
          {siteConfig.name}
        </h1>
        <p className="text-lg text-green-800/80 sm:text-xl">{siteConfig.tagline}</p>
        <p className="rounded-full bg-green-700 px-5 py-2 text-sm font-semibold tracking-wide text-white uppercase">
          Coming soon
        </p>
      </div>
      <footer className="mt-16 text-sm text-green-900/60">&copy; {siteConfig.name}</footer>
    </main>
  );
}
