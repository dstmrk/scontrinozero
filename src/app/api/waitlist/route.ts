import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { waitlist } from "@/db/schema";
import { isValidEmail } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email obbligatoria." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email non valida." }, { status: 400 });
    }

    await getDb()
      .insert(waitlist)
      .values({ email: email.toLowerCase().trim() })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Payload JSON non valido." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Errore interno. Riprova più tardi." },
      { status: 500 },
    );
  }
}
