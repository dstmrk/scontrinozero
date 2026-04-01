import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-gray-100 p-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-400"
            aria-hidden="true"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">Sei offline</h1>

        <p className="max-w-xs text-gray-500">
          La trasmissione all&apos;Agenzia delle Entrate richiede una
          connessione internet. Riconnettiti per usare ScontrinoZero.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md bg-black px-6 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Riprova
        </Link>
      </div>
    </div>
  );
}
