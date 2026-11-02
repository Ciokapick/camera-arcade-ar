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

Camera Arcade AR este o aplicație web cu jocuri de masă care apar, prin camera telefonului, direct pe masa din fața ta. Nu trebuie instalat nimic. Deschizi [camera-arcade-ar.vercel.app](https://camera-arcade-ar.vercel.app) în browser, dai voie la cameră și alegi un joc.

Am făcut cinci jocuri. La **zaruri**, zarurile îți apar în palmă: strângi pumnul, le agiți și deschizi mâna ca să le arunci pe masă. Am adăugat și o variantă „pe bani”, în care aplicația recunoaște bancnota pusă în fața camerei. E doar un experiment, nu se fac plăți reale. La **Piatră–Hârtie–Foarfecă**, gestul e recunoscut din cameră și deasupra mâinii apare simbolul ales. Mai sunt **Nu te supăra, frate**, cu tabla pe masă și pionii mutați cu degetul sau „ciupiți” cu mâna, **Jenga**, unde scoți piesele din turn cu degetul mare și arătătorul, și **X și 0**, unde ții degetul o clipă pe căsuța aleasă.

Se poate juca singur, contra calculatorului, sau cu prietenii. Gazda primește un cod de 4 litere, iar ceilalți intră cu el de pe telefoanele lor.

# 2. Realitate augmentată și inteligență ambientală

Realitatea augmentată (AR) înseamnă să adaugi obiecte virtuale peste imaginea lumii reale. Definiția cea mai citată îi aparține lui Azuma (1997): un sistem AR combină realul cu virtualul, răspunde în timp real și ține obiectele virtuale fixate în spațiul 3D. Diferența față de realitatea virtuală e că utilizatorul nu pierde contactul cu lumea reală, o vede în continuare.

La mine, fundalul e chiar imaginea camerei, iar peste ea desenez zarurile, tabla sau turnul. Ca jocul să stea pe masă, telefonul își calculează la fiecare cadru poziția față de ea (tehnica se numește SLAM). Așa pot să mă mișc în jurul mesei, iar tabla rămâne unde am pus-o. Am vrut ca mâna să pară că ține obiectele virtuale, așa că o decupez din imagine și o desenez peste ele. Jocul se poate pune oriunde pe masă sau pe un marker printat. Varianta cu marker e utilă când toți jucătorii sunt în aceeași cameră și trebuie să vadă tabla în același loc.

Inteligența ambientală (AmI) pornește de la ideea lui Weiser (1991) că tehnologia ar trebui să „dispară” în fundal. Un mediu inteligent simte prezența oamenilor și reacționează fără să primească comenzi explicite (ISTAG, 2001). Aplicația mea nu e o casă inteligentă, dar am încercat să folosesc câteva dintre aceste idei. Telefonul recunoaște masa, mâinile, gesturile și bancnotele. Mai multe lucruri se întâmplă singure: runda de Piatră–Hârtie–Foarfecă pornește când toți jucătorii au mâna în cadru, jocul se așază pe masă dacă ții telefonul nemișcat câteva secunde, iar la Jenga piesa spre care duci degetele se colorează înainte s-o prinzi. Mărimea jocului se adaptează după distanța până la masă. Toată recunoașterea rulează pe telefon, deci imaginile din cameră nu pleacă nicăieri.

# 3. Cum am gândit aplicația

Primul lucru pe care l-am vrut a fost ca aplicația să meargă pe orice telefon, inclusiv pe iPhone, fără să instalezi ceva. De aici a venit alegerea unei aplicații web.

Apoi am despărțit regulile jocurilor de ce se vede pe ecran. Când cineva face o mutare, trimite o acțiune, iar telefonul gazdei verifică dacă e permisă și trimite starea nouă tuturor. Așa toți văd aceeași partidă, chiar dacă fiecare se uită la masă din alt unghi. Un alt avantaj e că regulile se pot testa automat, fără telefon.

Pe parcurs au apărut probleme care m-au obligat să schimb abordarea. La zaruri, rezultatul trebuia să fie același pe toate telefoanele, dar voiam și o cădere realistă. Am ajuns la o variantă în care fizica simulează aruncarea, iar valoarea e stabilită dinainte. La Jenga am încercat întâi să las fizica să decidă dacă turnul cade, dar turnul de 54 de piese cădea singur, fără să-l atingă nimeni. Acum verific geometric dacă piesele de sus mai au sprijin, iar fizica o folosesc doar pentru animația prăbușirii. Bancnotele am încercat la început să le recunosc după culoare, dar a ieșit corect doar o poză din zece, așa că am trecut la o rețea neuronală.

Am lucrat pas cu pas: publicam o versiune, o încercam pe telefon și corectam ce nu mergea. Tabla prea mică lângă mână, mâna confundată cu masa sau piesele de Jenga greu de prins au fost corectate așa.

# 4. Mediul de dezvoltare

Aplicația e scrisă în JavaScript, HTML și CSS și nu are etapă de compilare, browserul încarcă fișierele direct. Pentru versiuni am folosit Git și GitHub, iar pentru publicare Vercel. La fiecare `git push`, site-ul se actualizează automat pe HTTPS, lucru necesar pentru că browserul nu dă acces la cameră pe o pagină fără HTTPS.

Pentru testare am scris 61 de teste automate în Node.js, care verifică regulile jocurilor, gesturile, bancnotele și găsirea mesei. Partea de AR am testat-o cu Playwright, într-un „telefon simulat” care filmează o masă generată pe calculator, și bineînțeles pe telefoane reale: iPhone cu Safari și Android cu Chrome.

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

Toate sunt încărcate din CDN, cu versiunea fixată, ca o actualizare a lor să nu strice aplicația.

# 6. Avantaje și dezavantaje

Cel mai mare avantaj e că aplicația merge din browser, fără instalare, atât pe iPhone, cât și pe Android. Jocul se controlează cu mâinile, ceea ce îl face mai apropiat de un joc de masă adevărat. Pentru multiplayer nu e nevoie de server propriu sau de conturi, iar imaginile camerei rămân pe telefon. Codul e împărțit clar, deci un joc nou se adaugă relativ ușor.

Există și limite. Urmărirea mesei din browser e mai puțin precisă decât într-o aplicație nativă, pentru că Safari nu dă acces la ARKit. Pe o masă albă sau la mișcări bruște, tabla poate aluneca puțin. Recunoașterea mâinii depinde de lumină, iar prinsul pieselor de Jenga cu mâna e încă dificil, cu degetul pe ecran merge mai sigur. Telefonul consumă destul de mult și se încălzește. Multiplayerul depinde de gazdă și de un server public PeerJS, iar gazda e considerată de încredere, deci trișatul nu e exclus complet. Nu în ultimul rând, am putut testa doar pe câteva modele de telefoane.

# 7. Dezvoltări ulterioare

Cel mai mult m-ar interesa o versiune nativă sau o soluție care să dea acces la ARKit pe iPhone, pentru o urmărire mai precisă. Ar fi util și ca toți jucătorii să vadă tabla în același loc fără marker printat. Ca idei mai apropiate de inteligența ambientală, m-am gândit la comenzi vocale și la recunoașterea jucătorilor. Pe lângă acestea, aș adăuga jocuri noi (dame, șah, table), un tutorial la prima pornire, reconectare automată când iese gazda și un mod offline.

# Bibliografie

1. Azuma, R. T. (1997). *A Survey of Augmented Reality*. Presence: Teleoperators and Virtual Environments, 6(4), 355–385.
2. Weiser, M. (1991). *The Computer for the 21st Century*. Scientific American, 265(3), 94–104.
3. ISTAG (2001). *Scenarios for Ambient Intelligence in 2010*. Comisia Europeană.
4. Google. *MediaPipe Hand Landmarker*. https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
5. 8th Wall Engine. https://github.com/8thwall/engine
6. three.js. https://threejs.org
