import type { ReactNode } from 'react';

export type SplashVariant = 'startup' | 'editor' | 'waiting' | 'sync';

const copy: Record<SplashVariant, { eyebrow: string; title: string; message: string; glyph: string }> = {
  startup: { eyebrow: 'KORCZAK TECHNOLOGIES', title: 'Nexus', message: 'Preparando seu espaço de trabalho', glyph: 'N' },
  editor: { eyebrow: 'AMBIENTE DE EDIÇÃO', title: 'Abrindo editor', message: 'Organizando páginas e preparando suas ferramentas', glyph: '✳' },
  waiting: { eyebrow: 'SÓ UM INSTANTE', title: 'Estamos preparando tudo', message: 'Esta etapa pode levar alguns segundos', glyph: '···' },
  sync: { eyebrow: 'KORCZAK NEXUS', title: 'Sincronizando', message: 'Mantendo seu trabalho atualizado', glyph: '↗' },
};

export function SplashScreen({ variant = 'waiting', message, compact = false, children }: {
  variant?: SplashVariant;
  message?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const item = copy[variant];
  return (
    <main className={`nexus-splash ${compact ? 'is-compact' : 'is-full'} splash-${variant}`} role="status" aria-live="polite" aria-label={item.title}>
      <div className="splash-atmosphere" aria-hidden="true">
        <span className="splash-orbit orbit-one" />
        <span className="splash-orbit orbit-two" />
        <span className="splash-orbit orbit-three" />
        <span className="splash-glow glow-one" />
        <span className="splash-glow glow-two" />
      </div>
      <section className="splash-content">
        <div className="splash-mark" aria-hidden="true">
          <span className="splash-mark-core">{item.glyph}</span>
          <span className="splash-mark-ring ring-a" />
          <span className="splash-mark-ring ring-b" />
          <span className="splash-mark-ring ring-c" />
        </div>
        <p className="splash-eyebrow"><span className="splash-live-dot" />{item.eyebrow}</p>
        <h1>{item.title}<span className="splash-title-period">.</span></h1>
        <p className="splash-message">{message || item.message}</p>
        <div className="splash-progress" aria-hidden="true"><span /></div>
        {children}
        <p className="splash-footer">KORCZAK <span>HUB</span> · DOCUMENT WORKSPACE</p>
      </section>
    </main>
  );
}

export default SplashScreen;
