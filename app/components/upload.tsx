"use client";

import { useRef, useState, type DragEvent } from "react";
import { importFiles, type ImportResult } from "@/lib/import";

export function UploadPanel({ onLoaded, onCancel }: { onLoaded: (r: ImportResult) => void; onCancel?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(list: FileList | null) {
    const files = list ? [...list] : [];
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      onLoaded(await importFiles(files));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    handle(e.dataTransfer.files);
  };

  return (
    <section className="mx-auto mt-8 max-w-3xl">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors sm:p-12 ${
          over ? "border-accent bg-surface-2" : "border-line bg-card"
        }`}
      >
        <p className="text-lg font-semibold text-ink">{busy ? "Lendo os arquivos…" : "Solte aqui o my_spotify_data.zip"}</p>
        <p className="mt-1 text-sm text-ink-2">ou os arquivos Streaming_History_Audio_*.json que vêm dentro dele</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="mt-5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          Escolher arquivos
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          multiple
          hidden
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = "";
          }}
        />
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        <p className="mt-6 text-xs text-muted">
          Os cálculos rodam no seu navegador. Os arquivos não são enviados para lugar nenhum.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-card p-5 text-sm text-ink-2">
        <h2 className="font-semibold text-ink">Ainda não tem o arquivo?</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            Entre em{" "}
            <a className="text-ink underline" href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer">
              spotify.com/account/privacy
            </a>
            , marque <strong className="text-ink">Histórico de streaming estendido</strong> e peça os dados.
          </li>
          <li>Confirme pelo e-mail. O Spotify diz que pode levar até 30 dias, mas costuma chegar antes.</li>
          <li>Baixe o zip pelo link do e-mail e solte ele aqui, sem precisar extrair.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          O histórico curto (opção &ldquo;Dados da conta&rdquo;, arquivos StreamingHistory_music_*.json) também funciona, mas só cobre o
          último ano e não diz quando você pulou uma música.
        </p>
      </div>

      {onCancel && (
        <p className="mt-4 text-center">
          <button type="button" onClick={onCancel} className="text-sm text-ink-2 underline hover:text-ink">
            Voltar
          </button>
        </p>
      )}
    </section>
  );
}
