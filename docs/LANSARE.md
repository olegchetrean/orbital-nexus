# Materiale de lansare — Orbital Nexus

**Produs:** hartă 3D a sateliților în timp real, rulează integral în browser, fără backend.
**Live:** https://www.megapromoting.com/satelit/ — **funcțional, HTTPS, verificat.**
**Link viitor:** https://satelit.megapromoting.com — vhost gata, așteaptă înregistrarea DNS A
la Hostinger. Când propagă, subcalea devine redirecționare 301 și linkurile deja distribuite
continuă să meargă. Până atunci, folosește peste tot adresa cu subcale de mai sus.
X numără orice link ca 23 de caractere, deci totalurile din secțiunea 3 rămân valabile.
**Cod:** https://github.com/olegchetrean/orbital-nexus (MIT, public, verificat)
**Autor:** Oleg Chetrean, MEGA PROMOTING S.R.L., Chișinău

**Regula de bază pentru tot ce urmează:** singurele cifre permise sunt cele din
`README.md` și `docs/SURSE-DE-DATE.md`. 11.894 obiecte, ~47 ms per propagare completă,
0,00 km abatere față de wheretheiss.at, 238 TLE-uri în fallback, 24 h predicție de treceri.
Nimic altceva nu se inventează: nici număr de utilizatori, nici „luni de muncă", nici stele pe GitHub.

**Unghiul central, folosit peste tot:** CelesTrak semnalează „datele nu s-au schimbat"
printr-un `403` cu corp text, nu printr-un `304`. Sub `Promise.all`, un singur `403`
arunca tot catalogul și aplicația cădea tăcut pe 238 de TLE-uri hardcodate, în timp ce
interfața spunea „live". Bug-ul e verificabil în `src/lib/sources.ts` (`isNotModifiedResponse`)
și documentat în `docs/SURSE-DE-DATE.md` §2.1.

---

## 1. Post LinkedIn — română

**Format:** video vertical 9:16, 15 s, cu subtitrări arse (85% se uită fără sunet).
Upload nativ, nu link YouTube.

<details>
<summary>Brief pentru videoul de 15 s (același material merge și pe X și pe Mastodon)</summary>

Fără voce, fără muzică cu drepturi, fără intro. Text ars pe ecran, alb pe fundalul
închis al aplicației. Captură reală de ecran, nu mockup.

| Timp | Ce se vede | Text pe ecran |
|---|---|---|
| 0-3 s | Globul, plin de obiecte, rotindu-se lent | `238 de sateliți.` |
| 3-5 s | Aceeași imagine, apoi se încarcă tot catalogul | `Atât desena aplicația mea.` |
| 5-8 s | Roiul complet, 11.894 de obiecte | `Catalogul real:` / `11.894` |
| 8-11 s | Panoul „Sursele de date", cu vârsta datelor vizibilă | `Un HTTP 403 le ștergea pe toate.` |
| 11-13 s | Comutare glob → hartă plată | `Fără backend. Totul în browser.` |
| 13-15 s | Cadru fix pe interfață, fără logo, fără CTA | `Orbital Nexus` |

Primele 3 secunde decid dacă e văzut. Începe direct pe imagine în mișcare, nu pe text
static. Nu pune URL-ul în video: linkul stă în primul comentariu, iar un URL ars în
imagine îl trimite pe privitor în afara platformei fix când algoritmul măsoară dwell time.

</details>

**Link:** în PRIMUL COMENTARIU, nu în corp (link în corp = reach tăiat ~60%).
**Lungime:** 1.801 caractere (banda long-form 1.500-1.900, justificată de structura narativă
și de pauzele vizuale la fiecare 1-2 fraze).
**Hook:** primele două rânduri = 137 de caractere, exact sub limita mobilă de ~140,
deci cârligul complet („live" fals + 11.894) se vede înainte de „… vezi mai mult".
**Hashtag-uri:** 2, la final.

```
Interfața spunea „live". În spate, aplicația desena 238 de sateliți dintr-o listă înghețată în cod.

Catalogul real are 11.894 de obiecte.

CelesTrak, sursa publică de elemente orbitale, nu răspunde 304 Not Modified când ai deja versiunea curentă. Răspunde 403, cu un corp text care explică în cuvinte că datele nu s-au schimbat.

Codul meu verifica doar `res.ok`. 403 înseamnă eroare, deci arunca. Peste asta stătea un `Promise.all` pe zece grupuri, iar `Promise.all` respinge tot dacă respinge unul singur. Un grup neactualizat în ultimele două ore ștergea catalogul întreg.

Rămânea fallback-ul: 238 de TLE-uri hardcodate. Globul se învârtea la fel de frumos. Niciun mesaj roșu, niciun log. Doar orbite vechi, desenate cu convingere.

Bug-ul nu e partea interesantă. Partea interesantă e că un fallback tăcut e mai rău decât o eroare zgomotoasă. Eroarea o vezi. Fallback-ul te lasă să arăți altora date moarte crezând că e timp real.

Trei corecții, în ordinea asta:

403 plus exact acel text înseamnă „cache-ul tău e la zi", nu eroare.

`Promise.allSettled`, ca un grup căzut să nu-i ia cu el pe ceilalți nouă.

Fiecare obiect selectat își arată acum vârsta elementelor orbitale și eroarea estimată, în kilometri.

A treia contează cel mai mult. SGP4 e o extrapolare, nu o măsurătoare: ~1 km eroare la epocă, peste 10 km după o săptămână în LEO. O poziție cu patru zecimale calculată din date vechi de cinci zile e o minciună spusă politicos.

Se numește Orbital Nexus. Rulează integral în browser, fără backend: 11.894 de obiecte propagate SGP4, catalogul complet în ~47 ms, mutat în Web Worker. Poziția ISS calculată local coincide cu wheretheiss.at la 0,00 km abatere la sol.

Cod deschis, link în primul comentariu.

Câte fallback-uri tăcute aveți în producție chiar acum?

#opensource #webdev
```

**Primul comentariu (îl publici tu, la 30-60 secunde după post):**

```
Live, fără cont și fără instalare: https://www.megapromoting.com/satelit/
Cod și documentația surselor de date: https://github.com/olegchetrean/orbital-nexus

Documentul despre surse (docs/SURSE-DE-DATE.md) are toate verificările HTTP reale, inclusiv sursele pe care le-am respins și de ce.
```

**Ce am evitat deliberat, conform euristicilor 2026:**
- zero emoji decorative, zero „🚀", zero „Sunt încântat să anunț"
- fără liniuțe lungi (em dash / en dash) — cel mai vizibil semn de text generat
- fără vocabular AI: „revoluționar", „soluție completă", „fundamental", „unlock"
- fără CTA de tip engagement bait („Dați like dacă…") — e activ penalizat în 2026
- link scos din corp, mutat în primul comentariu
- închidere cu întrebare specifică pe subiect, nu „Ce părere aveți?"

**Fereastra de publicare:** marți sau miercuri, 7:30-9:00 dimineața, ora publicului
(pentru Moldova/România asta e chiar ora locală; contactele din vest prind postarea
la începutul zilei lor).
**Primele 60-90 de minute decid ~80% din reach:** răspunde la fiecare comentariu în
maxim 90 de minute. Nu edita structural postarea în primele 3 ore (>20% text schimbat
resetează distribuția).

---

## 2. Post LinkedIn — engleză

Nu e traducerea celui de sus. Publicul e alt: developeri internaționali care nu au auzit
de tine și pentru care „Moldova" nu e context, ci detaliu. Am scos orice referință locală
și am dus greutatea pe partea de inginerie.

**Lungime:** 1.836 caractere. Hook pe două rânduri = 109 caractere.
**Publicare:** la minim 24 h distanță de varianta RO. Două postări în aceeași zi
declanșează semnalul de canibalizare (360Brew depriorizează conturile care postează 2+/zi).

```
My app said "live". It was drawing 238 satellites from a hardcoded array.

The real catalog is 11,894 objects.

CelesTrak, the public mirror of the US Space Force catalog, does not answer 304 Not Modified when your copy is already current. It answers 403, with a plain-text body explaining that the data has not updated since your last download.

My fetch checked `res.ok`. 403 is not ok, so it threw. Ten group fetches sat inside a `Promise.all`, which rejects the whole set on a single rejection. One group that had not refreshed in two hours wiped the entire catalog.

What was left was the fallback: 238 hardcoded TLEs. The globe kept spinning. No red banner, no console error. Just old orbits, drawn with confidence.

The bug is not the interesting part. The interesting part is that a silent fallback is worse than a loud failure. A failure you see. A fallback lets you show dead data to other people and believe it is real time.

Three fixes, in this order:

403 plus that exact body means "your cache is current", not "error".

`Promise.allSettled`, so one dead group does not take the other nine with it.

Every selected object now shows the age of its orbital elements and an estimated error in kilometers.

The third one mattered most. SGP4 is an extrapolation, not a measurement: about 1 km of error at epoch, above 10 km after a week in LEO. A position printed to four decimals from five-day-old elements is a lie told politely.

It is called Orbital Nexus. Runs entirely in the browser, no backend: 11,894 objects propagated with SGP4, a full catalog pass in about 47 ms, moved into a Web Worker. The ISS position computed locally matches wheretheiss.at with 0.00 km ground-track difference.

Open source. Link in the first comment.

How many silent fallbacks are running in your production right now?

#opensource #webdev
```

**Primul comentariu:**

```
Live, no account, no install: https://www.megapromoting.com/satelit/
Source and the data-source writeup: https://github.com/olegchetrean/orbital-nexus

The sources document lists every HTTP check I ran, including the sources I rejected and why.
```

---

## 3. X / Twitter

X numără orice link ca 23 de caractere, indiferent de lungimea reală, plus spațiul
dinainte. Cifrele de mai jos sunt: text singur, apoi total cu link.

### RO — 246 caractere text, 270 cu link

```
CelesTrak semnalează „nemodificat" cu HTTP 403, nu cu 304. Într-un Promise.all, un singur 403 îmi ștergea catalogul de 11.894 de sateliți, iar aplicația cădea tăcut pe 238 de TLE-uri hardcodate. Interfața zicea „live". Orbital Nexus, open source: https://www.megapromoting.com/satelit/
```

### EN — 237 caractere text, 261 cu link

```
CelesTrak signals "not modified" with HTTP 403, not 304. Inside a Promise.all, one 403 wiped my 11,894-object catalog and the app silently fell back to 238 hardcoded TLEs. The UI still said "live". Orbital Nexus, open source, no backend: https://www.megapromoting.com/satelit/
```

**Reply pe firul tău (la ambele), ca să încapă restul fără să tai din hook:**

```
Full catalog pass: ~47 ms, in a Web Worker. ISS position matches wheretheiss.at to 0.00 km on the ground track. Visible-pass prediction for 24 h. Globe or flat map. Code: https://github.com/olegchetrean/orbital-nexus
```

Atașează același video vertical de 15 s. Pe X, videoul urcă rata de oprire pe fir
mai mult decât o captură statică.

---

## 4. Show HN

Hacker News detestă marketingul, dar iubește exact genul ăsta de post-mortem:
concret, reproductibil, cu o concluzie transferabilă. Nu vinde produsul. Povestește bug-ul
și lasă produsul să fie consecința.

> **ATENȚIE, citește înainte de orice.** Din 28 martie 2026, ghidul HN conține o regulă
> explicită: textul trebuie scris de mână, fără LLM, „nici măcar puțin, inclusiv pentru
> editare sau înfrumusețare". Comentariul de mai jos e generat, deci **nu îl copia
> ca atare**. Tratează-l ca pe o listă de fapte, ordine și ton, și rescrie-l cu mâna ta,
> cu propriile tale cuvinte. Comunitatea de acolo detectează fraza de LLM aproape imediat
> și pedepsește exact genul de post care ar fi mers altfel bine. Titlul, cifrele și
> structura poți să le păstrezi; propozițiile trebuie să fie ale tale.

### Titlu

Recomandat (75 de caractere, sub limita HN de 80):

```
Show HN: Orbital Nexus – 11,894 satellites propagated with SGP4, no backend
```

Alternativă, dacă vrei ca povestea să fie hook-ul (71 de caractere):

```
Show HN: A CelesTrak 403 made my satellite tracker lie about being live
```

Alege prima. A doua e mai atrăgătoare, dar HN penalizează titlurile care sună a
„story", iar regula lor e ca titlul de Show HN să spună ce e lucrul, nu ce ai simțit.
Povestea cu 403-ul își are locul în primul comentariu, unde oricum ajunge tot traficul.

Convenția verificată pe pagina `/show` (august 2026): toate titlurile curente folosesc
prefixul `Show HN: `, formatul `Nume – descriere factuală scurtă`, fără punct final,
fără majuscule de accent, fără adjective de marketing. Limita de 80 de caractere e
raportată de comunitate, nu confirmată în documentația oficială; ambele titluri de mai
sus stau confortabil sub ea.

**Formular:** https://news.ycombinator.com/submit
**URL de trimis:** https://www.megapromoting.com/satelit/

Trimiți aplicația, nu repo-ul. Regula lor spune că trebuie să existe o cale prin care
oamenii pot încerca lucrul, iar ghidul cere explicit să fie ușor de încercat, fără
înregistrare sau email. Un repo gol de demo se citește ca „material de lectură", iar
materialul de lectură e listat ca fiind în afara subiectului pentru Show HN.
Repo-ul îl pui în comentariu.

### Primul comentariu al autorului

```
Author here. I wanted to know how much of a satellite tracker can live inside a browser tab with no server at all. Turns out: all of it.

It downloads public orbital elements from CelesTrak, propagates 11,894 objects with SGP4, and draws them either on a 3D globe or on a flat FlightRadar24-style map. Give it a location and it predicts visible passes for the next 24 hours with an estimated magnitude.

A full pass over the catalog takes about 47 ms. That is a fine number and a terrible main-thread stall, so propagation runs in a Web Worker that transfers complete position snapshots instead of copying them. The renderer interpolates between the last two, so motion looks continuous while real propagation happens roughly 15 times a second.

The part I would actually want to read if someone else wrote this:

CelesTrak does not return 304 Not Modified when your copy is already current. It returns 403 with a plain-text body along the lines of "GP data has not updated since your last successful download of GROUP=starlink". If your client only checks res.ok, that is an error. Mine did. And I had wrapped ten group fetches in Promise.all, which rejects the whole set on a single rejection.

So one group that had not refreshed in the last two hours took down the entire catalog, and the app fell back to 238 hardcoded TLEs. Nothing logged. The globe kept spinning. The header still said "live".

Fixes were: treat 403-plus-that-body as "your cache is current", switch to Promise.allSettled so one dead group does not take the other nine with it, and surface data provenance in the UI instead of hiding it.

That last one changed the design more than the other two. Every selected object now shows the age of its orbital elements and an estimated error in kilometers, because SGP4 is an extrapolation, not a measurement: roughly 1 km at epoch, above 10 km after a week in LEO. A position printed to four decimals from five-day-old elements is a lie told politely.

On validation: for the ISS (NORAD 25544) my ground position matches wheretheiss.at, an independent implementation with separately fetched elements, to 0.00 km. That confirms the fetch, parse, propagate and ECI-to-geodetic chain. It does not confirm accuracy against the physical station, since both sides start from the same TLE and inherit the same model error. Worth being explicit about, because a lot of trackers present agreement between two SGP4 implementations as if it were ground truth.

Known limits, all in the README rather than buried:
- Still parsing TLE instead of OMM JSON. satellite.js consumes TLE directly, but the 5-digit catalog number is running out of room now that the catalog is past 100,000 objects. OMM migration is the next piece of work.
- No history. CelesTrak serves only the current set, so "where was this six months ago" needs daily archiving, which needs a server.
- Magnitudes are per-category estimates. A solar panel glint can move one by several steps.
- Conjunction screening via SOCRATES is reachable and verified, but not wired into the UI yet.

Data comes from CelesTrak, redistributing the US Space Force catalog, plus operator-published ephemerides for Starlink, OneWeb and Iridium, which contain planned maneuvers the public catalog only learns about after they happen.

One practical note for anyone hitting the same APIs: during development I pulled the large files (SATCAT 6.7 MB, SOCRATES 16.7 MB) repeatedly for verification, and CelesTrak simply stopped answering my IP. Temporary, but total. Their use policy asks you not to poll faster than the data updates, and it is not decorative. The local IndexedDB cache is why the app kept working through it.

MIT. Code: https://github.com/olegchetrean/orbital-nexus
Happy to go into the SGP4 side, the worker transfer scheme, or why the camera has to fly on an arc.
```

**Reguli verificate în ghidul HN, de respectat la postare:**
- **Rescrie textul de mână.** Vezi avertismentul de la începutul secțiunii.
- Nu cere upvote-uri și nu ruga prieteni să comenteze. Regula lor e literală:
  nu cere upvote-uri, iar prietenii și utilizatorii tăi nu trebuie să adauge
  comentarii de susținere în fir. E cel mai rapid mod de a fi îngropat.
- **Nu posta de pe un cont cu numele firmei sau al produsului.** Regulă explicită.
  Contul trebuie să fie al tău, personal.
- Nu șterge și nu reposta. Un Show HN nou pentru același proiect e permis doar dacă
  versiunea e semnificativ diferită, cu link către Show HN-ul anterior și explicația
  diferenței, iar ghidul spune că asta ar trebui să se întâmple o dată sau de două ori pe an.
- Nu edita titlul după ce postarea a prins tracțiune.
- Ce cere ghidul să incluzi, și am inclus: povestea din spate, ce e diferit față de
  ce există, o formulare simplă a ce face lucrul, limbaj factual, nu de vânzare.
- Stai la calculator 3-4 ore după submit și răspunde la fiecare comentariu tehnic.
  Un Show HN cu autorul absent moare chiar dacă produsul e bun.
- Dacă cineva găsește o eroare în cifre, recunoaște-o pe loc și corectează. Publicul
  ăsta iartă greșeala, nu iartă apărarea ei.

**Fereastră:** marți-joi, 08:00-10:00 PT (aprox. 18:00-20:00 ora Chișinăului).
Sursa e analiză terță, nu date oficiale HN, și toate sursele avertizează că momentul
contează mult mai puțin decât titlul și decât prezența ta în fir. Tratează ca euristică.

---

## 5. Unde se publică

Verificat prin cereri web în august 2026. Unde n-am putut confirma o regulă din sursa
oficială, scrie explicit **neverificat** — nu presupune.

Titlurile de mai jos sunt cele exacte pe care le-ai posta acolo, nu variații de inspirație.

### 5.1 Hacker News — Show HN

| | |
|---|---|
| Submisie | https://news.ycombinator.com/submit |
| Reguli | https://news.ycombinator.com/showhn.html + https://news.ycombinator.com/newsguidelines.html |
| Stare | activ |
| Potrivire | **MARE** |

**Titlul exact:**
```
Show HN: Orbital Nexus – 11,894 satellites propagated with SGP4, no backend
```

**Reguli.** Show HN e pentru ceva făcut de tine cu care alții se pot juca. În afara
subiectului: articole de blog, pagini de înscriere, newslettere, liste. Ghidul cere
explicit ca lucrul să fie ușor de încercat, fără bariere de tip cont sau email.
Textul trebuie scris de mână, fără LLM. Nu ceri upvote-uri. Nu postezi de pe un cont
cu numele firmei.

**Argument.** Gratuit, open source, fără cont, rulează direct în tab, cu o poveste
tehnică verificabilă. E aproape definiția arhetipală a unui Show HN. Ăsta e canalul
principal, restul sunt satelit.

---

### 5.2 Changelog News

| | |
|---|---|
| Submisie | https://changelog.com/news/submit (cere cont gratuit, https://changelog.com/join) |
| Stare | activ, dar ultimul număr vizibil în arhivă era #185 din 29 aprilie 2026. Verifică cadența înainte de a conta pe el |
| Potrivire | **MARE** |

**Titlul exact:**
```
Orbital Nexus: a real-time 3D satellite map that runs entirely in the browser
```
La rubrica „What's interesting about it?" pui, pe scurt, povestea cu 403-ul.

**Reguli.** Acceptă explicit și munca proprie. Resping tutorialele și produsele
comerciale (pe acelea le trimit spre sponsorizare). Ton cerut: pozitiv, „hacker".

**Argument.** Gratuit plus open source plus fără înregistrare e exact linia lor
editorială, iar auto-submisia e invitată explicit. Cost mic, lead time editorial mare,
deci se trimite primul.

---

### 5.3 Hackaday

| | |
|---|---|
| Submisie | https://hackaday.com/submit-a-tip/ (alternativ tips@hackaday.com) |
| Stare | activ |
| Potrivire | **MEDIE-MARE** |

**Subiectul exact al tip-ului:**
```
Full satellite catalog, SGP4-propagated in the browser, no backend
```

**Reguli.** Acceptă explicit proiecte documentate de tine însuți: „fii mândru de munca
ta", nu timid. Cer subiect descriptiv și ton care să nu semene a comunicat de presă.

**Argument și capcana.** Contrar prejudecății că Hackaday e doar hardware, pe
18 iunie 2026 au publicat un vizualizator 3D de sateliți GPS care rula în browser, pe
date TLE live. Precedentul editorial există, deci apetitul e dovedit. Dar taie și în
sens invers: au acoperit ceva foarte asemănător acum șase săptămâni. Diferențiază
explicit în tip: catalog complet, nu doar GPS; fără backend deloc; open source;
și povestea 403-ului, pe care ei o pot transforma în articol de sine stătător.

**Hackaday.io** (https://hackaday.io/project/add) e site separat, orientat spre hardware.
Pentru o aplicație web care are deja URL live și repo, nu adaugă nimic. **Sari peste el.**

---

### 5.4 Product Hunt

| | |
|---|---|
| Submisie | din interfață: buton „Submit" sus-dreapta, apoi „New Product". URL-ul direct `producthunt.com/posts/new` returnează 403 clienților non-browser, deci nu l-am putut confirma |
| Ghid | https://www.producthunt.com/launch/preparing-for-launch |
| Stare | activ |
| Potrivire | **MEDIE** |

**Titlul (numele produsului) exact:**
```
Orbital Nexus
```
**Tagline exact (limita PH e 60 de caractere, aceasta are 56):**
```
Real-time 3D map of 11,894 satellites, no backend needed
```

**Reguli verificate.** Nu ai nevoie de „hunter": PH spune că încurajează makerii să-și
lanseze singuri produsul și că nu există avantaj discernabil în a folosi un hunter terț.
Conturile de companie sunt interzise, deci lansezi de pe contul personal Oleg Chetrean.
Momentul oficial recomandat e 12:01 AM Pacific, iar lansarea se poate programa cu până la
o lună înainte. Nu ai voie să ceri direct upvote-uri; poți cere doar oamenilor să intre și
să comenteze. Cerințe de material: tagline max 60 de caractere, descriere max 500,
thumbnail pătrat 240×240 sub 3 MB, minim 2 imagini în galerie la 1270×760, maxim 3 tag-uri.
Primul comentariu al makerului nu e obligatoriu tehnic, dar PH însuși scrie că 70% dintre
produsele care au luat Product of the Day/Week/Month l-au avut.

**Neverificat:** vechimea minimă de 30 de zile a contului (apare doar în checklist-uri
terțe) și o poziție oficială explicită despre proiectele gratuite/open source (lansează
acolo în mod curent, dar n-am găsit o declarație oficială).

**Argument.** Va fi acceptat și demo-ul fără cont convertește bine, dar publicul PH e
fondator, marketer și cumpărător de SaaS. Un vizualizator open source nemonetizat ia
bunăvoință și un vârf de trafic de o zi, nu tracțiune durabilă. Merită pentru backlink
și pentru vârf, nu merită construită lansarea în jurul lui.

---

### 5.5 Lobste.rs

| | |
|---|---|
| Submisie | https://lobste.rs/stories/new (redirecționează la login când nu ești autentificat) |
| Reguli | https://lobste.rs/about |
| Stare | activ (poveste din 3 august 2026) |
| Potrivire | **MEDIE ca subiect, dar practic blocat pentru săptămâna de lansare** |

**Titlul exact, dacă și când ajungi să poți posta:**
```
Orbital Nexus: 11,894 satellites propagated with SGP4 in the browser
```
Tag-uri disponibile relevante: `show`, `javascript`, `graphics`, `visualization`,
`performance`. Nu există tag `space` sau `astronomy`.

**Blocantul real, verificat.** Lobsters e în continuare doar pe invitație în 2026.
Peste asta, conturile noi sunt „noi" 70 de zile și în acest răstimp **nu pot trimite
link-uri către domenii nevăzute până atunci pe site** și **nu pot folosi tag-ul `show`**.
Adică exact cele două lucruri de care ai nevoie. Chiar dacă obții invitația mâine,
`satelit.megapromoting.com` e domeniu nou și tag-ul `show` e blocat.

Căi reale: fie obții invitație și aștepți 70 de zile, fie îl trimite un utilizator
deja stabilit acolo, care are voie. A doua variantă trebuie să respecte oricum norma lor:
auto-promovarea sub un sfert din poveștile și comentariile tale.

**Argument.** Subiectul trece filtrul lor („îmbunătățește următorul program al
cititorului?") doar dacă îl încadrezi ca inginerie: propagare SGP4, buget de randare,
arhitectură fără backend. Nu ca „uite ce sateliți frumoși". Dar programează-l la 70+ zile,
nu în ziua 1.

---

### 5.6 DEV Community (dev.to), tag `#showdev`

| | |
|---|---|
| Submisie | https://dev.to/new/showdev (pre-completează tag-ul) |
| Stare | activ (postări din 2-3 august 2026) |
| Potrivire | **MEDIE** |

**Titlul exact:**
```
I found out my satellite tracker was lying: a CelesTrak 403 that looks like an error
```

**Reguli.** Tag-ul `showdev` e explicit pentru a-ți arăta lucrul tău sau al companiei tale.
Exclude tutorialele. Cer conținut orientat spre comunitate, nu corporatist sau de vânzare.
Cross-postingul e practică normală; setează `canonical_url` dacă textul stă și altundeva.

**Argument.** Efort aproape zero, auto-promovarea e sancționată explicit, rămâne un
articol permanent indexabil pe care îl poți lega din alte părți. Traficul e slab calitativ.
Tratează-l ca pe un artefact propriu, nu ca pe un eveniment de lansare.

---

### 5.7 Lemmy — mander.xyz `c/space`

| | |
|---|---|
| Submisie | https://mander.xyz/create_post (comunitatea: https://mander.xyz/c/space) |
| Stare | activ, ~2,56K abonați, ~67 utilizatori/zi |
| Potrivire | **MEDIE** |

**Titlul exact:**
```
Orbital Nexus: open-source real-time 3D satellite map, runs fully in your browser
```

**Atenție, capcană verificată:** `lemmy.world/c/space` e **moartă**. Propriul ei sidebar
spune că s-a mutat la `!space@mander.xyz`, iar ultimele postări sunt din aprilie 2025.
Nu posta acolo.

**Reguli.** Sidebar-ul de la mander.xyz are doar reguli generice de civilitate, fără
politică explicită de auto-promovare. Norma generală pe lemmy.world e sub 10% auto-promovare,
cu o excepție pentru proiecte open source self-hostable dacă ai contul de peste 7 zile și
participi la comentarii, **dar n-am putut verifica dacă excepția aceea se aplică pe
mander.xyz**. Scrie unui moderator înainte.

**Argument.** Public mic, dar chiar pe subiect și cu apetit pentru unelte libere.

Alternativ, https://programming.dev/create_post e activă și cu înregistrare deschisă,
potrivire mai slabă (**MICĂ-MEDIE**).

---

### 5.8 Mastodon / Fediverse

Fără gatekeeper: postezi de pe contul tău. Hashtag-uri relevante: `#SpaceMastodon`,
`#Satellites`, `#OpenSource`, `#WebGL`, `#ThreeJS`, `#Astronomy`.
Comunitatea de astronomie de acolo e neobișnuit de densă și receptivă la unelte gratuite.
**Potrivire: MEDIE**, cu observația că are efect real doar dacă ai deja o prezență acolo.
Folosește textul de pe X, varianta EN.

---

### 5.9 Canale de eliminat din listă

- **Hacker Newsletter** — nu există unde trimite. `hackernewsletter.com/submit`,
  `/submissions` și `/curate` returnează toate **404**. E curat manual *din* Hacker News,
  deci singura pârghie e să prinzi tracțiune pe HN. Nu pierde timp.
- **TLDR newsletter** — viu și mare, dar n-am găsit niciun formular public sau proces
  editorial de submisie documentat. **Neverificat**, tratează ca inaccesibil.
- **Tildes** — activ, dar pe invitație și mai greu decât Lobsters: pagina de înregistrare
  cere cod de invitație, iar ruta oficială e un email la invites@tildes.net, fără program.
  Public mic, poartă închisă, zero cale rapidă. **Potrivire MICĂ**, nu merită pentru lansare.

### 5.10 Reddit — reguli citite direct din widget-ul fiecărui subreddit

Reddit blochează majoritatea instrumentelor automate: `www.reddit.com` și toate rutele
`.json` întorc o pagină de verificare anti-bot. Ruta care funcționează e
`https://old.reddit.com/r/<nume>/about/rules/` (cu slash final) — de acolo vine fiecare
citat de mai jos. Numărul de abonați e din surse terțe (GummySearch, FreeSubStats,
2–3 august 2026), deci aproximativ. Unde widget-ul de reguli e gol, scrie asta explicit,
nu am completat cu presupuneri.

**Atenție transversală:** contul care postează trebuie să aibă istoric. Repo-ul are zero
stele și o zi de existență; r/opensource și r/InternetIsBeautiful verifică amândouă
activitatea recentă a contului și elimină postările de tip „drive-by".

#### Potrivire mare

| Subreddit | Abonați | Ce contează |
|---|---|---|
| **r/amateursatellites** | 36k | **Cea mai bună țintă.** Patru reguli, niciuna împotriva autopromovării. Regula 1 cere flair — există **Software**. Precedent direct: *„I built an open-source 3D satellite tracker (satlas.app)"*, 24 mai 2026. |
| **r/opensource** | 373k | Regula 8: flair **Promotional** obligatoriu. Regula 4: licență OSI — MIT trece. Regula 6 elimină postările fără intenție de discuție, deci rămâi în comentarii. |
| **r/webdev** | 3,29M | **Doar sâmbăta**, flair **Showoff Saturday**. Regula 4 interzice *„any commercial promotion"* — un link către `megapromoting.com` poate fi citit ca reclamă. Aici dă GitHub. |
| **r/coolgithubprojects** | 112k | Fără reguli configurate. Sidebar cere format `[Desc] - [Title]` și link GitHub, nu demo. |
| **r/satellites** | 19k | Două reguli, ambele banale. Canonic e cu literă mică — **r/satellite, la singular, e privat** (HTTP 403). |
| **r/threejs** | ~52k | Widget de reguli **complet gol**. Sidebar invită demo-uri. |

#### Potrivire medie

- **r/space** (27,9M) — nicio regulă contra autopromovării, iar precedentul e clar:
  *„So I built yet another satellite tracker (with pass predictions)"* (21 apr. 2026),
  *„I made a website to visualize satellites and the solar system to scale"* (16 iun. 2026).
  Titlul acela cu „yet another" spune totuși cât de saturată e nișa. Imaginile doar în
  weekend (regula 7), maximum 5 postări/24 h (regula 12), conținut generat de AI interzis (13).
- **r/InternetIsBeautiful** (16,6M) — trece filtrele dure (gratuit, fără cont, fără descărcare),
  dar **regula 2** elimină site-urile *„care fac lucruri foarte similare cu submisii anterioare"*,
  iar trackere de sateliți au mai fost postate în 2017, 2020 și 2022. Regula 11 impune raport
  strict 90/10 pe istoricul recent.
- **r/javascript** (2,45M) — regula 2 cere cod public alături de demo; repo-ul rezolvă asta.
  Flair „Showoff Saturday" există și e folosit, dar nicio regulă nu-l impune — **neverificat**
  dacă moderatorii îl cer informal.
- **r/spaceflight** (~312k) — regula 4: *„toleranță scăzută pentru autopromovare flagrantă"*.
  O postare bine formulată e apărabilă, o campanie nu.
- **r/SideProject** (797k) — fără reguli, format `[Nume] - [Descriere]`, volum uriaș, semnal mic.
- **r/webgl** (~10k) — fără reguli, mic, risc zero.

#### De evitat

- **r/programming** (6,9M) — regula 5 e fatală: *„just a link to a GitHub page or a list of
  features is not [allowed]. We don't care what you built, we care how you build it."*
  Viabil doar ca articol tehnic real — propagarea SGP4 în browser ar fi un unghi legitim.
- **r/Astronomy** (3,1M) — regula 5 interzice explicit aplicațiile.
- **r/astrophotography** (2,64M) — regula 1: *„No self-promotion."* Sub doar de imagini.
- **r/dataisbeautiful** (21,8M) — formatul cere ca postarea să *fie* vizualizarea, nu un link.
- **r/selfhosted** (811k) — pică de două ori: aplicația nu se auto-găzduiește (fără backend),
  iar regula 6 trimite proiectele mai noi de 3 luni în megathread.
- **r/orbitalmechanics** — mort, fără postări din februarie 2022.

#### Ordinea recomandată pe Reddit

r/amateursatellites (flair Software) → r/satellites → r/opensource (flair Promotional) →
sâmbăta următoare r/webdev (flair Showoff Saturday) → r/space.

**Distanțează-le.** r/InternetIsBeautiful și r/opensource verifică amândouă istoricul recent
al contului; o rafală pe zece subredituri în aceeași zi e tiparul cel mai sigur de a fi marcat
ca spam.

#### Necercetate
r/nasa (5,9M), r/RTLSDR (136k), r/amateurradio (219k) — ultimele două se suprapun puternic
cu publicul de la r/amateursatellites. Piste, nu recomandări: verifică regulile înainte.


---

## 6. Ordinea de lansare

### Ziua 0 — blocante tehnice, verificate azi

Astea nu sunt sugestii de îmbunătățire. Fără ele, lansarea nu poate porni.

1. **`satelit.megapromoting.com` nu există în DNS.** Verificat azi: `NXDOMAIN`.
   Pentru comparație, `megapromoting.com` rezolvă corect la 141.227.180.10.
   Propriul tău `deploy/nginx/satelit.megapromoting.com.conf` notează în antet că
   înregistrarea A pentru „satelit" încă nu e creată la Hostinger. Creeaz-o și
   așteaptă propagarea.
2. **Nu există HTTPS.** Configurația nginx are doar blocul `listen 80`, fără `listen 443`
   și fără directive `ssl_`. Etapa 2 din propriul fișier e
   `sudo certbot --nginx -d satelit.megapromoting.com`. Un link `http://` trimis pe
   Hacker News sau Reddit primește comentarii despre asta în primele zece minute, iar
   unele browsere afișează avertisment. Rezolvă înainte, nu după.
3. **Titlul paginii e în română.** `index.html` are `<html lang="ro">` și
   `<title>Orbital Nexus — sateliții, în timp real</title>`. Interfața detectează corect
   limba browserului și cade pe engleză pentru vizitatorii străini (`detectLang()` în
   `src/lib/i18n.ts`), dar titlul din tab și din previzualizarea link-ului rămâne românesc
   până rulează JS. Pentru un public internațional, fă titlul bilingv sau neutru.
   Alternativa rapidă: trimite `https://www.megapromoting.com/satelit//?lang=en` pe canalele EN,
   parametrul e deja suportat.
4. **Verifică `npm run verify:sources` pe producție** înainte de a spune public „live".
   Dacă vreo sursă e picată în ziua lansării, mai bine afli tu decât primul comentator.

Nu porni nimic din ce urmează până toate patru sunt bifate.

---

### Cu 3-5 zile înainte

**Changelog News.** Are lead time editorial, deci se trimite primul și nu depinde de
restul. https://changelog.com/news/submit

**Pregătește materialele grele o dată, refolosește-le peste tot:**
- videoul vertical de 15 s, cu subtitrări arse (LinkedIn, X, Mastodon)
- 2 capturi la 1270×760 și un thumbnail 240×240 (Product Hunt)
- un GIF scurt cu comutarea glob ↔ hartă plată, care funcționează unde videoul nu merge

**Rescrie de mână comentariul de Show HN.** Vezi avertismentul din secțiunea 4.
E singura piesă din documentul ăsta pe care nu ai voie să o copiezi.

---

### Ziua 1 — Hacker News, singur

Marți, miercuri sau joi, în jur de 08:00-10:00 PT, adică 18:00-20:00 ora Chișinăului.

Un singur lucru se întâmplă în ziua asta: **Show HN**. Trimiți URL-ul aplicației,
postezi comentariul autorului imediat, și **stai în fir 3-4 ore**. Fără excepții.
Un Show HN cu autorul absent moare chiar dacă produsul e bun.

**Ce NU faci în ziua 1:**
- nu posta pe LinkedIn în aceeași zi. Dacă HN prinde, ai nevoie de toată atenția
  ta acolo, iar dacă postezi peste tot simultan nu vei ști niciodată ce canal a funcționat.
- nu cere nimănui, nicăieri, să voteze sau să comenteze pe HN. Nici prietenilor.
  Regula lor e explicită și e cel mai rapid mod de a fi îngropat.
- nu posta simultan pe mai multe subreddituri. Reddit tratează asta ca spam
  și te poate filtra automat pe toate deodată.

---

### Ziua 2 — LinkedIn RO

Postarea în română, cu videoul, dimineața, 7:30-9:00. Link în primul comentariu.
Răspunzi la fiecare comentariu în primele 90 de minute.

Dacă HN a mers bine, ai acum și un rezultat de menționat, dar **nu îl pune în postare**.
Postarea rămâne despre bug. Dacă cineva întreabă în comentarii, atunci spui.

În aceeași zi poți face și **tip-ul la Hackaday** (nu concurează cu nimic, e la discreția
redacției și oricum nu apare imediat).

---

### Ziua 3-4 — Reddit, câte unul pe zi

Reddit e singurul canal unde ordinea contează cu adevărat, pentru că platforma
însăși penalizează postarea în paralel. Vezi 5.10 pentru ordinea exactă și
pentru comunitățile care interzic auto-promovarea.

Regula generală: **un subreddit pe zi, maxim două**, și în fiecare comentezi ca om,
nu ca autor care își apără produsul. Dacă un subreddit cere zi specifică sau flair,
respectă-le exact; moderatorii de acolo șterg fără discuție.

---

### Ziua 5-7 — LinkedIn EN, dev.to, Mastodon, Lemmy

**LinkedIn EN** la minim 24 h după cel RO, ideal 3-4 zile. Două postări în aceeași zi
declanșează semnalul de canibalizare.

**dev.to `#showdev`**, **mander.xyz `c/space`**, **Mastodon** — cost mic, se pot face
în aceeași zi, nu concurează între ele.

---

### Săptămâna 2 și mai departe

**Product Hunt** — zi separată, programat la 12:01 AM PT, marți-joi. Nu îl suprapune
peste nimic. PH cere prezență toată ziua în comentarii, la fel ca HN.

**Forumurile de astronomie și comunitatea SatNOGS** — vezi 5.11. Astea nu sunt canale
de lansare, sunt canale de apartenență. Se intră lent: citești, comentezi la alții,
și abia apoi îți menționezi lucrul, dacă regulile permit. Un post de lansare aruncat
într-un forum de astronomie de către un cont nou se șterge, și pe bună dreptate.

**PR-uri la awesome-lists** — vezi 5.11. Se fac după ce repo-ul are câteva stele și
un README în engleză, nu înainte. Listele acelea resping proiectele fără tracțiune.

**Lobsters** — abia după 70 de zile de la crearea contului, din motivele din 5.5.
Pune-ți memento, nu îl pierde.

---

### Ce nu faci niciodată, pe niciun canal

- Nu ceri upvote-uri. Nicăieri. Nici măcar indirect („dați o mână de ajutor").
- Nu postezi de pe conturi multiple și nu rogi pe cineva să comenteze de susținere.
- Nu inventezi cifre. Tot ce e în document e verificabil în `docs/SURSE-DE-DATE.md`;
  dacă cineva verifică, trebuie să găsească exact ce ai spus.
- Nu prezinți acordul cu wheretheiss.at ca dovadă de acuratețe absolută. Confirmă
  lanțul de calcul, nu poziția fizică reală a stației. Diferența asta e primul lucru
  pe care ți-l va testa cineva competent, și e mai bine să o spui tu primul.
