import { Check, Copy, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/primitives';

/** QR + links públicos: pantalla TV y vista para jugadores. */
export function ShareModal({ open, onOpenChange, tournamentId, name }: { open: boolean; onOpenChange: (o: boolean) => void; tournamentId: string; name: string }) {
  const origin = window.location.origin;
  const playersUrl = `${origin}/e/${tournamentId}`;
  const tvUrl = `${origin}/eventos/${tournamentId}/live`;
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Compartir torneo" description={name} size="sm">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-3xl border border-line bg-white p-4">
          <QRCodeSVG value={playersUrl} size={196} level="M" fgColor="#111111" bgColor="#FFFFFF" />
        </div>
        <p className="text-center text-[13px] text-muted">
          Los jugadores escanean y ven ranking, partidos y su próximo turno. Sin cuenta.
        </p>
        <div className="flex w-full flex-col gap-2">
          <LinkRow label="Jugadores" url={playersUrl} copied={copied === playersUrl} onCopy={() => copy(playersUrl)} />
          <LinkRow label="Pantalla TV" url={tvUrl} copied={copied === tvUrl} onCopy={() => copy(tvUrl)} />
        </div>
      </div>
    </Modal>
  );
}

function LinkRow({ label, url, copied, onCopy }: { label: string; url: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-canvas p-2 pl-3">
      <div className="min-w-0 flex-1">
        <div className="eyebrow">{label}</div>
        <div className="truncate text-[13px] text-ink">{url.replace(/^https?:\/\//, '')}</div>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onCopy} aria-label="Copiar">
        {copied ? <Check className="h-4 w-4 text-north" /> : <Copy className="h-4 w-4" />}
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => window.open(url, '_blank')} aria-label="Abrir">
        <ExternalLink className="h-4 w-4" />
      </Button>
    </div>
  );
}
