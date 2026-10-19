# Camera Arcade AR

Jocuri în realitate augmentată, direct în browser (iPhone, Android, laptop), singur sau cu prietenii:

- **Joc de zaruri**: două zaruri 3D cu fizică reală; pe rând, fiecare aruncă și vede imediat câte puncte a făcut; cine are mai multe ia runda (la egalitate aruncă din nou doar cei la egalitate). În AR zarurile îți apar în palmă: strângi pumnul, le agiți și deschizi mâna ca să le arunci pe masă. Pe ecran: dai cu degetul peste masă sau scuturi telefonul.
  - **Pe bani** (bonus, îl pornește gazda): fiecare își pune bancnota în fața camerei înainte să arunce; aplicația recunoaște bancnota (1–500 lei), câștigătorul rundei ia potul și se ține soldul fiecăruia.
- **Piatră–Hârtie–Foarfecă**: gestul e recunoscut din camera din spate (MediaPipe Hand Landmarker). Runda pornește singură când toți jucătorii au mâna în cadru, cu numărătoare 3–2–1 (bip și vibrație), iar gestul se arată pe „Acum!”. Singur pe telefon: o mână = tu contra calculatorului, două mâini = doi jucători. Deasupra fiecărei mâini plutește gestul ca obiect 3D (piatră, foaie, foarfecă), adversarul apare sus, iar la final obiectele se ciocnesc și cel învins se sparge.
- **Nu te supăra, frate**: 2–4 jucători, fiecare cu culoarea aleasă, tabla 3D pe masă. Zarul îl arunci din palmă; căsuțele unde poți muta sunt marcate, iar pionul îl iei tu (cu degetul pe ecran sau ciupit cu mâna) și îl pui pe căsuța marcată — lăsat în altă parte, se întoarce.
- **Jenga**: turn de 54 de piese pe masă; pe rând prinzi o piesă (cu degetul pe ecran sau, în AR, între degetul mare și arătător), o scoți și o duci tu sus pe turn; cine dărâmă turnul pierde. Dacă tragi prea repede, turnul se clatină și riscul crește. Stabilitatea se calculează geometric (centrul de greutate față de zona de sprijin a fiecărui nivel) plus un risc care crește cu fiecare nivel șubrezit; prăbușirea e simulată fizic.
- **X și 0**: clasic, 3×3, tabla pe masă. În AR pui degetul real pe o căsuță și îl ții o clipă.

## Cum se joacă

1. La pornire apeși **Pornește camera** (aplicația merge doar cu camera — AR), apoi, prima dată, îți scrii numele.
2. **Creează cameră** → primești un cod de 4 litere; prietenii apasă **Intră cu un cod** și îl scriu. Fără cameră joci pe telefonul tău, cu calculatorul (**+ Calculator**).
3. Gazda alege jocul; toți intră automat în el.
4. Jocul se deschide direct **pe masa ta**; din butonul cu cubul (sus) poți alege:
   - **Pe masa mea** — aplicația caută întâi o suprafață plană, apoi atingi unde vrei tabla/zarurile. Merge oriunde, fiecare pe masa lui (inclusiv cei care nu sunt în aceeași cameră).
   - **Pe markerul comun** — pentru cei din aceeași cameră: pui pe masă [markerul](marker.html) (printat sau pe o tabletă) și tabla apare exact pe el, **în același loc pentru toți**.

## Cum e făcut

Explicat pe larg, pas cu pas: [DOCUMENTATIE.md](DOCUMENTATIE.md).

| Fișier | Ce face |
|---|---|
| `ludo.js` | regulile „Nu te supăra, frate” |
| `game.js` | starea camerei de joc (lobby, zaruri, PHF, Ludo, calculatorul) — reducer pur |
| `net.js` | multiplayer fără server propriu: PeerJS (WebRTC); gazda ține starea și o trimite tuturor |
| `dice.js` | zaruri cu fizică (cannon-es); valoarea e decisă de cel care aruncă, animația o respectă pe toate telefoanele |
| `board.js` | tabla 3D, pionii animați pas cu pas |
| `jenga.js`, `jenga-view.js` | regulile și stabilitatea turnului / turnul 3D, tragerea și prăbușirea |
| `xo.js`, `xo-view.js` | regulile și calculatorul / tabla 3×3 |
| `ar.js` | scena: ecran / WebXR (Android) / AlvaAR SLAM + giroscop (iPhone) / marker ArUco (js-aruco2) |
| `hands.js` | recunoașterea mâinilor și a gestului |
| `ar.js` → `makeHand` | mâna reală în scena AR: raze 3D prin degete, distanța estimată din mărimea palmei, ciupit |
| `rps-ar.js` | obiectele 3D de la piatră–hârtie–foarfecă și ciocnirea |
| `sound.js` | sunete sintetizate, vibrație, confetti |
| `banknotes.js`, `banknote-refs.json` | recunoașterea bancnotelor: rețea neuronală (MediaPipe Image Embedder) + cel mai apropiat vecin |
| `app.js`, `index.html` | interfața (Inter + iconițe Phosphor prin Iconify) |

Biblioteci (din CDN): three.js, cannon-es, PeerJS, MediaPipe Tasks Vision, [AlvaAR](https://github.com/alanross/AlvaAR) (GPL-3.0), js-aruco2.

### Recunoașterea bancnotelor

Imaginea din chenar trece printr-o rețea neuronală (MobileNet v3 din MediaPipe Image Embedder) care o transformă într-o „amprentă” de 1024 de numere; o comparăm (cosinus) cu amprentele bancnotelor cunoscute și alegem cea mai apropiată. Amprentele din `banknote-refs.json` sunt calculate din scanările bancnotelor românești de pe Wikimedia Commons (domeniu public), față și verso, câte 4 variante (normal, mai întunecat, întors, ușor mărit). În aplicație poți adăuga și amprentele bancnotelor tale („Învăț bancnota”).

Măsurat: 10/10 pe fotografii reale (5, 10, 50, 100 lei — pe masă, din teanc) și 111/112 pe scanări cu perspectivă, lumină slabă/caldă, blur, fundal de lemn și decupaj. Ce nu e bancnotă (mâini, masa goală) iese cu scor 0.08–0.12 față de 0.6–0.85 la bancnote, de aici pragul de 0.4. Doar după culoare nu merge (1/10 pe fotografii reale).

## Teste

```bash
node --test tests/*.test.mjs
```

Regulile tuturor jocurilor, camera de joc (inclusiv partide întregi jucate de calculator), stabilitatea turnului Jenga și clasificarea gesturilor. Testul de prăbușire Jenga descarcă o dată cannon-es în `tests/.cache`.

## Calibrare AR (din URL)

- `?fov=70` — câmpul vizual al camerei pe latura lungă, în grade (implicit 67, camera principală de telefon)
- `?dist=0.35` — distanța presupusă telefon → masă în modul „Pe masa mea”, în metri (scara)
- `?marker=0.15` — latura pătratului negru al markerului printat, în metri
- `?screen` — vedere 3D fără cameră (doar pentru dezvoltare și teste; nu apare în aplicație)
- `?test-video=/cale/video.mp4` — rulează AR-ul / PHF pe un video înregistrat în loc de cameră (pentru teste)

Camera browserului cere HTTPS (sau localhost).
