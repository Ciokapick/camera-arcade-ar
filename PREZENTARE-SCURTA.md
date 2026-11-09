---
title: "Camera Arcade AR"
author: "Denis Pavăl Constantin · https://github.com/Ciokapick/camera-arcade-ar"
lang: ro
---

**Ce este.** O aplicație web cu cinci jocuri de masă (zaruri, Piatră–Hârtie–Foarfecă, Nu te supăra frate, Jenga, X și 0) care apar prin camera telefonului pe masa reală. Merge din browser, fără instalare: [camera-arcade-ar.vercel.app](https://camera-arcade-ar.vercel.app). Se joacă singur, contra calculatorului.

**AR și inteligență ambientală.** Realitatea augmentată adaugă obiecte virtuale peste lumea reală, în timp real, iar inteligența ambientală înseamnă un mediu care observă utilizatorul și reacționează singur, fără comenzi explicite. În aplicație, jocurile apar pe masa reală, iar telefonul recunoaște mâna și gesturile și pornește singur anumite acțiuni.

**Logica.** Regulile sunt separate de ce se vede pe ecran: jucătorul trimite o acțiune („am dat cu zarul”), regulile calculează starea nouă, iar scena 3D doar o afișează. Telefonul își calculează la fiecare cadru poziția față de masă (SLAM), așa că jocul rămâne pe loc când te miști. Masa e găsită ca planul orizontal pe care se adună cele mai multe puncte 3D. Mâna e recunoscută din cameră (21 de puncte pe mână) și e desenată peste obiectele virtuale. Zarurile cad cu fizică reală, dar valoarea e stabilită dinainte. La Jenga, căderea turnului e decisă geometric (au piesele de sus sprijin?), pentru că fizica făcea turnul să cadă singur.

**Mediu și librării.** JavaScript, HTML și CSS, fără compilare; Git și GitHub; publicare automată pe Vercel la fiecare push. Librării: three.js (3D), cannon-es (fizică), 8th Wall și AlvaAR (urmărirea mesei), MediaPipe (recunoașterea mâinii), js-aruco2 (marker printat).

**Testare.** Am 61 de teste automate în Node.js pentru regulile jocurilor, gesturi și găsirea mesei. Partea de AR am testat-o cu Playwright, fără telefon:

- Chromium rulează cu profil de telefon (Android), iar în loc de cameră primește un video generat de mine: o masă texturată, cu o cruce roșie în mijloc, filmată de o cameră care se mișcă lent, ca un telefon ținut în mână.
- Giroscopul și accelerometrul sunt simulați și se potrivesc exact cu mișcarea camerei din video, iar motorul AR (8th Wall) este cel real.
- Crucea roșie e „adevărul”: testul compară unde e ea în imagine cu unde desenează aplicația jocul. Așa am măsurat că masa e găsită în ~2 secunde, cu o eroare sub 1 cm.
- Pentru Jenga am simulat o mână (cele 21 de puncte) care țintește o piesă, o ciupește, o trage afară, o duce sus și îi dă drumul. Testul a trecut în 12 din 12 cazuri, pe 6 niveluri ale turnului, și a găsit trei erori pe care le-am corectat.
- Limită: fără placă video, simularea merge cu ~2 cadre pe secundă, așa că precizia reală se vede doar pe telefon (am testat pe iPhone și Android).

**Plusuri.** Merge fără instalare, inclusiv pe iPhone; se joacă cu mâinile; codul e ușor de extins cu jocuri noi.

**Minusuri și ce nu merge încă.** Urmărirea din browser e mai puțin precisă decât într-o aplicație nativă, deci tabla mai alunecă pe o masă albă sau la mișcări bruște. Prinsul pieselor de Jenga cu mâna e încă greu (cu degetul pe ecran merge mai bine), iar recunoașterea mâinii scade în lumină slabă. Telefonul se încălzește. Am testat pe puține modele de telefoane.

**Direcții următoare.** Acces la ARKit pe iPhone sau o versiune nativă, pentru precizie; tabla în același loc pentru toți fără marker; jocuri noi (dame, șah); tutorial la prima pornire.
