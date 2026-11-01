# Reguli pentru asistenți (Codex, Claude Code și alții)

Camera Arcade AR: laborator de Realitate Augmentată (master). Aplicație web statică (fără build), ES modules,
publicată pe Vercel la fiecare push pe `main`. Detalii: README.md și DOCUMENTATIE.md.

## Commit-uri — fără semnătură AI

- Autorul commit-urilor e omul (`Ciokapick <denpaval@gmail.com>`), nu un asistent.
- **Nu adăuga niciodată** `Co-Authored-By: Claude …`, `Claude-Session: …`, „Generated with …”, emoji de robot
  sau orice altă atribuire către un model/asistent — nici în commit-uri, nici în PR-uri sau tag-uri.

## Înainte de push

- `git pull` întâi: proiectul se lucrează și de pe telefon, și de pe calculator.
- `node --test tests/*.test.mjs` trebuie să treacă.
- AR fără telefon: `tools/ar-sim` (README acolo). Pe telefon: `?debug` în adresă arată panoul de diagnostic.

## Stil

- Comentariile și textele din aplicație sunt în română, cu diacritice; interfața urmează stilul existent
  (Inter, iconițe Phosphor prin Iconify, fără emoji).
- Bibliotecile vin din CDN cu versiune fixată (vezi import map-ul din index.html).
