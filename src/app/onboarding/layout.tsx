import Link from "next/link";

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="bg-muted/30 flex min-h-screen flex-col items-center px-4 py-8">
      <Link href="/" className="text-primary mb-6 text-2xl font-bold">
        ScontrinoZero
      </Link>
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
