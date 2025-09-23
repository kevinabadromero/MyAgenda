import * as React from "react";
import { adminUploadAvatar } from "../lib/apiAdmin";

type Props = {
  open: boolean;
  onClose: () => void;
  onUploaded: (avatarUrl: string) => void; // <<— callback al subir
};

export default function ChangeAvatarModal({ open, onClose, onUploaded }: Props) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function onSave() {
    if (!file) return;
    setBusy(true);
    try {
      const { avatarUrl } = await adminUploadAvatar(file);
      onUploaded(avatarUrl);   // <<— avisamos al padre
      onClose();
    } catch {
      alert("No se pudo subir la imagen");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Cambiar foto de perfil</h3>

        {!preview ? (
          <div className="border border-dashed rounded-xl p-6 text-center">
            <p className="text-sm text-gray-500 mb-3">Selecciona una imagen (JPG/PNG, &lt;3MB)</p>
            <button
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white"
              onClick={() => inputRef.current?.click()}
            >
              Elegir archivo
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <img src={preview} alt="preview" className="h-20 w-20 rounded-full object-cover" />
            <div className="flex flex-col gap-2">
              <button className="px-3 py-1.5 rounded-lg border" onClick={() => inputRef.current?.click()}>Cambiar…</button>
              <button className="px-3 py-1.5 rounded-lg" onClick={() => setFile(null)}>Quitar</button>
              <input ref={inputRef} type="file" accept="image/*" className="hidden"
                     onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button className="px-4 py-2 rounded-lg border" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
                  onClick={onSave} disabled={!file || busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
