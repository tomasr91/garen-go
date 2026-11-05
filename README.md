# Garen & Go

Mobiele webapp om handwerkwinkels in Nederland te ontdekken: wol- en garenwinkels, handwerkwinkels, fourniturenwinkels, borduur- en quiltwinkels, en hobbywinkels met handwerkaanbod.

**Live:** https://tomasr91.github.io/garen-go/

## Functies

- **Winkels**: kaartjes met naam, plaats, afstand, actuele openingsstatus en categorieën. Je kunt sorteren op afstand, plaats of naam, en de lijst laadt verder terwijl je scrolt.
- **Kaart**: Leaflet met OpenStreetMap, gegroepeerde markers (clusters), je eigen locatie, en een winkelkaartje bij het aantikken van een marker.
- **Filters en zoeken**: vijf categorieën, waarvan *Fournituren* standaard uit staat. Zoeken werkt op naam, plaats en postcode. Filters en zoekterm gelden op beide tabbladen.
- **Openingsstatus**: *Nu open*, *Sluit binnenkort* (binnen 30 minuten), *Gesloten* (met wanneer de winkel weer opent) en *Openingstijden onbekend*. Tijden worden berekend in Europe/Amsterdam, inclusief zomer- en wintertijd en tijden over middernacht. De status werkt elke minuut zichzelf bij, zonder herladen.
- **Locatie**: wordt pas gevraagd na een klik en uitleg. Weigeren is prima, de app werkt dan gewoon zonder afstanden. Afstanden zijn hemelsbreed. Je locatie blijft op je apparaat.
- **Winkelbeheer** (`#/beheer`): winkels toevoegen, bewerken, uitschakelen en verwijderen. Je kunt openingstijden per dag invullen, categorieën kiezen en de locatie aanklikken op de kaart. Import en export kan als JSON en CSV.

## Ontwikkelen

```bash
npm install
npm run dev          # lokale ontwikkelserver
npm test             # unit tests (vitest)
npm run build        # productiebuild naar dist/
```

## Architectuur

```
src/
  domain/            Pure logica zonder UI, met tests
    types.ts           Centraal winkelmodel (Shop, OpeningHours, …)
    categories.ts      Categorieën als configuratie (makkelijk uit te breiden)
    openingHours.ts    Statusberekening (Europe/Amsterdam, middernacht, uitzonderingen)
    osmOpeningHours.ts Parser voor de OpenStreetMap-notatie
    geo.ts             Afstand (haversine), formattering, navigatielink
    shopQuery.ts       Filteren, zoeken, sorteren (gedeeld door lijst en kaart)
  data/              Databron
    shopRepository.ts  Basisdata + lokale wijzigingen, export
    importExport.ts    JSON/CSV import en export
    validation.ts      Validatie en dubbele-winkelcontrole
  state/             React-context: winkelstore en gedeelde UI-status
  map/               Leaflet-configuratie en clustering
  components/        Herbruikbare UI (kaartje, status, filters, locatie)
  views/             Tabbladen, winkeldetails, beheer (lazy geladen)
  app/router.ts      Hash-router (werkt op GitHub Pages)
scripts/
  import-osm.ts      Haalt winkels op uit OpenStreetMap → public/data/shops.json
```

## Winkeldata

De centrale databron is **`public/data/shops.json`**. Er staan geen winkelgegevens in de componenten zelf.

### Herkomst en betrouwbaarheid

`public/data/shops.json` wordt opgebouwd uit drie bronnen (`npm run data:import`):

1. **OpenStreetMap** (Overpass API)
   - Winkeltypes `shop=wool|yarn|needlework|patchwork|fabric|haberdashery|sewing|craft`.
   - Daarnaast winkels van een ander type (zoals `shop=hobby` of `shop=gift`) waarvan de naam duidelijk op handwerk wijst: wol, garen, brei, quilt, borduur, handwerk of fournituren. Kledingzaken en kleermakers vallen af.
   - Categorie op naam: een naaiwinkel met "naald" of "steek" in de naam is ook een handwerkwinkel (zoals De Naaldboetiek).
2. **`data/sources/manual.json`**: handmatig gecontroleerde winkels, bijvoorbeeld overgenomen van de eigen website van de winkel. Zo'n winkel vervangt een dubbele OSM-winkel. Coördinaten worden via de [PDOK Locatieserver](https://www.pdok.nl/) bij het adres gezocht. Met `hours_note` geef je een toelichting die bezoekers zien, zoals afwijkende zomertijden.
3. **`data/sources/dealers.json`**: fysieke verkooppunten van garenmerken (`npm run data:dealers`).
   - De **Scheepjes**-winkelzoeker wordt per woonplaats doorzocht. Pure webshops vallen af.
   - **Rico Design** wordt alleen gebruikt om bestaande winkels aan te vullen. Rico's namen bevatten vaak de naam van de eigenaar, dus daaruit voegen we geen nieuwe winkels toe.
   - Een verkooppunt dat al bestaat, krijgt alleen "Verkooppunt <merk>" en eventueel telefoon en website erbij. Nieuwe verkooppunten krijgen `verification: "unverified"`.

Regels bij het importeren:
- Openingstijden worden alleen overgenomen als ze zeker te lezen zijn. Anders toont de app *Openingstijden onbekend*.
- In het veld `notes` staat per winkel wat nog gecontroleerd moet worden. In beheer kun je filteren op *Nog te controleren* en *Zonder openingstijden*.
- ID's zijn stabiel: `osm-node-123`, `src-…` (manual.json), `dlr-…` (verkooppunten) en `man-<uuid>` (toegevoegd in beheer).

Data © OpenStreetMap-bijdragers ([ODbL](https://www.openstreetmap.org/copyright)). De verkooppuntgegevens komen uit de openbare winkelzoekers van de genoemde merken.

4. **`data/sources/website-hours.json`**: openingstijden van de eigen websites van winkels zonder tijden (`npm run data:hours`).
   - Herkend worden schema.org-gegevens en duidelijke Nederlandse tekst direct onder een kopje als "Openingstijden".
   - Zomer- en wintertijden, tegenstrijdige roosters en websites van ketens zonder postcode-match worden overgeslagen.
   - De winkeldetails tonen dat de tijden automatisch zijn overgenomen, met een link naar de bron. Tijden uit OSM, `manual.json` of beheer gaan altijd voor.
   - robots.txt wordt gerespecteerd. Per winkel worden maximaal 3 pagina's bekeken.

Gevonden coördinaten worden terug in `manual.json` en `dealers.json` geschreven, zodat een volgende run niet opnieuw hoeft te geocoderen. Pas je een adres aan? Verwijder dan ook `lat` en `lon`.

### Data bijwerken

Ga naar **Actions → "Winkeldata bijwerken" → Run workflow**. De vinkjes *verkooppunten* en *openingstijden* bepalen of ook de merklijsten en de winkelwebsites opnieuw worden doorzocht (elk ±10 minuten). De workflow commit de nieuwe data en publiceert de site opnieuw.

Lokaal: `npm run data:dealers` (optioneel), daarna `npm run data:import`.

Winkels die in beheer zijn toegevoegd of op *gecontroleerd* staan, worden bij het importeren **nooit overschreven**. Uitgeschakelde OSM-winkels blijven uitgeschakeld.

### Beheer en opslag (eerste versie)

De app draait volledig in de browser, zonder backend. Daarom:

1. Wijzigingen in het beheerscherm worden bewaard in de **localStorage van je browser**. Ze blijven dus staan na herladen, maar gelden alleen voor jouw browser.
2. Om ze voor iedereen te publiceren: kies in beheer **Exporteer shops.json**, vervang `public/data/shops.json` in de repo en push. De site wordt dan automatisch opnieuw gepubliceerd.
3. Lukt het opslaan in de browser niet (opslag vol of geblokkeerd), dan meldt het beheerscherm dat.

> Het beheerscherm heeft geen login. Op de publieke site kan iedereen het openen, maar wijzigingen blijven altijd in diens eigen browser. De gepubliceerde data verandert alleen via de repository.

### Later: persistent beheer met een backend

De rest van de app praat alleen met `src/data/shopRepository.ts` (`fetchBaseDataset` en `ChangesStorage`). Voor gedeeld en beveiligd beheer:

1. Kies een database met API, bijvoorbeeld Supabase, Firebase of een eigen API. Het `Shop`-model in `src/domain/types.ts` past direct op één tabel, met `openingHours` als JSON-kolom.
2. Vervang `fetchBaseDataset` door een API-call, en `LocalChangesStorage` door een implementatie die direct naar de API schrijft.
3. Zet login op `#/beheer` (rollen: beheerder of lezer).
4. Laat `scripts/import-osm.ts` naar de API schrijven in plaats van naar het JSON-bestand.

### CSV-formaat voor import

```
id,name,address,postcode,city,lat,lon,categories,opening_hours,website,phone,assortment,active
,Voorbeeldnaam,Straat 1,1234 AB,Plaats,52.1,5.1,wol|handwerk,Tu-Fr 09:30-17:30; Sa 10:00-17:00,https://…,,Wol|Breinaalden,true
```

`opening_hours` gebruikt de OpenStreetMap-notatie. Een leeg `id` betekent dat er een nieuw ID wordt aangemaakt. Komma of puntkomma als scheidingsteken werken allebei.

## Uitbreiden

- **Nieuwe categorie**: voeg een regel toe aan `CATEGORIES` in `src/domain/categories.ts`.
- **Feestdagen en vakanties**: `OpeningHours.exceptions` wordt al meegenomen in de statusberekening. Wat nog ontbreekt is een invoerscherm in beheer.
- **Foto's, reviews, favorieten**: het model heeft `photos` al als uitbreidingspunt. Favorieten passen in een eigen store naast `AppState`.

## Publicatie

Bij elke push naar `main` draait `.github/workflows/deploy.yml`. Die test en bouwt de app en publiceert hem op GitHub Pages. Kaarttegels komen van `tile.openstreetmap.org`, volgens de [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) en met naamsvermelding.
