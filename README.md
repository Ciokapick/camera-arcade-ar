# Camera Arcade AR

Jocuri în realitate augmentată, direct în browser (iPhone, Android, laptop), singur sau cu prietenii:

- **Barbut**: doi zari 3D cu fizică reală; pe rând, cea mai mare sumă ia runda (la egalitate aruncă din nou doar cei la egalitate).
- **Piatră–Hârtie–Foarfecă**: gestul e recunoscut din cameră (MediaPipe Hand Landmarker). Runda pornește singură când toți jucătorii au mâna în cadru. Singur pe telefon: doi jucători, câte o mână.
- **Nu te supăra, frate**: 2–4 jucători, fiecare cu culoarea aleasă, tabla 3D pe masă.
- **Jenga**: turn de 54 de piese pe masă; pe rând tragi o piesă, ea urcă sus; cine dărâmă turnul pierde. Stabilitatea se calculează geometric (centrul de greutate față de zona de sprijin a fiecărui nivel) plus un risc care crește cu fiecare nivel șubrezit; prăbușirea e simulată fizic.
- **X și 0 3D**: cub de 4×4×4 (76 de linii posibile) — patru în linie pe orice direcție, inclusiv prin niveluri și pe diagonalele cubului.

## Cum se joacă

1. La prima intrare îți scrii numele.
2. **Creează cameră** → primești un cod de 4 litere; prietenii apasă **Intră** și scriu codul. Fără cameră joci pe telefonul tău, cu calculatorul (**+ Calculator**).
3. Gazda alege jocul; toți intră automat în el.
4. Alegi unde stă jocul:
   - **📱 Ecran** — vedere 3D, fără AR.
   - **🪑 Pe masa mea** — aplicația caută întâi o suprafață plană, apoi atingi unde vrei tabla/zarurile. Merge oriunde, fiecare pe masa lui (inclusiv cei care nu sunt în aceeași cameră).
   - **🎯 Marker comun** — pentru cei din aceeași cameră: pui pe masă [markerul](marker.html) (printat sau pe o tabletă) și tabla apare exact pe el, **în același loc pentru toți**.

## Cum e făcut

| Fișier | Ce face |
|---|---|
| `ludo.js` | regulile „Nu te supăra, frate” |
| `game.js` | starea camerei de joc (lobby, barbut, PHF, Ludo, calculatorul) — reducer pur |
| `net.js` | multiplayer fără server propriu: PeerJS (WebRTC); gazda ține starea și o trimite tuturor |
| `dice.js` | zaruri cu fizică (cannon-es); valoarea e decisă de cel care aruncă, animația o respectă pe toate telefoanele |
| `board.js` | tabla 3D, pionii animați pas cu pas |
| `jenga.js`, `jenga-view.js` | regulile și stabilitatea turnului / turnul 3D, tragerea și prăbușirea |
| `xo.js`, `xo-view.js` | cele 76 de linii, calculatorul / cubul de sticlă |
| `ar.js` | scena: ecran / WebXR (Android) / AlvaAR SLAM + giroscop (iPhone) / marker ArUco (js-aruco2) |
| `hands.js` | recunoașterea mâinilor și a gestului |
| `app.js`, `index.html` | interfața |

Biblioteci (din CDN): three.js, cannon-es, PeerJS, MediaPipe Tasks Vision, [AlvaAR](https://github.com/alanross/AlvaAR) (GPL-3.0), js-aruco2.

## Teste

```bash
node --test tests/*.test.mjs
```

Regulile tuturor jocurilor, camera de joc (inclusiv partide întregi jucate de calculator), stabilitatea turnului Jenga și clasificarea gesturilor. Testul de prăbușire Jenga descarcă o dată cannon-es în `tests/.cache`.

## Calibrare AR (din URL)

- `?fov=70` — câmpul vizual al camerei pe latura lungă, în grade (implicit 67, camera principală de telefon)
- `?dist=0.35` — distanța presupusă telefon → masă în modul „Pe masa mea”, în metri (scara)
- `?marker=0.15` — latura pătratului negru al markerului printat, în metri
- `?test-video=/cale/video.mp4` — rulează AR-ul / PHF pe un video înregistrat în loc de cameră (pentru teste)

Camera browserului cere HTTPS (sau localhost).
