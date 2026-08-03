# Surse de date pentru monitorizarea sateliților în timp real

**Verificat: 3 august 2026.** Fiecare afirmație din acest document a fost testată
printr-o cerere HTTP reală de pe această mașină — cod de răspuns, antet CORS,
dimensiune, conținut. Nimic nu e preluat pe încredere din documentație.

Reproducerea verificării:

```bash
npm run verify:sources
```

---

## 0. Concluzia scurtă

Pentru o aplicație care rulează în browser și trebuie să spună adevărul:

| Ce vrei | Sursa | De ce ea |
|---|---|---|
| Poziții pentru tot ce zboară | **CelesTrak GP** | Redistribuie catalogul US Space Force, are CORS, e gratuit |
| Poziții exacte pentru Starlink / OneWeb | **CelesTrak Supplemental GP** | Efemeride publicate de operatorii înșiși, includ manevrele |
| Cine e obiectul, cine l-a lansat, când | **CelesTrak SATCAT** | Catalog complet cu proprietar, dată de lansare, reintrare |
| Riscuri de coliziune | **CelesTrak SOCRATES** | Screening de conjuncții, actualizat zilnic |
| De ce cad orbitele mai repede | **NOAA SWPC** | Indicele Kp: furtuna geomagnetică umflă atmosfera |
| Ce s-a lansat recent (trenurile Starlink) | **Launch Library 2** | Istoricul și programul lansărilor |

Tot ce e mai jos explică de ce **nu** alte surse, și unde te poți păcăli singur.

---

## 1. Lanțul de proveniență — de unde vin, de fapt, datele

Aproape toate aplicațiile de urmărire a sateliților din lume, inclusiv cele
comerciale, se alimentează dintr-un singur izvor:

```
Rețeaua de senzori a US Space Force (radare + telescoape)
        │  observații brute
        ▼
18th/19th Space Defense Squadron — determinare de orbită
        │  catalog GP/TLE
        ▼
Space-Track.org  ──────────────►  CelesTrak (oglindă publică, fără cont)
   (cont obligatoriu)                    │
                                         ▼
                            aplicațiile, inclusiv aceasta
```

**Consecința practică:** dacă două aplicații arată același satelit în locuri
diferite, nu au date diferite — au același TLE, propagat cu implementări sau
la momente diferite. Diferența e în cod, nu în observație.

Singura excepție reală o reprezintă **efemeridele publicate de operatori**
(SpaceX, OneWeb, Iridium, Planet). Acelea vin direct de la cine conduce
satelitul și sunt singurele care conțin manevrele *înainte* să se producă.

---

## 2. Sursele verificate

### 2.1 CelesTrak — GP (General Perturbations)

```
https://celestrak.org/NORAD/elements/gp.php?GROUP=<grup>&FORMAT=tle|json|xml|csv
```

| | |
|---|---|
| Verificat | HTTP 200, `access-control-allow-origin: *` |
| Cadență | actualizare la fiecare 2 ore |
| Cost | gratuit, fără cont |
| Licență | CelesTrak Data Use Policy — atribuire obligatorie |
| Formate | TLE, JSON (OMM), XML, KVN, CSV |

**Capcana care strica această aplicație.** CelesTrak nu răspunde `304 Not Modified`
când clientul are deja versiunea curentă. Răspunde **`403` cu un corp text**:

```
GP data has not updated since your last successful
download of GROUP=starlink at 2026-08-03 10:19:15 UTC.
Data is updated once every 2 hours.
```

Un client care verifică doar `res.ok` interpretează asta drept eroare de rețea.
Aplicația avea în plus un `Promise.all` peste zece grupuri: un singur 403 respingea
întreaga promisiune și catalogul de 11.894 de obiecte era înlocuit cu 238 de TLE-uri
înghețate în cod — fără ca interfața să spună clar că nu mai e vorba de timp real.

Tratamentul corect: `403` + acel text = **confirmare că versiunea din cache e cea
curentă**. Vezi `src/lib/sources.ts` (`isNotModifiedResponse`) și
`src/lib/data.ts` (`fetchGroup`).

**Recomandare de format:** folosește `FORMAT=json` (OMM, standardul CCSDS 502.0-B-3)
pentru orice cod nou. TLE-ul are numărul de catalog limitat la 5 cifre, iar catalogul
a depășit deja 100.000 de obiecte; formatul e pe cale de a rămâne fără spațiu.
Această aplicație încă citește TLE pentru că `satellite.js` îl consumă direct —
migrarea la OMM e datoria tehnică asumată, notată în README.

**Politica de utilizare:** nu interoga mai des decât se actualizează datele. Cache-ul
local de 2 ore din `src/lib/cache.ts` există exact pentru asta, nu doar pentru viteză.

**Ce se întâmplă dacă ignori politica.** Nu primești un cod de eroare politicos.
La 3 august 2026, în timpul dezvoltării acestei aplicații, am descărcat integral și
repetat fișierele mari (Supplemental 1,8 MB, SATCAT 6,7 MB, SOCRATES 16,7 MB) pentru
verificări. După câteva zeci de cereri, CelesTrak a încetat pur și simplu să mai
răspundă de la IP-ul nostru — `curl` returna `HTTP 000` după 30 de secunde, iar Node
raporta `UND_ERR_CONNECT_TIMEOUT`. Blocarea e temporară, dar totală.

Două concluzii practice:

1. **Cache-ul nu e o optimizare, e o condiție de funcționare.** Aplicația a continuat
   să meargă normal în tot acest timp, pentru că avea datele în IndexedDB.
2. **Scriptul de verificare cere doar primii 4 KB** din fișierele mari, prin antetul
   `Range`. Verifică disponibilitatea și CORS fără să consume din bugetul sursei.

---

### 2.2 CelesTrak — Supplemental GP (date de la operator)

```
https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=<fisier>&FORMAT=tle
```

Fișiere verificate ca funcționale: `starlink`, `oneweb`, `iridium`, `gps`, `planet`.

| | |
|---|---|
| Verificat | HTTP 200, CORS `*`, 1,81 MB pentru Starlink = **10.769 obiecte** |
| Sursa reală | SpaceX, Eutelsat OneWeb, Iridium — nu catalogul militar |
| Cadență | de la o dată pe zi până la de patru ori pe zi |

**De ce contează.** Un satelit Starlink își corectează orbita frecvent. Catalogul
public „află" despre manevră abia la următoarea observație radar — până atunci
propagarea ta merge pe orbita veche. Efemeridele operatorului conțin manevra
dinainte. Pentru constelațiile care manevrează des, diferența e de ordinul
kilometrilor.

În aplicație: comutatorul *„Preferă efemeridele de la operatori"* din panoul
**Sursele de date**. Când e activ, grupurile echivalente din catalogul public nici
nu se mai descarcă — sunt aceleași obiecte cu date mai vechi.

---

### 2.3 CelesTrak — SATCAT

```
https://celestrak.org/pub/satcat.csv
```

Verificat: HTTP 200, CORS `*`, 6,69 MB. Coloane:

```
OBJECT_NAME, OBJECT_ID, NORAD_CAT_ID, OBJECT_TYPE, OPS_STATUS_CODE, OWNER,
LAUNCH_DATE, LAUNCH_SITE, DECAY_DATE, PERIOD, INCLINATION, APOGEE, PERIGEE,
RCS, DATA_STATUS_CODE, ORBIT_CENTER, ORBIT_TYPE
```

Asta răspunde la întrebările pe care poziția singură nu le acoperă: cine deține
obiectul, când a fost lansat, dacă e satelit activ / etaj de rachetă / fragment,
dacă a reintrat deja în atmosferă și cât de mare e (secțiunea radar).

---

### 2.4 CelesTrak — SOCRATES (conjuncții)

```
https://celestrak.org/SOCRATES/sort-minRange.csv
```

Verificat: HTTP 200, CORS `*`, 16,66 MB. Screening de apropieri periculoase pentru
tot catalogul, ordonat după distanța minimă. Primul rând la momentul verificării:

```
STARLINK-34035  vs  CZ-4C DEB    2026-08-07 23:42:03 UTC
distanță minimă: 0,008 km (8 metri)    probabilitate maximă: 1,0
```

Aceasta e singura sursă publică, gratuită și accesibilă din browser pentru risc de
coliziune. Alternativa autoritară — mesajele CDM oficiale — cere cont Space-Track.

---

### 2.5 NOAA SWPC — vreme spațială

```
https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json
https://services.swpc.noaa.gov/products/alerts.json
https://services.swpc.noaa.gov/json/ovation_aurora_latest.json
```

Verificat: HTTP 200, CORS `*`. Agenție guvernamentală SUA, date în domeniu public.

Relevanța pentru sateliți nu e evidentă, dar e directă: o furtună geomagnetică
încălzește și umflă termosfera, densitatea la 400–500 km crește, frecarea crește,
orbitele joase decad mai repede și predicțiile SGP4 se degradează vizibil mai
repede decât în zilele liniștite. În februarie 2022 SpaceX a pierdut 38 de sateliți
Starlink proaspăt lansați exact din acest motiv.

---

### 2.6 Launch Library 2 — lansări

```
https://ll.thespacedevs.com/2.2.0/launch/upcoming/?search=starlink
```

Verificat: HTTP 200, CORS `*`. Licență CC BY 4.0.

Util pentru o întrebare foarte concretă: *„ce era șirul acela de puncte de aseară?"*
Un „tren" Starlink e vizibil ca șir compact doar în primele zile după lansare, cât
sateliții sunt încă jos și grupați. Data lansării îți spune dacă ce ai văzut e
plauzibil.

---

## 3. Ce am respins și de ce

| Sursă | Verdict | Motiv |
|---|---|---|
| **Space-Track.org** | doar din backend | Cont obligatoriu, fără CORS (verificat: `HTTP 204`, niciun antet CORS). Rămâne sursa de referință pentru CDM și predicții de reintrare, dar nu poate fi apelată din browser. |
| **SatNOGS DB** | necesită proxy | API-ul răspunde `200`, dar **fără antet CORS** (verificat). Date valoroase — confirmă independent dacă un satelit chiar mai emite — însă are nevoie de un intermediar server. |
| **api.spacexdata.com** | mort | `HTTP 525`. API-ul comunitar SpaceX e abandonat de ani. Nu-l folosi, indiferent câte tutoriale îl mai citează. |
| **Aerospace CORDS (reintrări)** | doar consultare manuală | `HTTP 403` la acces automat. Predicțiile lor de reintrare sunt bune, dar se citesc de pe site. |
| **N2YO** | evitat | Funcționează, dar cere cheie API, are limite stricte de apel și e un intermediar peste aceleași date CelesTrak. Un strat în plus fără câștig de acuratețe. |
| **LeoLabs** | inaccesibil ca preț | Radare proprii, acuratețe de ordinul zecilor de metri — cel mai bun lucru de pe piață. Comercial, cu tarifare per satelit urmărit. Relevant doar pentru clienți instituționali. |

---

## 4. Cât de adevărate sunt, de fapt, pozițiile

Aici e partea pe care majoritatea aplicațiilor o ascund.

**SGP4 nu e o măsurătoare, e o extrapolare.** Pornește de la un set de elemente
orbitale valabile la un moment dat (*epoca*) și calculează unde ar trebui să fie
obiectul acum. Eroarea crește cu timpul scurs de la epocă:

| Vechimea elementelor | Eroare tipică în orbită joasă |
|---|---|
| la epocă | ~1 km |
| după 1 zi | 1–3 km |
| după 3 zile | 3–10 km |
| după 7 zile | peste 10 km, uneori mult mai mult |

Orbita joasă e cazul rău, pentru că frecarea atmosferică depinde de activitatea
solară, care nu e previzibilă. La altitudini mari (GNSS, GEO) degradarea e de
câteva ori mai lentă.

De aceea aplicația arată, pentru fiecare obiect selectat, **vârsta elementelor
orbitale și eroarea estimată** (`SatStore.estimatedErrorKm`). O poziție afișată cu
patru zecimale, calculată din date de acum cinci zile, e o precizie falsă.

### 4.1 Validare încrucișată efectuată

Propagarea acestei aplicații a fost comparată cu **wheretheiss.at**, un serviciu
independent, cu implementare SGP4 proprie și TLE-uri obținute separat, pentru
ISS (NORAD 25544), la același timestamp:

| Mărime | Această aplicație | Referință independentă | Diferență |
|---|---|---|---|
| Latitudine | −36,3017° | −36,3017° | — |
| Longitudine | 167,3703° | 167,3703° | — |
| Poziție la sol | | | **0,00 km** |
| Altitudine | 433,88 km | 433,89 km | 0,01 km |
| Viteză | 7,649 km/s | 7,649 km/s | 0,000 km/s |

Concordanța confirmă lanțul complet: descărcare → parsare TLE → propagare SGP4 →
conversie ECI→geodezic. Ce **nu** confirmă este acuratețea față de poziția fizică
reală a stației — ambele implementări pornesc din același TLE și moștenesc aceeași
eroare de model.

---

## 5. Ce ar necesita un backend

Aplicația e complet client-side și funcționează așa. Următoarele lucruri nu se pot
face fără server:

1. **Mesaje de conjuncție (CDM) oficiale** — Space-Track cere autentificare.
2. **Predicții de reintrare (TIP)** — aceeași restricție.
3. **SatNOGS** — lipsește CORS, are nevoie de proxy.
4. **Istoric orbital** — pentru „unde era obiectul acum șase luni" trebuie arhivate
   TLE-urile zilnic; CelesTrak servește doar setul curent.
5. **Redistribuire** — politica CelesTrak interzice redistribuirea în masă a datelor.
   Un proxy propriu care servește catalogul altor aplicații încalcă termenii.

---

## 6. Atribuire

Politica CelesTrak cere menționarea sursei. Textul folosit în aplicație
(`ATTRIBUTION` din `src/lib/sources.ts`):

> Date orbitale: CelesTrak (celestrak.org), pe baza catalogului US Space Force.
> Efemeride suplimentare: operatorii constelațiilor.

---

## 7. Rezumatul verificării HTTP

Executat la 3 august 2026:

| Endpoint | Status | CORS | Dimensiune |
|---|---|---|---|
| CelesTrak GP `stations` | 200 | `*` | 3,5 KB |
| CelesTrak GP `starlink` | 403 | `*` | *(„not updated" — comportament corect)* |
| CelesTrak Supplemental `starlink` | 200 | `*` | 1,81 MB / 10.769 obiecte |
| CelesTrak Supplemental `oneweb` | 200 | `*` | 109 KB |
| CelesTrak Supplemental `iridium` | 200 | `*` | 13 KB |
| CelesTrak SATCAT | 200 | `*` | 6,69 MB |
| CelesTrak SOCRATES | 200 | `*` | 16,66 MB |
| NOAA SWPC Kp | 200 | `*` | 4,5 KB |
| NOAA SWPC alerte | 200 | `*` | 62 KB |
| NOAA SWPC aurora | 200 | `*` | 928 KB |
| Launch Library 2 | 200 | `*` | 12 KB |
| wheretheiss.at | 200 | `*` | 311 B |
| Space-Track (fără cont) | 204 | lipsă | 0 B |
| SatNOGS DB | 200 | **lipsă** | 498 B |
| Aerospace CORDS | 403 | — | — |
| api.spacexdata.com | 525 | — | — |
