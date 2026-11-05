import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './Icons.tsx'

/** Het (niet-standaard) event waarmee Chrome/Edge/Samsung een eigen installatieknop toestaan. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'ios' | 'android' | 'desktop'

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  // iPadOS doet zich voor als Mac, maar heeft een touchscreen.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Vangt het installatie-event direct bij het laden af, nog voordat React draait. */
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export function InstallButton() {
  const [, rerender] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const l = () => {
      rerender((n) => n + 1)
      if (!deferred && isStandalone()) setInstalled(true)
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  if (installed) return null

  const onClick = async () => {
    if (deferred) {
      const ev = deferred
      await ev.prompt()
      const choice = await ev.userChoice
      if (choice.outcome === 'accepted') {
        deferred = null
        setInstalled(true)
      }
    } else {
      setShowHelp(true)
    }
  }

  return (
    <>
      <button type="button" className="install-btn" onClick={onClick}>
        Installeer app
      </button>
      {/* Via een portal: de topbar (backdrop-filter) zou een fixed-laag anders insluiten. */}
      {showHelp && createPortal(<InstallHelp onClose={() => setShowHelp(false)} />, document.body)}
    </>
  )
}

function InstallHelp({ onClose }: { onClose(): void }) {
  const platform = detectPlatform()
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <h2 id="install-title">Garen &amp; Go installeren</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sluiten">
            <IconClose />
          </button>
        </div>
        {platform === 'ios' && (
          <ol className="steps">
            <li>Open deze pagina in <strong>Safari</strong> (in andere browsers op iPhone werkt het via hetzelfde menu, als dat er is).</li>
            <li>Tik op de <strong>Deel-knop</strong> (vierkantje met pijl omhoog) onderin of bovenin.</li>
            <li>Kies <strong>Zet op beginscherm</strong> en tik op <strong>Voeg toe</strong>.</li>
          </ol>
        )}
        {platform === 'android' && (
          <ol className="steps">
            <li>Open deze pagina in <strong>Chrome</strong> (of Samsung Internet).</li>
            <li>Tik op het menu <strong>⋮</strong> rechtsboven.</li>
            <li>Kies <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong>.</li>
          </ol>
        )}
        {platform === 'desktop' && (
          <ol className="steps">
            <li>Gebruik <strong>Chrome</strong> of <strong>Edge</strong>.</li>
            <li>Klik op het installatie-icoon rechts in de adresbalk, of open het menu en kies <strong>Installeren</strong>.</li>
            <li>In Safari op de Mac: <strong>Archief → Voeg toe aan Dock</strong>.</li>
          </ol>
        )}
        <p className="hint">Daarna start Garen &amp; Go vanaf je beginscherm als gewone app, zonder adresbalk.</p>
      </div>
    </div>
  )
}
