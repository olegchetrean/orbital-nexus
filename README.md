# Orbital Nexus

Hartă 3D a sateliților în timp real. Rulează integral în browser: descarcă
elementele orbitale publice, propagă ~12.000 de obiecte cu SGP4 și îți spune când
trece următorul deasupra curții tale.

```bash
npm install
npm run dev          # http://localhost:3000
npm run verify:sources   # testează sursele de date și validează propagarea
```

---

## Ce face

**Trei puncte de vedere, aceleași date** — glob 3D, hartă plată sau cerul de
deasupra ta, comutabile din antet. Harta e vederea în stil FlightRadar24: toată
lumea deodată, cu terminatorul zi/noapte calculat din poziția reală a Soarelui.

**Mod Cer** — ridici telefonul și vezi ce trece pe deasupra. Giroscopul și busola
telefonului mișcă imaginea odată cu tine, iar dacă ai un obiect selectat, o săgeată
îți spune încotro să te întorci și cu cât să ridici telefonul, în grade. Ca să ai
un reper că imaginea chiar corespunde cerului, desenăm și cerul real: 2.061 de stele
până la magnitudinea 5,2 și figurile celor 89 de constelații, plus Luna și Soarele.
Dacă Ursa Mare de pe ecran cade peste Ursa Mare de pe cer, atunci și satelitul e
acolo unde arată. Pe desktop, sau când telefonul nu raportează nordul, privirea se
mișcă cu degetul și busola se poate regla manual.

**Glob 3D** — Pământ zi/noapte cu terminator real, atmosferă, ~12.000 de obiecte
propagate continuu, dâre pe direcția de mers, orbita completă a obiectului selectat.

**Urma la sol** — pe unde a trecut și pe unde va trece obiectul, trecutul stins,
viitorul aprins. Pe hartă, traseul e segmentat corect la meridianul 180°.

**Hover și selecție** — treci cu mouse-ul peste orice punct și îi vezi imediat numele,
altitudinea și viteza. Click = zbor cinematic către el, pe arc peste planetă, cu
urmărire pornită automat.

**Fișa obiectului** — ce e (satelit, etaj de rachetă, fragment), cine l-a lansat,
când, de unde, ce secțiune radar are, dacă mai e operațional. Din catalogul SATCAT.

**Mod Observator** — alegi o locație (GPS, coordonate, sau click direct pe glob ori
pe hartă) și vezi ce e deasupra orizontului chiar acum, plus care dintre ele sunt
luminate de Soare și deci observabile cu ochiul liber.

**Predicție de treceri** — pentru următoarele 24 de ore: când răsare, unde ajunge
la maxim, când apune, cât durează și cât de luminos va fi. Apeși o trecere și
ceasul simulării sare acolo.

**Modul Starlink** — clasificare automată pe shell-uri orbitale, derivată din
înclinarea și altitudinea reală a fiecărui satelit.

**Densitate orbitală** — histogramă pe altitudini, cu shell translucid pe glob.

**Sursele de date** — de unde vine fiecare grup, când a fost descărcat, ce stare
are. Plus comutatorul pentru efemeridele publicate de operatori.

**Timp real, nu simulare.** La viteză normală ceasul aplicației *este* ceasul real,
sincronizat la fiecare cadru — nu o acumulare de incremente care rămâne în urmă când
fila trece în fundal. Derularea în timp există (pentru „arată-mi trecerea de diseară"),
dar stă strânsă sub butonul ⏱, iar orice abatere de la timpul real e afișată explicit.

---

## Datele

Sursa principală e **CelesTrak**, care redistribuie catalogul US Space Force.
Pentru Starlink, OneWeb și Iridium aplicația preferă implicit **efemeridele
publicate de operatorii înșiși** — acelea conțin manevrele planificate, pe care
catalogul public le vede abia după ce s-au produs.

Documentația completă, cu verificarea fiecărei surse și limitele de acuratețe:
**[docs/SURSE-DE-DATE.md](docs/SURSE-DE-DATE.md)**.

Două lucruri de reținut:

1. **CelesTrak semnalează „nemodificat" printr-un `403` cu corp text**, nu printr-un
   `304`. Tratat ca eroare, te lasă fără date reale. Vezi `isNotModifiedResponse`
   în `src/lib/sources.ts`.
2. **SGP4 e o extrapolare, nu o măsurătoare.** Eroarea crește cu vechimea
   elementelor orbitale — de la ~1 km la epocă până la peste 10 km după o săptămână
   în orbită joasă. Aplicația afișează vârsta elementelor și eroarea estimată pentru
   fiecare obiect selectat, tocmai ca să nu sugereze o precizie pe care nu o are.

Poziția ISS calculată de aplicație a fost comparată cu un serviciu independent:
abatere la sol **0,00 km**. `npm run verify:sources` repetă verificarea oricând.

---

## Arhitectura

```
src/
  lib/
    sources.ts       registrul surselor + regula 403-înseamnă-nemodificat
    cache.ts         cache IndexedDB (localStorage nu încape catalogul)
    data.ts          descărcare, parsare TLE, deduplicare, SatStore
    passes.ts        predicție de treceri, iluminare solară, magnitudine
    orbitWorker.ts   clientul firului de calcul, cu reciclare de tampoane
    astro.ts         conversii geodezice, direcția Soarelui, unghiuri de vedere
  workers/
    orbit.worker.ts  propagarea SGP4 și calculul trecerilor, în afara firului UI
    satcat.ts        catalogul de metadate: cine, când, de unde, ce fel de obiect
  three/
    engine.ts        ambele proiecții (glob + hartă), interpolare, selecție, cameră
  components/
    panels.tsx       toate panourile de interfață
  App.tsx            starea aplicației și compunerea
```

**De ce un worker.** O propagare completă a catalogului costă ~47 ms (măsurat pe
11.900 de obiecte). Pe firul principal asta înseamnă interfață blocată. Workerul
calculează instantanee complete, le transferă (nu le copiază), iar scena
interpolează între ultimele două — mișcarea e continuă deși propagarea reală se
face de ~15 ori pe secundă.

**De ce camera zboară pe arc.** Limitele de zoom ale OrbitControls sunt măsurate față
de *țintă*, nu față de centrul Pământului. Când ținta devine un satelit, o valoare
gândită pentru glob (1,05 raze) împinge camera la 6.700 km de obiect în fiecare cadru
— de aici rotirea violentă la selecție. În plus, interpolarea liniară între două
poziții trece prin interiorul planetei când obiectele sunt pe fețe opuse. Acum atât
camera, cât și ținta se deplasează pe arc, cu o ridicare la mijlocul drumului
proporțională cu ocolul de făcut.

**Cum se aleg candidații pentru treceri.** Nu are sens să propagăm 12.000 de obiecte
pe 24 de ore. Filtrăm la stațiile spațiale, grupul de obiecte strălucitoare al
CelesTrak și sateliții Starlink încă sub 400 km — cei proaspăt lansați, care
formează „trenurile" vizibile. Un filtru geometric elimină apoi ce nu poate ajunge
niciodată deasupra latitudinii observatorului.

---

## Parametri în URL

```
?sat=25544                      deschide direct un satelit (NORAD ID)
?panel=observer&lat=47&lon=28.8 pornește în modul observator la o locație
?panel=altitude&alt=550         pornește cu banda de altitudine selectată
```

---

## Datorie tehnică asumată

- **TLE → OMM.** Formatul TLE are numărul de catalog limitat la 5 cifre, iar
  catalogul a depășit 100.000 de obiecte. `satellite.js` consumă TLE direct, de
  aceea îl folosim încă; migrarea la OMM JSON e următorul pas.
- **Fără istoric.** CelesTrak servește doar setul curent. „Unde era acum șase luni"
  cere arhivarea zilnică a elementelor, deci un backend.
- **Conjuncții.** SOCRATES e accesibil și verificat, dar încă neintegrat în interfață.
- **Magnitudinea** e estimată dintr-o valoare standard per categorie. Un reflex de
  panou solar o poate schimba cu câteva trepte.

---

## Atribuire

Date orbitale: [CelesTrak](https://celestrak.org), pe baza catalogului US Space
Force. Efemeride suplimentare: operatorii constelațiilor. Politica de utilizare
CelesTrak cere atribuire și interzice redistribuirea în masă.

Stelele și figurile constelațiilor din modul Cer:
[d3-celestial](https://github.com/ofrohn/d3-celestial) (Olaf Frohn, BSD-2-Clause),
cu poziții din catalogul Hipparcos și figuri după convenția IAU. Catalogul local se
regenerează cu `node scripts/build-sky-catalog.mjs`.
