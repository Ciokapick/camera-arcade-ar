---
title: "Camera Arcade AR"
subtitle: "Jocuri de masă în realitate augmentată"
author: "Denis Pavăl Constantin"
date: "Noiembrie 2026"
lang: ro
---

**Cuprins**

- 1\. Despre aplicație
- 2\. Realitate augmentată și inteligență ambientală
- 3\. Cum am gândit aplicația
- 4\. Mediul de dezvoltare
- 5\. Librării folosite
- 6\. Avantaje și dezavantaje
- 7\. Dezvoltări ulterioare
- Bibliografie

# 1. Despre aplicație

Camera Arcade AR este o aplicație web în care jocuri de masă cunoscute apar, prin camera telefonului, pe masa reală. Nu trebuie instalat nimic: se deschide adresa [camera-arcade-ar.vercel.app](https://camera-arcade-ar.vercel.app) și se pornește camera.

Am implementat cinci jocuri:

- **Zaruri**: zarurile apar în palmă, le agiți cu pumnul strâns și le arunci deschizând mâna. Există și o variantă „pe bani”, în care aplicația recunoaște bancnota pusă în fața camerei (doar ca experiment, fără plăți reale).
- **Piatră–Hârtie–Foarfecă**: gestul este recunoscut din cameră, iar deasupra mâinii apare simbolul 3D.
- **Nu te supăra, frate**: tabla 3D stă pe masă, pionii se mută cu degetul sau „ciupiți” cu mâna.
- **Jenga**: prinzi o piesă cu degetul mare și arătătorul, o scoți încet și o pui sus pe turn.
- **X și 0**: pui degetul pe o căsuță și îl ții o clipă.

Se poate juca singur, cu calculatorul, sau cu prietenii, prin intermediul unui cod de cameră de 4 litere.

# 2. Realitate augmentată și inteligență ambientală

**Realitatea augmentată (AR)** adaugă obiecte virtuale peste imaginea lumii reale. După Azuma (1997), un sistem AR trebuie să combine realul cu virtualul, să răspundă în timp real și să fixeze obiectele virtuale în spațiul 3D. Spre deosebire de realitatea virtuală, utilizatorul vede în continuare lumea reală.

În aplicația mea, imaginea camerei este fundalul, iar peste ea desenez zarurile, tabla sau turnul. Telefonul își calculează la fiecare cadru poziția față de masă (SLAM), așa că jocul rămâne pe masă chiar dacă mă mișc în jurul ei. Mâna reală este desenată în fața obiectelor virtuale, ca să pară că le ține. Jocul poate fi pus oriunde pe masă sau pe un marker printat, ca toți jucătorii să-l vadă în același loc.

**Inteligența ambientală (AmI)** se referă la medii care simt prezența oamenilor și reacționează la ei, fără comenzi explicite (Weiser, 1991; ISTAG, 2001). Un astfel de sistem este conștient de context, se adaptează și anticipează ce vrea utilizatorul.

Aplicația mea nu este o „casă inteligentă”, dar folosește aceste idei:

- **percepe mediul**: găsește masa, mâinile (21 de puncte pe fiecare mână), gesturile și bancnotele;
- **anticipează**: runda de Piatră–Hârtie–Foarfecă pornește singură când toți au mâna în cadru, jocul se așază singur dacă ții telefonul nemișcat, iar piesa de Jenga spre care arăți se colorează înainte s-o prinzi;
- **se adaptează**: mărimea jocului se potrivește după distanța până la masă, iar când mâna intră în cadru tabla nu mai „sare”;
- **interacțiune naturală**: joci cu mâinile, ca la o masă adevărată, nu cu butoane;
- **intimitate**: toată recunoașterea rulează pe telefon, iar imaginile camerei nu sunt trimise nicăieri.

# 3. Cum am gândit aplicația

Am pornit de la ideea ca aplicația să meargă pe orice telefon, inclusiv pe iPhone, fără instalare. De aceea am ales o aplicație web, nu una nativă.

Am separat regulile jocurilor de partea vizuală. Când un jucător face o mutare, trimite o acțiune, iar telefonul gazdei verifică regulile și trimite starea nouă tuturor. Așa toți văd aceeași partidă, chiar dacă fiecare privește masa din alt unghi. Regulile pot fi astfel testate automat, fără telefon.

Câteva decizii pe care le-am luat pe parcurs:

- **Zarurile** cad cu fizică reală, dar rezultatul este decis înainte, ca să fie la fel pe toate telefoanele.
- **La Jenga** nu las fizica să decidă dacă turnul cade, pentru că turnul de 54 de piese cădea singur. Verific geometric dacă piesele de sus au sprijin, iar fizica o folosesc doar pentru animația prăbușirii.
- **Masa** o găsesc ca planul orizontal pe care se adună cele mai multe puncte 3D, similar aplicației Măsurare de pe iPhone.
- **Bancnotele** le recunosc cu o rețea neuronală. Prima variantă, după culoare, a recunoscut doar 1 din 10 poze reale.

Am lucrat iterativ: am publicat fiecare versiune, am testat-o pe telefon și am corectat ce nu mergea, de exemplu tabla prea mică, mâna confundată cu masa sau piesele greu de prins.

# 4. Mediul de dezvoltare

Aplicația este scrisă în **JavaScript, HTML și CSS**, fără etapă de compilare. Fișierele sunt încărcate direct de browser.

- **Git și GitHub** pentru versiuni;
- **Vercel** pentru publicare: la fiecare `git push`, aplicația se actualizează automat pe HTTPS (camera telefonului funcționează doar pe HTTPS);
- **Node.js** pentru testele automate (61 de teste pentru reguli, gesturi, bancnote și găsirea mesei);
- **Playwright** pentru testare în browser, cu un „telefon simulat” care filmează o masă generată pe calculator;
- **Claude Code și Codex**, asistenți AI pentru scrierea codului;
- testare pe **iPhone (Safari)** și **Android (Chrome)**.

# 5. Librării folosite

| Librărie | La ce am folosit-o |
|---|---|
| three.js | grafica 3D |
| cannon-es | fizica zarurilor și prăbușirea turnului |
| 8th Wall Engine | urmărirea mesei (SLAM) în browser |
| AlvaAR | urmărire de rezervă |
| MediaPipe | recunoașterea mâinilor și a bancnotelor (rețele neuronale) |
| js-aruco2 | recunoașterea markerului printat |
| PeerJS | conexiunea directă între telefoane (WebRTC) |

Toate sunt încărcate din CDN, cu versiunea fixată.

# 6. Avantaje și dezavantaje

**Avantaje:**

- merge din browser, fără instalare, pe iPhone și Android;
- interacțiunea se face cu mâinile;
- multiplayerul nu are nevoie de server propriu sau de conturi;
- imaginile camerei rămân pe telefon;
- codul este împărțit clar, deci se pot adăuga ușor jocuri noi.

**Dezavantaje:**

- urmărirea din browser este mai puțin precisă decât într-o aplicație nativă (Safari nu are acces la ARKit), deci tabla poate aluneca puțin, mai ales pe o masă albă sau la mișcări bruște;
- recunoașterea mâinii depinde de lumină, iar prinsul pieselor de Jenga cu mâna este încă dificil; cu degetul pe ecran merge mai sigur;
- telefonul consumă mult (cameră, urmărire, rețea neuronală) și se încălzește;
- multiplayerul depinde de gazdă și de un server public PeerJS; gazda este considerată de încredere, deci aplicația nu e complet protejată împotriva trișării;
- nu am putut testa pe multe modele de telefoane.

# 7. Dezvoltări ulterioare

- o versiune nativă sau acces la ARKit pe iPhone, pentru o urmărire mai precisă;
- tabla în același loc pentru toți jucătorii, fără marker printat;
- comenzi vocale și recunoașterea jucătorilor;
- jocuri noi (dame, șah, table);
- un tutorial la prima pornire;
- reconectare automată dacă gazda iese din joc;
- mod offline.

# Bibliografie

1. Azuma, R. T. (1997). *A Survey of Augmented Reality*. Presence: Teleoperators and Virtual Environments, 6(4), 355–385.
2. Weiser, M. (1991). *The Computer for the 21st Century*. Scientific American, 265(3), 94–104.
3. ISTAG (2001). *Scenarios for Ambient Intelligence in 2010*. Comisia Europeană.
4. Google. *MediaPipe Hand Landmarker*. https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
5. 8th Wall Engine. https://github.com/8thwall/engine
6. three.js. https://threejs.org
