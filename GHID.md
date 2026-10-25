# Agenda Bowtech – ghid de instalare și folosire

Agenda ta pentru ședințele Bowtech: programări, fișele clienților, notițe pentru fiecare ședință și comenzi vocale în română. Merge pe telefonul cu Android ca o aplicație obișnuită, cu iconiță pe ecran.

Tot ce folosește aplicația este **gratuit**:

- **GitHub Pages** găzduiește aplicația (adresa ei de internet).
- Un **depozit privat GitHub** păstrează copia de siguranță, criptată.
- **Google Chrome** recunoaște vocea în română.
- **Google Calendar** (opțional) îți trimite mementouri.

> Paginile GitHub sunt în engleză. Mai jos, numele butoanelor sunt scrise *exact cum apar pe ecran*, cu explicația în română.

---

## Pasul 1. Fă-ți cont pe GitHub (pe calculator)

1. Deschide <https://github.com/signup>.
2. Scrie adresa de e-mail, o parolă și un nume de utilizator (de exemplu `ion-bowtech`). **Notează numele de utilizator**, îți trebuie mai târziu.
3. Confirmă adresa de e-mail cu codul primit pe e-mail.

## Pasul 2. Publică aplicația (pe calculator)

0. Dacă ai primit aplicația ca arhivă `agenda-bowtech.zip`: fă click dreapta pe ea și alege **Extragere totală** (*Extract All*), apoi **Extragere**. Apare folderul `agenda-bowtech`.
1. Deschide <https://github.com/new>.
2. La **Repository name** scrie `agenda`.
3. Alege **Public**. (Aici e doar aplicația, fără nicio dată despre clienți.)
4. Apasă butonul verde **Create repository**.
5. Pe pagina care apare, apasă pe linkul **uploading an existing file**.
6. Deschide folderul `agenda-bowtech` pe calculator, selectează **tot ce e înăuntru** (Ctrl+A) și trage fișierele în pagina GitHub. Trebuie să vezi `index.html`, `sw.js`, `manifest.webmanifest` și folderele `css`, `js`, `icons`.
7. Jos apasă butonul verde **Commit changes** și așteaptă să se termine încărcarea.
8. Sus, apasă **Settings** (rotița). În stânga apasă **Pages**.
9. La **Branch** alege `main`, lângă el lasă `/ (root)` și apasă **Save**.
10. Așteaptă 1–2 minute și reîncarcă pagina. Sus apare: **Your site is live at** `https://NUMELE-TĂU.github.io/agenda/`. Aceasta este adresa aplicației tale.

## Pasul 3. Instalează aplicația pe telefon

1. Pe telefon deschide **Google Chrome** și scrie adresa de la pasul 2 (`https://NUMELE-TĂU.github.io/agenda/`).
2. Apasă meniul **⋮** (sus, în dreapta) și alege **Instalează aplicația** sau **Adaugă pe ecranul de pornire**.
3. Pe ecranul telefonului apare iconița **Agenda**. De acum deschizi aplicația de acolo.

## Pasul 4. Prima pornire

1. Apasă **Încep o agendă nouă**.
2. Alege o parolă de cel puțin 8 caractere.

> **Foarte important:** parola nu poate fi recuperată de nimeni. Fără ea datele nu se mai pot deschide, nici de pe telefon, nici din copia de siguranță. **Scrie parola pe o hârtie** și păstreaz-o într-un loc sigur.

3. Dacă telefonul are amprentă, poți porni din **Setări → Siguranță** deschiderea agendei cu amprenta, ca să nu scrii parola de fiecare dată. Pe unele telefoane această funcție nu este disponibilă; atunci folosești parola.

## Pasul 5. Pornește copia de siguranță (o singură dată, durează 5 minute)

Copia de siguranță te ajută dacă telefonul se strică sau se pierde. Aplicația face singură o copie criptată a agendei, la câteva secunde după fiecare modificare, într-un depozit **privat** din contul tău GitHub. Fără parola agendei, nimeni nu poate citi copia, nici GitHub.

Pașii de mai jos se fac cel mai ușor **pe telefon, în Chrome** (ca să poți copia și lipi tokenul). Intră în contul GitHub în Chrome dacă nu ești deja.

### a) Depozitul privat

1. Deschide <https://github.com/new>.
2. La **Repository name** scrie `agenda-date`.
3. Alege **Private**. Verifică de două ori: trebuie să fie **Private**.
4. Bifează **Add a README file**.
5. Apasă **Create repository**.

### b) Tokenul (o „cheie” care îi dă voie aplicației să scrie doar în acest depozit)

1. Deschide <https://github.com/settings/personal-access-tokens/new>.
2. **Token name**: `Agenda Bowtech`.
3. **Expiration**: alege cea mai lungă perioadă din listă (de exemplu 1 an). Când expiră, aplicația îți spune și faci un token nou, la fel.
4. **Repository access**: alege **Only select repositories**, apoi din listă alege `agenda-date`.
5. La **Permissions**, deschide **Repository permissions**, găsește **Contents** și alege **Read and write**.
6. Jos apasă **Generate token**, apoi confirmă.
7. Copiază tokenul (începe cu `github_pat_`). Pagina ți-l arată **o singură dată**.

### c) În aplicație

1. Deschide **Setări → Copie de siguranță în GitHub**.
2. Scrie numele tău de utilizator GitHub, lasă numele depozitului `agenda-date` și lipește tokenul.
3. Apasă **Pornește copia de siguranță**.

Gata. Iconița cu norișor din bara de sus îți arată starea copiei:

| Semn | Ce înseamnă |
|---|---|
| ✓ verde | copia este la zi |
| punct portocaliu | sunt modificări care se copiază în câteva secunde |
| ! roșu | e o problemă; apasă pe norișor ca să vezi ce |
| norișor tăiat | copia nu este pornită |

În plus, aplicația păstrează **câte o versiune pe zi pentru ultimele 14 zile** (Setări → Versiuni anterioare). Dacă ai șters ceva din greșeală, poți readuce agenda cum era într-o zi anume.

Mai poți salva oricând un **fișier cu copia** (Setări → Copie într-un fișier) în Google Drive sau pe e-mail. Și fișierul este criptat cu parola agendei.

## Dacă se strică sau se pierde telefonul

1. Pe telefonul nou fă **Pasul 3** (instalezi aplicația de la aceeași adresă).
2. Alege **Am deja o copie de siguranță** → **Din GitHub**.
3. Scrie numele de utilizator GitHub, numele depozitului (`agenda-date`), un token (dacă nu-l mai ai, fă unul nou ca la Pasul 5 b) și **parola agendei**.

Toți clienții și toate ședințele revin pe telefon.

---

## Cum se folosește

### Bara de jos

- **Agenda**: ședințele pe zi sau pe săptămână. Apasă pe o zi din bandă ca s-o deschizi.
- **Clienți**: lista clienților, cu căutare.
- **Microfonul** din mijloc: comenzi vocale.
- **Programare**: programare nouă (alegi clientul sau scrii un nume nou).
- **Setări**.

### O ședință

Apasă pe o ședință ca s-o deschizi. Acolo:

- schimbi data, ora, durata;
- o marchezi **Programată / Efectuată / Anulată**;
- bifezi **procedurile efectuate** (lista se schimbă din Setări);
- scrii **reacțiile clientului în timpul ședinței**, **starea după ședință** și alte notițe. Butonul mic de microfon de lângă fiecare câmp te lasă să dictezi;
- la **Ședința următoare**, aplicația propune singură data (implicit după 7 zile, se schimbă din Setări). Apeși **Programează ședința următoare** și gata;
- **Adaugă în Google Calendar** pune ședința în calendarul telefonului, care te anunță înainte (cel mai sigur memento).

Totul se salvează automat, nu trebuie să apeși „Salvează”.

### Comenzi vocale

Apasă microfonul din mijloc și vorbește. Aplicația îți arată ce a înțeles și **nu schimbă nimic până nu apeși Confirmă**. După fiecare modificare apare butonul **Anulează**, dacă te-ai răzgândit.

| Ce vrei | Ce spui |
|---|---|
| Programare | „Programează-o pe Maria Popescu marți la ora 10” |
| | „Programează-l pe Ion mâine la trei și jumătate” |
| | „Programează-o pe Ana pe 5 noiembrie la 9 dimineața” |
| | „Programează următoarea ședință pentru Ana” (alege singură ziua) |
| Întrebări | „Ce ședințe am mâine?” |
| | „Ce programări am săptămâna aceasta?” |
| | „Cine vine vineri?” |
| | „Când vine Maria?” |
| Notițe | „Notează la Ion: durerea de spate s-a ameliorat” |
| | „Notează la Maria reacții: a simțit căldură în zona lombară” |
| | „Notează la Ana starea după: se simte relaxată” |
| Mutări | „Mută ședința de la ora 15 pe joi” |
| | „Mută ședința Mariei pe vineri la 11” |
| | „Amână ședința lui Ion cu o zi” |
| Anulări | „Anulează ședința de mâine a lui Ion” |
| Fișa clientului | „Deschide fișa Mariei” |

Bine de știut:

- „La 3”, „la 5” etc. înseamnă după-amiaza (15:00, 17:00). Pentru dimineață spune „la 7 dimineața”.
- Notițele merg la ședința de azi a clientului (sau la ultima lui ședință). Dacă nu are nicio ședință, merg în fișa lui.
- Recunoașterea vocii are nevoie de internet. Restul aplicației merge și fără internet.
- Dacă microfonul nu merge, poți scrie comanda în căsuța de sub microfon.

### Siguranța datelor

- Datele sunt **criptate** pe telefon (AES-256), cu cheia protejată de parola ta.
- Agenda **se blochează singură** după câteva minute în care n-o folosești (se schimbă din Setări).
- Copia din GitHub este tot criptată, iar depozitul este privat.
- Parola nu pleacă niciodată de pe telefon.

---

## Întrebări

**Copia de siguranță arată „!” roșu.**
Apasă pe norișor ca să vezi mesajul. Cel mai des, tokenul a expirat: fă unul nou (Pasul 5 b) și pune-l în Setări după ce apeși **Deconectează**.

**Am uitat parola.**
Nu se poate recupera. Dacă ai parola scrisă pe hârtie, folosește-o. Altfel datele nu mai pot fi deschise.

**Vreau mementouri.**
Cel mai sigur: după fiecare programare apasă **Pune în Calendar**. Google Calendar te anunță chiar dacă aplicația e închisă. Notificările din Setări apar doar dacă aplicația a fost deschisă recent.

**Pot folosi agenda și pe calculator?**
Da, deschide aceeași adresă în Chrome pe calculator, alege **Am deja o copie de siguranță → Din GitHub** și scrie datele. Cele două se sincronizează prin copia din GitHub.

**Cum actualizez aplicația dacă primesc fișiere noi?**
Intră în depozitul `agenda` pe GitHub, apasă **Add file → Upload files**, trage fișierele noi și apasă **Commit changes**. Pe telefon apare mesajul „Există o versiune nouă a aplicației” → **Actualizează**. Datele nu se pierd.
