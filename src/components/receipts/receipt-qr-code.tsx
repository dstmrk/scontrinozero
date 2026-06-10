"use client";

import QRCode from "react-qr-code";

interface ReceiptQrCodeProps {
  readonly url: string;
}

/**
 * Superficie condivisa per mostrare la ricevuta come QR code, usata sia nella
 * schermata di emissione (dentro un Dialog) sia nel dialog dello storico (come
 * view interna). Il QR ha sfondo bianco forzato così resta leggibile anche in
 * dark mode; l'URL è mostrato in chiaro sotto per verifica a occhio.
 */
export function ReceiptQrCode({ url }: ReceiptQrCodeProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="rounded-xl bg-white p-4">
        <QRCode
          value={url}
          size={200}
          bgColor="#FFFFFF"
          fgColor="#000000"
          level="M"
          style={{ height: "auto", maxWidth: "100%", width: "200px" }}
        />
      </div>
      <p className="text-muted-foreground text-center text-sm">
        Inquadra il QR code per aprire la ricevuta
      </p>
      <p className="text-muted-foreground font-mono text-xs break-all">{url}</p>
    </div>
  );
}
