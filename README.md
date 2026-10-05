# Camera Arcade AR

Două jocuri web care folosesc camera laptopului sau telefonului:

- **Zar AR**: două zaruri 3D realiste se rostogolesc peste imaginea camerei și afișează suma.
- **Zaruri pe masă (AR)**: întâi aplicația caută o suprafață plană, apoi zarurile cad pe ea cu fizică reală (cannon-es) și umbră.
  - Android + Chrome: WebXR hit-test (ARCore).
  - iPhone și restul: [AlvaAR](https://github.com/alanross/AlvaAR) (SLAM în WebAssembly, GPL-3.0) + giroscopul pentru orientarea mesei.
- **Piatra–Hârtie–Foarfecă**: doi jucători, MediaPipe urmărește două mâini; runda pornește singură când ambele mâini sunt în cadru.

## Rulare pe laptop

```bash
cd "Proiect/Camera-Arcade-AR"
python3 -m http.server 8080
```

Deschide `http://localhost:8080` în Chrome, Edge sau Safari și permite accesul la cameră.

## Rulare pe telefon

Camera browserului cere HTTPS. Publică folderul pe GitHub Pages, Netlify sau Vercel, deschide linkul HTTPS pe telefon și acceptă accesul la cameră. Nu trebuie instalată nicio aplicație.

Aplicația pornește implicit camera din spate a telefonului, utilă pentru zarul AR. Butonul **Schimbă camera** trece pe camera frontală, mai potrivită pentru piatră-hârtie-foarfecă.

## Limitări asumate

Clasificarea gesturilor recunoaște pozițiile clasice, cu palma spre cameră și mâna ținută relativ vertical. Dacă lumina este slabă sau gestul nu e complet în cadru, jocul cere reluarea gestului.

## Zaruri pe masă — calibrare și teste

Modul SLAM (iPhone) presupune camera principală a telefonului (~67° pe latura lungă) și ~45 cm de la telefon la masă. Dacă zarurile par să alunece sau sunt prea mari/mici, ajustează din URL:

- `?fov=70` — câmpul vizual al camerei, în grade, pe latura lungă
- `?dist=0.35` — distanța presupusă telefon → masă, în metri (scara zarurilor)

Pentru teste fără cameră: `?test-video=/cale/video.mp4` rulează modul SLAM pe un video înregistrat.
