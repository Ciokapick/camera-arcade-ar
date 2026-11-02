---
title: "Camera Arcade AR"
subtitle: "Jocuri de masă în realitate augmentată, cu elemente de inteligență ambientală"
author: "Denis Pavăl Constantin"
date: "Noiembrie 2026"
lang: ro
---

**Cuprins**

- 1\. Ce este aplicația
- 2\. Conceptele: realitate augmentată și inteligență ambientală
    - 2.1\. Realitatea augmentată
    - 2.2\. Inteligența ambientală
- 3\. Cum a fost gândită aplicația
    - 3.1\. Obiective
    - 3.2\. Arhitectura
    - 3.3\. Decizii de proiectare
- 4\. Mediul de dezvoltare
- 5\. Librării folosite
- 6\. Avantaje și dezavantaje
    - 6.1\. Avantaje
    - 6.2\. Dezavantaje și limitări
- 7\. Posibile dezvoltări ulterioare
- 8\. Concluzii
- Bibliografie

# 1. Ce este aplicația

**Camera Arcade AR** este o aplicație web care pune jocuri de masă virtuale pe masa reală, văzută prin camera telefonului. Nu se instalează nimic: se deschide adresa [camera-arcade-ar.vercel.app](https://camera-arcade-ar.vercel.app) în browser, pe iPhone, Android sau laptop, și se pornește camera.

Aplicația conține cinci jocuri:

| Joc | Cum se joacă în realitatea augmentată |
|---|---|
| **Joc de zaruri** | Zarurile apar în palma reală. Strângi pumnul, le agiți, deschizi mâna și ele cad pe masă cu fizică reală. Câștigă runda cine are mai multe puncte. Variantă opțională „pe bani”: aplicația recunoaște bancnota pusă în fața camerei (1–500 lei) și ține evidența mizelor și a soldului. Este un experiment de recunoaștere a imaginilor: nu procesează plăți și nu verifică autenticitatea banilor. |
| **Piatră–Hârtie–Foarfecă** | Gestul mâinii este recunoscut din cameră. Runda pornește singură când toți jucătorii au mâna în cadru, iar deasupra fiecărei mâini apare simbolul 3D al gestului. |
| **Nu te supăra, frate** | Tabla 3D stă pe masă. Zarul se aruncă din palmă, iar pionul se ia cu degetul de pe ecran sau „ciupit” cu mâna reală și se pune pe căsuța marcată. |
| **Jenga** | Un turn de 54 de piese pe masă. Prinzi o piesă între degetul mare și arătător, o scoți încet și o duci sus. Dacă tragi prea repede, turnul se clatină. |
| **X și 0** | Tabla 3×3 pe masă. Pui degetul real pe o căsuță și îl ții o clipă. |

Se poate juca singur, contra calculatorului, sau cu prietenii: gazda creează o cameră de joc cu un cod de 4 litere, iar ceilalți intră cu codul de pe telefoanele lor. Jucătorii din aceeași încăpere pot folosi un **marker printat**, ca să vadă toți tabla exact în același loc pe masă.

# 2. Conceptele: realitate augmentată și inteligență ambientală

## 2.1. Realitatea augmentată

**Realitatea augmentată** (*Augmented Reality*, AR) adaugă obiecte virtuale peste lumea reală, văzută în timp real. Definiția clasică (Azuma, 1997) cere trei condiții:

1. **combină realul cu virtualul**: obiectele generate de calculator apar în imaginea lumii reale;
2. **este interactivă în timp real**: imaginea se actualizează imediat ce utilizatorul se mișcă sau acționează;
3. **este înregistrată în 3D**: obiectele virtuale au o poziție fixă în spațiul real și nu „plutesc” odată cu ecranul.

Realitatea augmentată se deosebește de **realitatea virtuală** (VR), în care utilizatorul nu mai vede lumea reală deloc. Pe axa „realitate – virtualitate” propusă de Milgram și Kishino (1994), AR este mai aproape de capătul real.

**Cum se regăsesc cele trei condiții în aplicație:**

| Condiție | În Camera Arcade AR |
|---|---|
| Real + virtual | Imaginea camerei este fundalul. Peste ea se desenează în 3D zarurile, tabla și turnul. Mâna reală este decupată din imagine și pusă **în fața** obiectelor virtuale (ocluzie), ca să pară că le ține. |
| Timp real | Imaginea se redesenează la fiecare cadru (30–60 pe secundă). Mâinile sunt analizate continuu, iar zarurile cad cu o simulare fizică. |
| Înregistrare 3D | Aplicația calculează la fiecare cadru poziția și orientarea telefonului față de masă. Tehnica se numește **SLAM** (*Simultaneous Localization And Mapping*: telefonul își dă seama unde se află în timp ce construiește harta mesei). Tabla rămâne pe masă când te miști în jurul ei. |

Aplicația folosește trei moduri de a ancora jocul pe masă:

- **Fără marker (pe masa mea)**: urmărirea mesei prin SLAM, cu motorul 8th Wall, plus AlvaAR ca rezervă. Masa este găsită ca planul orizontal pe care se adună cele mai multe puncte 3D.
- **Cu marker**: un pătrat ArUco printat. Fiecare telefon îi calculează poziția, deci toți jucătorii văd tabla în același loc.
- **WebXR** (Chrome pe Android, opțional): telefonul găsește singur suprafețele prin ARCore.

## 2.2. Inteligența ambientală

**Inteligența ambientală** (*Ambient Intelligence*, AmI) descrie medii care **simt prezența oamenilor și reacționează la ei**, fără ca aceștia să dea comenzi explicite. Ideea pornește de la „calculul omniprezent” al lui Mark Weiser (1991): tehnologia bună „dispare” în fundal. A fost formulată de grupul ISTAG al Comisiei Europene (2001).

Caracteristicile unui sistem cu inteligență ambientală sunt:

- **integrat** (*embedded*): senzorii sunt în obiecte obișnuite;
- **conștient de context** (*context-aware*): recunoaște oamenii și situația în care se află;
- **personalizat**: se adaptează fiecărui utilizator;
- **adaptiv**: își schimbă comportamentul după ce observă;
- **anticipativ**: acționează înainte să i se ceară explicit.

Camera Arcade AR nu este o „casă inteligentă”. Este o aplicație de realitate augmentată care folosește **principiile** inteligenței ambientale: telefonul percepe mediul (masa, mâinile, gesturile, bancnotele) și reacționează singur. Utilizatorul nu trebuie să apese butoane.

| Caracteristică AmI | Cum apare în aplicație |
|---|---|
| Integrat | Singurii senzori sunt cei pe care oricine îi are deja în buzunar: camera, giroscopul și accelerometrul telefonului. Nu există hardware special. |
| Conștient de context | Aplicația recunoaște masa (planul orizontal), mâna (21 de puncte pe fiecare mână, prin rețeaua neuronală MediaPipe), gestul (piatră, hârtie sau foarfecă), pumnul și palma deschisă, „ciupitul” cu două degete și valoarea bancnotelor. |
| Interfață naturală | Joci cu mâinile, ca la o masă adevărată: arunci zarul din palmă, prinzi piesa de Jenga cu degetele, pui degetul pe căsuța de X și 0. |
| Anticipativ | Runda de Piatră–Hârtie–Foarfecă pornește singură când toți jucătorii au mâna în cadru. Jocul se așază singur pe masă dacă ții telefonul nemișcat ~2 secunde. Piesa de Jenga spre care îndrepți degetele se colorează înainte s-o prinzi. |
| Adaptiv | Mărimea jocului se potrivește după distanța până la masă. Când mâna intră în cadru, aplicația nu mai crede că s-a mișcat telefonul, ca tabla să nu „sară”. Mărimea aleasă de jucător e ținută minte pentru fiecare joc. |
| Personalizat | „Învăț bancnota” salvează pe telefon amprenta bancnotelor tale. Fiecare jucător are numele și culoarea lui. |
| Respectă intimitatea | Toată recunoașterea (mâini, bancnote) rulează **pe telefon**. Imaginile camerei nu pleacă nicăieri, iar între telefoane circulă doar acțiunile jocului. |

# 3. Cum a fost gândită aplicația

## 3.1. Obiective

1. **Fără instalare.** O pagină web merge pe orice telefon, inclusiv pe iPhone, unde aplicațiile AR cer de obicei App Store.
2. **Jocul stă pe masa reală**, nu pe ecran. Interacțiunea se face cu mâna, nu cu butoane.
3. **Multiplayer fără server propriu**, ca aplicația să poată fi publicată gratuit.
4. **Același rezultat pe toate telefoanele**: dacă eu dau 4 și 2, toți văd zarurile căzând pe 4 și 2.

## 3.2. Arhitectura

Aplicația este împărțită în straturi independente:

| Strat | Fișiere | Rol |
|---|---|---|
| Interfață | `index.html`, `app.js` | ecranele, butoanele și textele; leagă celelalte straturi |
| Reguli | `game.js`, `ludo.js`, `xo.js`, `jenga.js` | cine e la rând, ce mutări sunt permise, cine a câștigat, calculatorul |
| Rețea | `net.js` | legătura directă între telefoane |
| Scenă 3D și AR | `ar.js`, `surface.js`, `dice.js`, `board.js`, `xo-view.js`, `jenga-view.js`, `rps-ar.js`, `virtual-hand.js` | unde e masa, ce se desenează pe ea |
| Percepție | `hands.js`, `hands-worker.js`, `banknotes.js` | mâini, gesturi, bancnote |

Regula de bază: **regulile nu știu nimic despre ecran, iar ecranul nu decide nimic despre reguli.** Regulile sunt scrise ca o funcție pură (`reduce(stare, acțiune) → stare nouă`). Doar telefonul gazdei o rulează și trimite starea nouă tuturor. Astfel există un singur „arbitru”: un jucător trimite o acțiune („vreau să mut pionul 2”), iar gazda verifică dacă e permisă (e rândul lui, mutarea e legală). Toate telefoanele afișează aceeași partidă, chiar dacă fiecare vede masa din alt unghi. Tot de aceea regulile se pot testa automat, fără telefon.

## 3.3. Decizii de proiectare

- **Zaruri „fizice”, dar cu rezultat decis dinainte.** Valoarea se alege aleator la aruncare. Aruncarea se simulează cu fizică reală, pornind de la o „sămânță” comună, deci identic pe toate telefoanele. La final se rotește doar „vopseaua” zarului, ca să iasă fața cerută.
- **Jenga fără fizică pentru decizie.** Un turn de 54 de piese este instabil în orice motor fizic: cădea singur, neatins. Stabilitatea se calculează geometric: centrul de greutate al pieselor de deasupra trebuie să cadă pe piesele rămase. Fizica e folosită doar pentru animația prăbușirii.
- **Masa găsită statistic.** Telefonul vede multe puncte 3D: pe masă, pe tastatură, pe mână. Aplicația alege înălțimea la care se adună cele mai multe, la fel ca aplicația Măsurare de pe iPhone.
- **Recunoașterea mâinii pe un fir separat** (*Web Worker*), ca să nu încetinească urmărirea mesei.
- **Bancnote recunoscute cu o rețea neuronală, nu după culoare.** Varianta după culoare a nimerit 1 din 10 fotografii reale. Cu „amprenta” calculată de rețeaua MobileNet a nimerit 10 din 10. Dacă bancnota nu e recunoscută, jucătorul îi alege valoarea manual.
- **Atingerea ca rezervă pentru gesturi.** Orice acțiune făcută cu mâna (aruncarea, mutarea pionului, prinsul piesei) se poate face și cu degetul pe ecran, pentru lumină slabă sau mâini greu de urmărit.

Aplicația a fost dezvoltată iterativ: fiecare versiune a fost publicată și încercată pe telefon, iar problemele observate (tabla prea mică lângă mână, mâna luată drept masă, piese greu de prins) au fost măsurate și corectate.

# 4. Mediul de dezvoltare

| Componentă | Ce s-a folosit |
|---|---|
| Limbaje | JavaScript (module ES), HTML, CSS; Python pentru generarea datelor de test |
| Tip aplicație | aplicație web statică, fără server propriu și fără etapă de compilare (*build*) |
| Control al versiunilor | Git și GitHub |
| Publicare | Vercel: la fiecare `git push` pe ramura principală, aplicația se republică automat pe HTTPS (camera telefonului cere HTTPS) |
| Asistenți de programare | Claude Code și Codex (asistenți AI pentru cod) |
| Testare automată | testele integrate în Node.js (`node --test`): 61 de teste pentru regulile jocurilor, partide întregi jucate de calculator, stabilitatea turnului, gesturi, bancnote și găsirea mesei |
| Testare în browser | Playwright cu Chromium: un „telefon simulat” cu o cameră falsă care filmează o masă generată pe calculator, senzori de mișcare simulați și motorul AR real (`tools/ar-sim`) |
| Testare pe dispozitiv | iPhone (Safari) și Android (Chrome); panoul de diagnostic `?debug` arată pe telefon cadrele pe secundă, masa găsită și mâna detectată |

# 5. Librării folosite

Toate se încarcă din CDN (jsDelivr), cu versiune fixată.

| Librărie | Versiune | La ce folosește | Licență |
|---|---|---|---|
| **three.js** | 0.186.1 | grafica 3D: zarurile, tablele, turnul, umbrele | MIT |
| **cannon-es** | 0.20.0 | motor fizic: căderea și ciocnirea zarurilor, prăbușirea turnului | MIT |
| **8th Wall Engine** | 1.0.0 | urmărirea mesei (SLAM) în browser, inclusiv pe iPhone | licență proprie, gratuită (Niantic Spatial) |
| **AlvaAR** | commit fixat | SLAM de rezervă, dacă 8th Wall nu pornește | GPL-3.0 |
| **MediaPipe Tasks Vision** | 0.10.14 | rețele neuronale Google: *Hand Landmarker* (21 de puncte pe mână) și *Image Embedder* (amprenta bancnotelor) | Apache-2.0 |
| **js-aruco2** | 2.0.0 | recunoașterea markerului ArUco și poziția lui 3D | MIT |
| **PeerJS** | 1.5.5 | legătura directă între telefoane (WebRTC) | MIT |
| **canvas-confetti** | 1.9.3 | confetti la câștig | ISC |
| **Iconify** (Phosphor) + fontul **Inter** | 2.1.0 | iconițele și fontul interfeței | MIT / OFL |

Interfețe ale browserului folosite direct: **WebGL** (desenare 3D), **getUserMedia** (camera), **DeviceMotion / DeviceOrientation** (giroscop și accelerometru), **WebRTC** (rețea), **Web Workers** (recunoașterea mâinii în fundal), **Web Audio** (sunete sintetizate), **Vibration API**, **WebXR** (opțional, pe Android).

# 6. Avantaje și dezavantaje

## 6.1. Avantaje

- **Fără instalare**: un link deschis în browser, pe orice telefon. Merge și pe iPhone, unde AR-ul web e rar.
- **Interacțiune naturală**: joci cu mâinile, nu apăsând butoane.
- **Multiplayer gratuit**: telefoanele comunică direct (WebRTC), fără server de joc și fără conturi.
- **Același joc pentru toți**: un singur arbitru (gazda), iar zarurile cad identic pe toate telefoanele.
- **Intimitate**: imaginile camerei sunt prelucrate doar pe telefon.
- **Ușor de extins**: un joc nou înseamnă un fișier de reguli și unul de scenă 3D; partea de AR o preia `ar.js`.
- **Testat automat**: 61 de teste, plus un simulator de telefon pentru partea de AR.
- **Separare clară a regulilor de afișare**, ceea ce face codul ușor de înțeles și de verificat.

## 6.2. Dezavantaje și limitări

- **Precizia urmăririi în browser** este sub cea a aplicațiilor native. Pe iPhone, Safari nu oferă acces la ARKit (motorul AR al sistemului), deci urmărirea se face prin SLAM în JavaScript/WebAssembly. Tabla poate aluneca puțin la mișcări bruște sau pe o masă albă, fără textură.
- **Scara nu e măsurată, ci estimată**: se presupune că telefonul e la ~45 cm de masă. Mărimea jocului se poate regla manual.
- **Mâna**: distanța până la mână se estimează din mărimea palmei pe ecran, deci prinsul pieselor mici prin gest (Jenga) rămâne dificil; atingerea și tragerea pe ecran sunt mai sigure. Lumina slabă și mâna acoperită parțial scad precizia recunoașterii.
- **Încrederea în jucători**: gazda este considerată de încredere, iar valorile zarurilor sunt alese de telefonul celui care aruncă. Gazda verifică regulile, dar nu poate dovedi că valorile au fost alese corect, deci aplicația nu e protejată complet împotriva trișării.
- **Testarea**: testele automate și simulatorul verifică logica și urmărirea pe imagini generate, dar nu înlocuiesc testarea pe multe telefoane reale. Compatibilitatea cu toate dispozitivele nu este garantată.
- **Consum**: camera, urmărirea mesei și rețeaua neuronală rulează simultan. Telefonul se încălzește și bateria scade mai repede.
- **Depinde de internet și de servicii externe**: bibliotecile vin din CDN (câțiva MB la prima încărcare), iar multiplayerul folosește serverul public PeerJS pentru „prezentarea” telefoanelor. Dacă gazda iese, partida se oprește, iar unele rețele Wi-Fi cu firewall strict blochează legătura directă.
- **Licențe**: AlvaAR este GPL-3.0, deci codul trebuie să rămână deschis dacă proiectul e distribuit. 8th Wall cere păstrarea mențiunii autorului.

# 7. Posibile dezvoltări ulterioare

1. **Aplicație nativă sau WebXR pe iPhone** (de exemplu prin Variant Launch), pentru urmărirea ARKit, de precizia aplicației Măsurare.
2. **Ancore comune fără marker**: toți jucătorii văd tabla în același loc pe masă fără să printeze nimic, prin harta spațială partajată între telefoane.
3. **Ocluzie completă cu harta de adâncime**: obiectele reale de pe masă (o cană) acoperă corect jocul, nu doar mâna.
4. **Mai multă inteligență ambientală**: comenzi vocale („aruncă”, „joc nou”), lumina jocului potrivită cu lumina din cameră, recunoașterea jucătorilor după față, pentru scoruri ținute automat.
5. **Jocuri noi**: dame, șah, table, Monopoly. Structura proiectului permite adăugarea lor relativ ușor.
6. **Calculator mai inteligent**: strategie învățată (de exemplu prin învățare prin întărire) în loc de reguli scrise de mână.
7. **Mod offline (PWA)**: bibliotecile salvate pe telefon, ca aplicația să meargă și fără internet după prima deschidere.
8. **Rezultate verificabile între jucători**: zarurile decise în comun (fiecare telefon contribuie cu o parte din număr, prin *commit–reveal*), ca nimeni să nu poată trișa, nici măcar gazda.
9. **Reconectare și gazdă de rezervă**: dacă gazda iese, alt jucător preia partida.
10. **Tutorial interactiv** la prima pornire: cum se pune jocul pe masă și ce gesturi există.
11. **Testare sistematică** pe mai multe telefoane și în lumină diferită, cu măsurarea preciziei urmăririi.
12. **Accesibilitate**: descriere vocală a stării jocului și contrast ridicat.

# 8. Concluzii

Camera Arcade AR arată că realitatea augmentată se poate face direct din browser, pe telefoanele pe care oamenii le au deja. Aplicația îndeplinește cele trei condiții ale AR: combină realul cu virtualul, răspunde în timp real și ancorează jocul în 3D pe masă. Pe lângă asta, percepe mediul și oamenii (masa, mâinile, gesturile, bancnotele) și reacționează singură, ceea ce o apropie de ideea de inteligență ambientală: tehnologia se retrage în fundal, iar jucătorii se uită la masă, nu la meniuri.

Principala limită este precizia urmăririi în browser față de o aplicație nativă. Ea poate fi depășită în versiunile următoare.

# Bibliografie

1. Azuma, R. T. (1997). *A Survey of Augmented Reality*. Presence: Teleoperators and Virtual Environments, 6(4), 355–385.
2. Milgram, P., & Kishino, F. (1994). *A Taxonomy of Mixed Reality Visual Displays*. IEICE Transactions on Information and Systems, E77-D(12), 1321–1329.
3. Weiser, M. (1991). *The Computer for the 21st Century*. Scientific American, 265(3), 94–104.
4. ISTAG (2001). *Scenarios for Ambient Intelligence in 2010*. Comisia Europeană, Information Society Technologies Advisory Group.
5. Aarts, E., & Wichert, R. (2009). *Ambient Intelligence*. În H.-J. Bullinger (Ed.), *Technology Guide* (pp. 244–249). Springer.
6. Google. *MediaPipe Hand Landmarker*. https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
7. Niantic Spatial. *8th Wall Engine*. https://github.com/8thwall/engine
8. three.js. https://threejs.org

**Anexă:** documentația tehnică detaliată, fișier cu fișier, este în `DOCUMENTATIE.md`, în depozitul proiectului.
