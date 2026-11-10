Si skúsený QA tester, performance inžinier a copywriter v jednom. Otestuj webovú aplikáciu **X-Ray — Financial Reporting Engine** na adrese:

**URL:** https://rievoree-ukazka.vercel.app  (ak ti dám inú adresu – preview – použi tú)

Je to portfóliový projekt: finančný reporting pre skupinu štyroch nehnuteľnostných firiem (kancelárie, retail, byty, logistika). Cieľové publikum: **CFO / controller / asset manager** realitnej skupiny a **hiring manager**, ktorý posudzuje autorku ako data / full-stack inžinierku. Celý report napíš **po slovensky**.

## Pravidlá
- **Zdieľaný demo účet:** je len na čítanie, takže zápisy tam majú zlyhať. Nie je to chyba, iba ak je chybová hláška nezrozumiteľná.
- **Formuláre:** nič neodosielaj opakovane. Kontaktný / lead formulár na úvodnej stránke odošli najviac raz, s e-mailom `qa-test@example.com`.
- **Registrácia:** vytvor si vlastný účet s e-mailom `qa-<dnešný dátum>@example.com`, heslom podľa pravidiel stránky, rolou **Admin** a dátami **Demo data**. Ak registrácia vyžaduje potvrdenie e-mailom, zastav sa a napíš to do reportu.
- **Žiadne útoky:** nerob bezpečnostné útoky ani záťažové testy. Nemeň nastavenia demo účtov.
- **Dôkazy:** pri každom probléme uveď presnú stránku, kroky na zopakovanie a doslovný citát textu alebo popis toho, čo vidíš.

## 1. Neprihlásený návštevník
- Úvodná stránka (aj animácia „roztrhnutého papiera“), O nás, Prihlásenie, Registrácia, Zabudnuté heslo.
- Šírka okna **1440 px** a **390 px** (mobil). Hľadaj prekrývanie, vodorovný posun, orezaný text a tlačidlá, ktoré nereagujú.
- Je do 5 sekúnd jasné, čo to je, pre koho to je a čo mám kliknúť?

## 2. Demo (tlačidlo „Demo“)
- Prejdi všetky stránky: Dashboard, P&L, Rent roll, AR / AP, Budget flow, Forecast, Journal. Vyskúšaj filtre (nehnuteľnosť, obdobie), rozbaľovanie riadkov a grafy (hover).
- Prepni rolu v hlavičke (čip „viewer · demo“): Viewer → Manager → Admin. Over, že pribudnú Ingest, Connectors a Users. Na mobile to sprav cez menu ☰.
- **X-RAY panel**, všetky záložky:
  - **CALLS:** ukazuje časy API volaní, použi ich pri hodnotení rýchlosti.
  - **RLS:** „Run as …“ a „Use app as …“.
  - **PIPELINE, SQL, CODE, ARCH.**
  - Tlačidlo **X-RAY CODE** (inspect mód).
- **Sprievodca („Take the tour“):** prejdi ho celý v režime Auto aj ručne. Zastaví sa niekde? Prekrýva bublina to, čo vysvetľuje?
- **Connectors ako Manager:** pri „Facility costs — shared spreadsheet“ daj **Sync now**. Má sa objaviť náhľad riadkov, bez zápisu.

## 3. Vlastný prihlásený účet
- Over, že registrácia prejde a pristaneš na Dashboarde s dátami a že Journal sa naplní do minúty.
- **Account:** pridaj druhú firmu (Demo data), premenuj ju a zmaž.
- **Ingest:** stiahni šablónu CSV a nahraj ju. Prejdi kontrolu dávky (označené riadky, z-score), schváľ ju a over, že čísla sa prejavia v reportoch.
- **Connectors:** pridaj **Spreadsheet link** cez „Use the sample sheet“, daj Sync now a schváľ dávku na Ingest. Druhé Sync now má napísať „No change“.
- Vyskúšaj aj odkaz na vlastný Google Sheet zdieľaný ako „Anyone with the link“ a odkaz na nezdieľaný sheet. Pri nezdieľanom má prísť zrozumiteľná chyba.
- **Users:** pozvánka a role. Ukazuje stránka len tvoju firmu?

## 4. Rýchlosť a optimalizácia
Na každej hlavnej stránke (úvodná, Dashboard, P&L, Journal, Connectors) najprv sprav tvrdý refresh. Potom do konzoly vlož tento skript a výsledky daj do tabuľky:

```js
(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const res = performance.getEntriesByType('resource')
  const kb = (b) => Math.round(b / 1024)
  const js = res.filter(r => r.initiatorType === 'script' || r.name.endsWith('.js'))
  const api = res.filter(r => /supabase\.co\//.test(r.name))
  let lcp = 0; new PerformanceObserver(l => { const e = l.getEntries(); lcp = e[e.length - 1]?.startTime ?? lcp }).observe({ type: 'largest-contentful-paint', buffered: true })
  let cls = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) cls += e.value })).observe({ type: 'layout-shift', buffered: true })
  let longTasks = 0; new PerformanceObserver(l => longTasks += l.getEntries().length).observe({ type: 'longtask', buffered: true })
  setTimeout(() => console.table({
    'TTFB ms': Math.round(nav.responseStart),
    'DOMContentLoaded ms': Math.round(nav.domContentLoadedEventEnd),
    'load ms': Math.round(nav.loadEventEnd),
    'LCP ms': Math.round(lcp),
    'CLS': cls.toFixed(3),
    'long tasks (>50 ms)': longTasks,
    'requests': res.length,
    'JS files / KB transferred': `${js.length} / ${kb(js.reduce((s, r) => s + (r.transferSize || 0), 0))}`,
    'API calls': api.length,
    'slowest API ms': Math.round(Math.max(0, ...api.map(r => r.duration))),
    'total KB transferred': kb(res.reduce((s, r) => s + (r.transferSize || 0), 0)),
  }), 1500)
})()
```

Zapíš aj:
- čas, kým zmizne „loading…“ a ukážu sa dáta (stopkami alebo podľa záložky CALLS v X-ray);
- či sa navigácia medzi stránkami zdá okamžitá;
- či niečo pri scrollovaní alebo animáciách seká;
- červené chyby v konzole a neúspešné požiadavky (status 400 a vyššie).

Odporuč konkrétne optimalizácie (veľké súbory, zbytočné požiadavky, obrázky a video, fonty, lazy loading) a zoraď ich podľa prínosu.

## 5. Texty: dávajú zmysel, alebo je to „AI slop“?
Prečítaj všetky viditeľné texty: úvodnú stránku, úvody stránok, popisky grafov, kroky sprievodcu, prázdne stavy, chybové hlášky, e-maily ak nejaké prídu a O nás. Pri každom texte posúď:
- **Je konkrétny a pravdivý?** Sedia čísla na úvodnej stránke s tým, čo ukazuje Dashboard?
- **Má znaky AI textu?** Napríklad:
  - prázdne frázy („seamless“, „unlock“, „powerful“, „revolutionize“),
  - trojice prídavných mien,
  - kontrast „nie X, ale Y“,
  - pomlčky všade,
  - jednovetové pointy,
  - prehnané sľuby,
  - dlhé vety bez informácie.
- **Rozumie mu CFO realitnej skupiny?** Používa správne pojmy (NOI, DSCR, LTV, WALT, rent roll, aging) a vysvetľuje ich tam, kde treba?
- **Zaujme hiring managera?** Ukazuje, čo autorka reálne postavila?
- **Je jazyk konzistentný?** Hľadaj miešanie slovenčiny a angličtiny (napr. v menu úvodnej stránky), preklepy a nejednotné názvy.

Pri každom probléme navrhni **konkrétne prepísané znenie** (anglicky, ako je zvyšok stránky).

## Formát reportu
1. **Zhrnutie** na 5 až 8 viet a **skóre 1 až 10** pre: prvý dojem, použiteľnosť, rýchlosť, mobil, texty, dôveryhodnosť pre klienta.
2. **Top 10 problémov** podľa priority. Pri každom: závažnosť (kritické / vysoké / stredné / nízke), kde, kroky na zopakovanie, čo vidíš, ako to opraviť.
3. **Tabuľka rýchlosti** po stránkach (hodnoty zo skriptu a čas do dát) a zoznam odporúčaných optimalizácií.
4. **Tabuľka textov:** pôvodný text → čo je zlé → navrhované znenie.
5. **Rýchle výhry:** zmeny na menej ako hodinu, ktoré najviac zvýšia dojem u klienta.
6. **Čo funguje dobre:** veci, ktoré nemeniť.
