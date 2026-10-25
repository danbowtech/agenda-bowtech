# Agenda Bowtech

Agendă personală pentru ședințele Bowtech, ca aplicație web instalabilă pe telefon (PWA):

- programări pe zi și pe săptămână, cu propunerea automată a ședinței următoare;
- fișe de clienți și istoricul ședințelor;
- pentru fiecare ședință: procedurile efectuate, reacțiile clientului, starea după ședință, data ședinței următoare;
- comenzi vocale în limba română;
- date criptate pe telefon (AES-256-GCM, cheie protejată de parolă cu PBKDF2) și copie de siguranță criptată într-un depozit privat GitHub;
- funcționează și fără internet (în afară de recunoașterea vocii și copia de siguranță).

**Instalare și folosire: vezi [GHID.md](GHID.md).**

## Pentru programatori

Fără dependențe și fără pas de compilare: fișierele se publică exact cum sunt (de exemplu pe GitHub Pages).

```
index.html, sw.js, manifest.webmanifest
css/app.css
js/app.js       interfața
js/parser.js    interpretarea comenzilor vocale
js/model.js     structura datelor, îmbinarea versiunilor
js/store.js     starea în memorie, salvarea, sincronizarea
js/crypto.js    criptarea
js/github.js    copia de siguranță prin API-ul GitHub
js/voice.js     recunoașterea și sinteza vocii
js/bio.js       deblocarea cu amprenta (WebAuthn PRF)
```

Testele (Node 20+):

```
npm test
```

Când modifici fișierele aplicației, crește `VERSION` din `sw.js`, ca telefoanele să primească noua versiune.
