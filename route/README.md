# Witcher 3 – mapa a cesta

Vlastná appka postavená nad forkom [tiva85/witcher3map](https://github.com/tiva85/witcher3map).
Vľavo je interaktívna mapa so všetkými 8 mapami, vpravo poradie questov podľa *Optimal Quest Order* a sledovanie rozhodnutí.

## Nasadenie na GitHub Pages
1. Na https://github.com/tiva85/witcher3map klikni na **Fork**. Vznikne `tvoj-ucet/witcher3map`.
2. Vo svojom forku daj **Add file → Upload files**, pretiahni celý priečinok `route` aj s obsahom a commitni.
3. Otvor **Settings → Pages → Build and deployment**. Ako Source nastav *Deploy from a branch*, vetvu `main` (alebo `master`) a priečinok `/ (root)`. Ulož.
4. Po minúte či dvoch appka beží na `https://tvoj-ucet.github.io/witcher3map/route/`.

Appka berie dlaždice a ikony z priečinka `files/` vo forku. Preto musí ležať v podpriečinku `route/` toho istého repa.

## Levely otáznikov
Do poľa **Môj level** v hlavičke zadaj level Geralta. Otázniky (guarded treasure, monster nest, monster den, bandit camp, abandoned site, person in distress) dostanú číslo a farbu:
zelená = v pohode, žltá = o 1–4 vyššie, červená = o 5+ vyššie (lebka v hre), sivá = 6+ pod tebou (málo XP).
V karte **Mapa** sa dá zapnúť *Len do môjho levelu +2* a mapa ukáže iba to, čo má zmysel robiť teraz.
Hearts of Stone oblasť má orientačne 32+, Toussaint 35+ (presné levely pre DLC otázniky zdroj nemá).

## Teraz (plánovač session)
Karta **Teraz**: vyber signpost, kde práve si (alebo *Bod na mape*), okruh a čo chceš robiť, a klikni *Naplánovať trasu*. Appka nájde v okolí questy z poradia, ktoré sú pre tvoj level na rade, otázniky do tvojho levelu +2, Places of Power a gwint (predajcovia a hráči), a zoradí ich do najkratšej trasy. Trasu nakreslí na mapu. Hotové veci odškrtávaš priamo v zozname.

## Varovanie pred zamknutím questov
Keď sa v poradí blížiš ku questu, po ktorom sa iný nedokončený quest zamkne (napr. The Isle of Mists), pod tlačidlom *Ďalej* sa objaví červený banner so zoznamom, čo treba stihnúť.
Úroveň pri questoch sa farbí podľa tvojho levelu rovnako ako otázniky; sivá prečiarknutá = quest dá už len zlomok XP.

## Zbierky: Gwint, Výbava, Places of Power
Karta **Zbierky** má tri časti:
- **Gwint** – viď nižšie. Predajcovia, ktorí neskôr zmiznú (napr. krčma vo White Orchard po *The Incident at White Orchard*), majú červené varovanie; v poradí questov sa pri queste, po ktorom zmiznú, objaví žltý pruh „Pred týmto questom kúp gwint karty“. Questy, v ktorých sa dajú vyhrať karty (High Stakes, A Dangerous Game…), majú v poradí zlatú pečať so zoznamom kariet.
- **Výbava** – diagramy zaklínačských škôl (scavenger hunts) podľa levelu. Vyber si školu a appka ukáže, čo ísť hľadať teraz a čo pri akom leveli ďalej.
- **Places of Power** – všetkých 29 na všetkých mapách s počítadlom. Každé prvé čerpanie = +1 skill point. Na mape majú modrý štítok +1, kým ich neoznačíš.

## Gwint a vlastné piny
Karta **Gwint** obsahuje 202 kariet (bez základného balíčka), roztriedené podľa predajcu, questu alebo náhodnej výhry. Na mape sú predajcovia ako ikona gwintu s počtom kariet, ktoré ti u nich ešte chýbajú. V popupe si karty odškrtávaš priamo.
Hráčov gwintu (vrstva *Gwent Player*) si po odohraní označíš pravým klikom.
**Vlastný pin:** pravý klik (na mobile podržanie) na prázdne miesto mapy, napíšeš poznámku a hotovo. Mažeš ho v jeho popupe. Piny sa ukladajú aj do zálohy.

## Postup a záloha
Hotové questy, hotové markery a rozhodnutia sa ukladajú v prehliadači (localStorage). Ak chceš postup preniesť medzi PC a mobilom, v karte **Mapa** klikni na *Stiahnuť zálohu postupu* a na druhom zariadení použi *Načítať zálohu*.

## Úpravy dát
- `data/decisions.json` obsahuje rozhodnutia (texty, možnosti, odporúčania) a dá sa editovať priamo.
- Poradie questov sa generuje z XLSX. Spúšťaj z koreňa repa (`build_quests.py` potrebuje openpyxl):
  ```
  node route/tools/extract_markers.js
  python route/tools/build_quests.py route/tools/quest_order.xlsx
  python route/tools/split.py
  python route/tools/match_levels.py   # vždy až po split.py, potrebuje scipy
  python route/tools/build_gwent.py route/tools/quest_order.xlsx
  ```
- Gwint: `build_gwent.py` číta hárok *Gwent Cards* a priraďuje karty k predajcom (tabuľka `VENDORS`) a questom (`QUESTS`). Nový predajca = nový riadok v tabuľke.
- Levely otáznikov sú v `tools/levels/*.txt` (kategória|región|signpost|level|smer). `match_levels.py` ich spáruje s markermi podľa najbližšieho signpostu a smeru a zapíše level priamo do `data/markers-*.json`.

## Lokálny test
V koreni repa spusti `python -m http.server` a otvor http://localhost:8000/route/

## Licencie a zdroje
- Mapa, dlaždice a markery: tiva85/witcher3map (untamed0, BaHTsIzBEdEvi a ďalší) pod licenciou **CC BY-NC-SA 4.0**. Použitie je len nekomerčné, s uvedením autorov a pod rovnakou licenciou.
- Poradie questov a poznámky: Witcher 3 Optimal Quest Order Guide (ChrisRi, xLetalis).
- Leaflet 1.9.4 (BSD-2).
- The Witcher 3, grafika a mapy © CD PROJEKT RED.
