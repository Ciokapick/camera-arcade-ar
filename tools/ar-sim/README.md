# Simulatorul de telefon pentru AR

Testează aplicația cap-coadă fără telefon: Chromium cu profil de telefon, o cameră falsă care „filmează” o masă
randată (cu o cruce roșie în origine = adevărul), senzori simulați (giroscop, accelerometru, orientare) potriviți
exact cu mișcarea camerei, și motorul 8th Wall real.

```bash
tools/ar-sim/setup.sh                       # o dată: bibliotecile din npm + video-ul (render.py, ~30 s)
python3 -m http.server 8123 &               # din rădăcina proiectului
GAME=xo SECS=110 POSE=1 node tools/ar-sim/run.js   # AR: starea, masa găsită, crucea vs. jocul pe ecran
node tools/ar-sim/jenga-hand.js             # mâna simulată la Jenga: țintește, ciupește, trage, duce sus, dă drumul
```

`run.js` scrie la fiecare secundă: starea (`found` / `placed`), masa estimată (`stats.table`: înălțime, câte puncte),
unde e crucea roșie în imagine și unde desenăm jocul. După plasare, diferența dintre ele (`offset`) ar trebui să
rămână constantă; dacă se schimbă, jocul alunecă față de masă.

Limită: fără GPU, browserul procesează ~2 cadre/s, așa că video-ul și senzorii sunt redați de 20× mai încet
(`SLOW` în `imu.js`, `F3:2` în `render.py`). Recunoașterea mesei și logica jocurilor se verifică bine așa;
cât de bine urmărește 8th Wall la 30 de cadre/s se vede doar pe un telefon adevărat.
