---
title: "Camera Arcade AR"
author: "Denis Pavăl Constantin"
lang: ro
---

**Ce este.** O aplicație web cu cinci jocuri de masă (zaruri, Piatră–Hârtie–Foarfecă, Nu te supăra frate, Jenga, X și 0) care apar prin camera telefonului pe masa reală. Merge din browser, fără instalare: [camera-arcade-ar.vercel.app](https://camera-arcade-ar.vercel.app). Codul este pe GitHub, în repo-ul [Ciokapick/camera-arcade-ar](https://github.com/Ciokapick/camera-arcade-ar). Se joacă singur, cu calculatorul, sau cu prietenii, pe baza unui cod de 4 litere.

**AR și inteligență ambientală.** Realitatea augmentată pune obiecte virtuale peste lumea reală, în timp real și fixate în 3D (Azuma, 1997). La mine, imaginea camerei e fundalul, iar telefonul își calculează la fiecare cadru poziția față de masă (SLAM), așa că tabla rămâne pe loc când mă mișc. Mâna reală e desenată peste obiectele virtuale, ca să pară că le ține. Inteligența ambientală înseamnă un mediu care observă oamenii și reacționează fără comenzi explicite (Weiser, 1991; ISTAG, 2001). Aplicația recunoaște masa, mâinile, gesturile și bancnotele și pornește singură anumite lucruri: runda de Piatră–Hârtie–Foarfecă începe când toți au mâna în cadru, jocul se așază singur dacă ții telefonul nemișcat, iar piesa de Jenga spre care duci degetele se colorează. Totul rulează pe telefon, imaginile nu pleacă nicăieri.

**Logica.** Regulile sunt separate de ce se vede pe ecran. Jucătorul trimite o acțiune („am dat cu zarul”), telefonul gazdei verifică regulile și trimite starea nouă tuturor, deci toți văd aceeași partidă. Zarurile cad cu fizică reală, dar valoarea e stabilită dinainte, ca să iasă la fel pe toate telefoanele. La Jenga, căderea o decid geometric (au piesele de sus sprijin?), pentru că fizica făcea turnul să cadă singur. Masa o găsesc ca planul orizontal pe care se adună cele mai multe puncte 3D. Bancnotele le recunosc cu o rețea neuronală, fiindcă după culoare ieșea corect o poză din zece.

**Mediu și librării.** JavaScript, HTML și CSS, fără compilare; Git și GitHub; publicare automată pe Vercel la fiecare push. Am 61 de teste automate în Node.js și am testat AR-ul cu Playwright, pe un telefon simulat, plus pe iPhone și Android. Librării: three.js (3D), cannon-es (fizică), 8th Wall și AlvaAR (urmărirea mesei), MediaPipe (mâini și bancnote), js-aruco2 (marker printat), PeerJS (conexiunea între telefoane).

**Plusuri.** Merge fără instalare, inclusiv pe iPhone; se joacă cu mâinile; multiplayer fără server propriu și fără conturi; codul e ușor de extins cu jocuri noi.

**Minusuri și ce nu merge încă.** Urmărirea din browser e mai puțin precisă decât într-o aplicație nativă, deci tabla mai alunecă pe o masă albă sau la mișcări bruște. Prinsul pieselor de Jenga cu mâna e încă greu (cu degetul pe ecran merge mai bine), iar recunoașterea mâinii scade în lumină slabă. Telefonul se încălzește. Multiplayerul depinde de gazdă și de serverul public PeerJS, iar gazda e considerată de încredere, deci trișatul nu e exclus. Am testat pe puține modele de telefoane.

**Direcții următoare.** Acces la ARKit pe iPhone sau o versiune nativă, pentru precizie; tabla în același loc pentru toți fără marker; comenzi vocale; jocuri noi (dame, șah); tutorial la prima pornire; reconectare când iese gazda.
