import { useAppState } from '../state/AppState.tsx'
import { IconLocate } from './Icons.tsx'

/**
 * Vraagt pas om locatie nadat de gebruiker hier op klikt, met uitleg waarom.
 * Weigeren blokkeert niets: de app werkt gewoon door zonder afstanden.
 */
export function LocationPrompt() {
  const { locationStatus, requestLocation, locationPromptDismissed, dismissLocationPrompt } = useAppState()

  if (locationStatus === 'granted') return null

  if (locationStatus === 'denied' || locationStatus === 'unavailable') {
    if (locationPromptDismissed) return null
    return (
      <div className="notice notice--quiet" role="status">
        <p>
          {locationStatus === 'denied'
            ? 'Je locatie wordt niet gebruikt. Zoek op plaatsnaam of postcode om winkels in de buurt te vinden.'
            : 'Je locatie kon niet worden bepaald. Zoek op plaatsnaam of postcode om winkels in de buurt te vinden.'}
        </p>
        <button type="button" className="link-btn" onClick={dismissLocationPrompt}>
          Oké
        </button>
      </div>
    )
  }

  if (locationPromptDismissed) {
    return (
      <button type="button" className="locate-inline" onClick={requestLocation} disabled={locationStatus === 'requesting'}>
        <IconLocate width={18} height={18} />
        {locationStatus === 'requesting' ? 'Locatie bepalen…' : 'Toon afstand vanaf mijn locatie'}
      </button>
    )
  }

  return (
    <section className="notice" aria-labelledby="loc-title">
      <div className="notice__icon" aria-hidden>
        <IconLocate />
      </div>
      <div className="notice__body">
        <h2 id="loc-title">Winkels bij jou in de buurt?</h2>
        <p>
          Met je locatie tonen we de afstand tot elke winkel en zetten we de dichtstbijzijnde bovenaan. Je locatie blijft
          op je apparaat en wordt niet opgeslagen of verstuurd.
        </p>
        <div className="notice__actions">
          <button type="button" className="btn btn--primary" onClick={requestLocation} disabled={locationStatus === 'requesting'}>
            {locationStatus === 'requesting' ? 'Locatie bepalen…' : 'Gebruik mijn locatie'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={dismissLocationPrompt}>
            Nee, bedankt
          </button>
        </div>
      </div>
    </section>
  )
}
