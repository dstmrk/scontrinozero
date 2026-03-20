import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="bg-muted/30 flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <Link
        href="/"
        className="text-primary mb-8 flex items-center gap-2 text-2xl font-bold"
      >
        <Image src="/logo.png" alt="ScontrinoZero" width={20} height={20} />
        ScontrinoZero
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
