/// <reference types="web-bluetooth" />

/**
 * Il reference esplicito sopra tira dentro `@types/web-bluetooth`, che augmenta
 * `Navigator` con la property `bluetooth`. Senza, `navigator.bluetooth` non
 * compila (TS2339): l'auto-inclusione di `@types/*` non basta a garantirlo in
 * questo progetto.
 *
 * Dichiarazioni ambient per i due pacchetti `@point-of-sale/*`.
 *
 * Nessuno dei due spedisce tipi (né esiste un pacchetto `@types/...`), quindi
 * senza queste dichiarazioni `noImplicitAny` fa fallire `npm run type-check`.
 * Sono scritte a mano sulla superficie che usiamo davvero — deliberatamente
 * NON `declare module "..."` vuoto, che silenzierebbe l'errore degradando tutto
 * ad `any` e ci farebbe perdere il controllo sui nomi di opzioni e metodi
 * (proprio il punto in cui le due librerie hanno divergiato, cfr.
 * `src/lib/printing/printer-profile.ts`).
 */

declare module "@point-of-sale/receipt-printer-encoder" {
  export interface ReceiptPrinterEncoderOptions {
    /** `esc-pos` | `star-prnt` | `star-line`. Altri valori fanno lanciare. */
    language?: string;
    /** Solo 32, 35, 42, 44 o 48: qualsiasi altro valore fa lanciare. */
    columns?: number;
    /**
     * Nome del mapping codepage. Deve appartenere alla tabella dell'encoder v3:
     * un nome ignoto fa lanciare `Unknown codepage mapping`.
     */
    codepageMapping?: string;
    printerModel?: string;
    feedBeforeCut?: number;
    imageMode?: string;
    autoFlush?: boolean;
    embedded?: boolean;
  }

  export interface TableColumn {
    width: number;
    align?: "left" | "center" | "right";
    marginLeft?: number;
    marginRight?: number;
    verticalAlign?: "top" | "bottom";
  }

  export interface RuleOptions {
    style?: "single" | "double";
    width?: number;
  }

  export interface QrCodeOptions {
    model?: number;
    size?: number;
    errorlevel?: "l" | "m" | "q" | "h";
  }

  export interface BarcodeOptions {
    height?: number;
    width?: number;
    text?: boolean;
  }

  /**
   * Tutti i metodi di composizione ritornano `this`, quindi sono concatenabili;
   * `encode()` chiude la catena e produce i byte.
   */
  export default class ReceiptPrinterEncoder {
    constructor(options?: ReceiptPrinterEncoderOptions);
    initialize(): this;
    codepage(codepage: string): this;
    text(value: string): this;
    line(value: string): this;
    newline(count?: number): this;
    bold(enabled?: boolean): this;
    italic(enabled?: boolean): this;
    underline(enabled?: boolean): this;
    invert(enabled?: boolean): this;
    align(alignment: "left" | "center" | "right"): this;
    width(width: number): this;
    height(height: number): this;
    size(width: number, height?: number): this;
    table(columns: readonly TableColumn[], data: readonly string[][]): this;
    rule(options?: RuleOptions): this;
    box(options: Record<string, unknown>, contents: string): this;
    barcode(value: string, symbology: string, options?: BarcodeOptions): this;
    qrcode(value: string, options?: QrCodeOptions): this;
    pulse(device?: number, on?: number, off?: number): this;
    cut(type?: "full" | "partial"): this;
    raw(data: readonly number[]): this;
    encode(): Uint8Array;
  }
}

declare module "@point-of-sale/webbluetooth-receipt-printer" {
  /**
   * Payload dell'evento `connected`.
   *
   * ⚠️ `language` e `codepageMapping` arrivano dalla tabella profili del
   * trasporto e NON sono sempre validi per l'encoder v3 (es. `default`,
   * `zjiang`, `meow`): vanno normalizzati con `resolvePrinterLanguage` /
   * `resolveCodepageMapping` prima di passarli all'encoder.
   */
  export interface ConnectedPrinterDevice {
    type: "bluetooth";
    name: string;
    id: string;
    language: string;
    codepageMapping: string;
  }

  export type WebBluetoothPrinterEvent = "connected" | "disconnected" | "data";

  export default class WebBluetoothReceiptPrinter {
    constructor();
    /**
     * Apre il chooser Bluetooth del browser. Va invocata da un gesto utente.
     *
     * ⚠️ Non rigetta e non segnala il fallimento: internamente cattura ogni
     * errore in un `console.log` e risolve comunque. L'esito va dedotto
     * dall'evento `connected` (cfr. `src/lib/printing/bluetooth-printer.ts`).
     */
    connect(): Promise<void>;
    /** No-op quando `navigator.bluetooth.getDevices` non è disponibile. */
    reconnect(lastUsedDevice: { id: string }): Promise<void>;
    disconnect(): Promise<void>;
    listen(): Promise<boolean>;
    print(data: Uint8Array | readonly Uint8Array[]): Promise<void>;
    addEventListener(
      event: "connected",
      listener: (device: ConnectedPrinterDevice) => void,
    ): void;
    addEventListener(event: "disconnected", listener: () => void): void;
    addEventListener(event: "data", listener: (data: DataView) => void): void;
  }
}
