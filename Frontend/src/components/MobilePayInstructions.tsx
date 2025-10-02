import * as React from "react";

/** Mapa mínimo de códigos → banco (amplíalo si quieres) */
const BANKS: Record<string, string> = {
  "0114": "Bancaribe",
  "0134": "Banesco",
  "0102": "Banco de Venezuela",
  "0105": "Mercantil",
  "0108": "BBVA Provincial",
  "0191": "BNC",
  "0172": "Bancamiga",
  "0175": "Banplus",
};

type Props = {
  bankCode: string;                // "0114"
  idNumber: string;                // "J-504173983" o "J504173983"
  phone: string;                   // "0412-5526681" o "04125526681"
  /** Monto a abonar en VES (centavos) */
  amountCentsVES: number;
  /** (opcional) Monto en USD ya calculado para mostrar */
  amountUSD?: number | null;
  /** (opcional) texto de ayuda encima */
  title?: string;
};

function onlyDigits(s: string) { return (s || "").replace(/\D+/g, ""); }
function stripId(s: string) { return (s || "").replace(/[^VEJGvejg0-9]/g, "").toUpperCase(); }

function formatVES(cents: number) {
  const n = (cents ?? 0) / 100;
  return new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES", minimumFractionDigits: 2 }).format(n);
}
function formatUSD(n?: number | null) {
  if (n == null) return "";
  n = (n ?? 0) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

/** Devuelve 2539.30 (punto decimal, sin separadores) para el “copiar todo” */
function plainAmount(cents: number) {
  const n = (cents ?? 0) / 100;
  return n.toFixed(2); // usa punto
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export default function MobilePayInstructions({
  bankCode,
  idNumber,
  phone,
  amountCentsVES,
  amountUSD,
  title = "Paga a la tienda",
}: Props) {
  const bankName = BANKS[bankCode] || bankCode;
  const idPlain = stripId(idNumber);      // J504173983
  const phonePlain = onlyDigits(phone);   // 04125526681

  const allPayload =
    `${bankCode}\n${idPlain}\n${phonePlain}\n${plainAmount(amountCentsVES)}`;

  return (
    <div className="rounded-2xl card">
      <div className="p-2 pb-2">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-slate-500">
          Asegúrate de pagar correctamente. Las tiendas tienen datos bancarios únicos.
        </p>
      </div>

      <div className="p-2 pt-2">
        {/* Destino / Banco */}
        <Row
          label="Destino"
          value={bankName}
          onCopy={() => copy(bankName)}
        />
        {/* RIF / Cédula */}
        <Row
          label="RIF / Cédula"
          value={idPlain.replace(/^([VEJG])/, "$1-")}
          mono
          onCopy={() => copy(idPlain)}
          helper="Se copia sin guiones para Pago Móvil"
        />
        {/* Teléfono */}
        <Row
          label="Teléfono"
          value={phone.replace(/(\d{4})(\d{3})(\d{4})/, "$1 - $2 - $3")}
          mono
          onCopy={() => copy(phonePlain)}
        />
        {/* Monto */}
        <Row
          label="Monto (1 cuota)"
          value={
            amountUSD != null
              ? `${formatVES(amountCentsVES)} / ${formatUSD(amountUSD)}`
              : `${formatVES(amountCentsVES)}`
          }
          onCopy={() => copy(plainAmount(amountCentsVES))}
          helper="Se copia 12.34 con punto decimal"
        />

        <div className="mt-4 flex items-center gap-2">
          <button
            className="btnx text-white btn-burst cursor-pointer px-4 py-2 rounded-lg"
            onClick={() => copy(allPayload)}
          >
            Copiar datos
          </button>
          <span className="text-xs text-slate-500">
            Copia las 4 líneas en el formato requerido
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  helper,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  helper?: string;
  mono?: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
        {helper && <div className="text-[11px] text-slate-400 mt-0.5">{helper}</div>}
      </div>
      <button
        className="shrink-0 h-9 w-9 grid place-items-center cursor-pointer rounded-lg border hover:bg-slate-50"
        onClick={onCopy}
        title="Copiar"
      >
        {/* simple copy icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" className="opacity-70">
          <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z" fill="currentColor"/>
        </svg>
      </button>
    </div>
  );
}
