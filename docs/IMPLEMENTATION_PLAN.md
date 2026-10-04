# Bestcrow: specyfikacja MVP i plan wdrożenia

Stan dokumentu: 4 października 2026. Ten plik opisuje **cel i zadania**, a nie
funkcje już działające. Punktem odniesienia dla inwentaryzacji jest commit
`15cb14a`. Kod, testy i wdrożenie muszą zostać ponownie sprawdzone po zmianach.

## Źródła i granica zaufania

- Najnowsze decyzje użytkownika: startupy/prototypy, SOL, 2-5 transz, 1%
  prowizji po sukcesie oraz 0,1 SOL kaucji twórcy. Starsze propozycje 70%,
  pięciu obowiązkowych etapów, tygodnia poprawy i braku prowizji są nieaktualne.
- [Kryteria konkursu](CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf),
  s. 2, sekcja 2: reguły mają być zapisane w programie i wykonywane jednakowo,
  bez możliwości jednostronnej zmiany; s. 3, sekcja 5 wymaga, aby logika zastępująca
  pośrednika działała on-chain, a nie w backendzie. Sekcja 6 pyta o uprawnienia
  do aktualizacji programu i działanie po zniknięciu jednej ze stron.
- [Regulamin](RULES%20Finance%20Without%20Intermediaries.pdf), s. 2, pkt 13
  wyklucza późniejsze zmiany z oceny. Nie ogłaszać protokołu gotowym przed
  testami, aktualnym wdrożeniem i demonstracją transakcji.
- Backend może przechowywać profile, nagrody i indeks, ale nie może decydować o
  możliwości utworzenia kampanii on-chain, wyniku głosowania, prowizji, wypłacie
  ani zwrocie. Nie dodawać podpisu platformy ani weryfikacji twórców jako
  warunku dopuszczenia do MVP.

## Wiążące reguły docelowego MVP

1. **Jeden typ kampanii:** startupowa kampania etapowa w SOL. Obecny prosty tryb
   `create_campaign` jest zachowany tylko jako stan zastany do migracji; nie
   powinien być oferowany w docelowym UI. Rejestracja profilu na stronie nie jest
   uprawnieniem do wykonania instrukcji on-chain.
2. **Szkic i zamknięcie warunków:** twórca może przygotować szkic, lecz przed
   pierwszą wpłatą zatwierdza cały harmonogram i uruchamia finansowanie.
   Do finansowanej kampanii nie wolno dodawać etapów ani zmieniać celu,
   procentów, terminów, odbiorcy, prowizji lub zasad zwrotu. Każda wpłata odnosi
   się do tej samej wersji warunków i hasha publicznie dostępnego opisu.
3. **Czas i alokacja:** okno zbiórki wynosi od 7 do 183 dni (183 dni to robocza,
   deterministyczna definicja pół roku). Kampania ma 2-5 transz łącznie z
   pierwszą transzą startową. Każda transza ma dodatni udział <= 5000 bps,
   a suma udziałów wynosi dokładnie 10000 bps. Terminy realizacji etapów są
   ustalone przed finansowaniem jako deterministyczne okresy od aktywacji
   etapu; okno poprawy przesuwa następne etapy według tej samej reguły.
4. **Wpłaty:** można wpłacić ponad cel aż do końca zbiórki. W czasie zbiórki
   backer może anulować i odebrać całą aktualną wpłatę; po terminie nie.
   Po terminie dowolny podpisujący wywołuje finalizację. Kwota `raised` jest
   wtedy ostatecznym mianownikiem głosów i podstawą procentowych transz.
5. **Porażka celu:** jeśli `raised < goal`, prowizja wynosi zero, a każdy backer
   ma roszczenie do 100% swojej wpłaty. Rent konta jest zwracany przy jego
   zamknięciu; opłaty sieciowe za transakcje nie są częścią wpłaty. Zwrot
   następuje przez `pull` lub permissionless `claim_for(backer)`, kierujące SOL
   zawsze do zarejestrowanego backera. Zegar sam nie wysyła transakcji.
6. **Sukces celu i prowizja:** przy `raised >= goal` program pobiera dokładnie
   raz `floor(raised * 100 / 10000)` lamportów, czyli 1% od **całej zebranej**
   kwoty, do niezmiennego, ujawnionego odbiorcy. `distributable = raised - fee`.
   Każda transza to jej udział w `distributable`; ostatnia otrzymuje resztę
   zaokrągleń, aby suma wypłat nie przekroczyła dostępnych środków. Prowizja
   nie daje platformie uprawnienia do zatwierdzania kampanii lub wypłat.
7. **Kaucja twórcy:** każda nowa kampania MVP deponuje oddzielnie 0,1 SOL.
   Nie jest to wpłata backera, nie powiększa wagi głosów ani budżetu transz.
   Pozostaje zablokowana do rozstrzygnięcia. Warunki i termin jej zwrotu oraz
   przepadku muszą zostać zatwierdzone w tabeli poniżej przed wdrożeniem.
8. **Głosowanie:** tylko backerzy z ostateczną dodatnią wpłatą; jeden głos na
   etap i rundę, waga = kwota wpłaty. Po przedstawieniu dowodu rozpoczyna się
   sztywne 7 dni. Wynik TAK zachodzi tylko wtedy, gdy `yes_weight * 2 > raised`,
   czyli ponad 50% wszystkich uprawnionych środków. Dokładnie 50%, brak głosów
   i wstrzymanie się nie dają zgody. Finalizacja jest permissionless dopiero
   po zakończeniu okna.
9. **Poprawa:** pierwsza porażka otwiera dokładnie 30 dni na poprawienie
   produktu i nowy dowód. Druga, 7-dniowa ankieta zaczyna się dopiero po
   pełnych 30 dniach, nawet przy wcześniejszym nadesłaniu dowodu. Druga
   porażka albo brak dowodu w terminie prowadzi do zakończenia. Przekroczenie
   terminu etapu musi mieć również jawną, permissionless ścieżkę przejścia
   do poprawy lub zakończenia. Nie ma milczącej wypłaty.
10. **Kolejność i wypłata:** tylko bieżący etap może przyjmować dowód i głosy;
    zatwierdzona transza daje trwałe, jednorazowe roszczenie. Dowolna osoba
    może wykonać techniczną finalizację lub uruchomienie wypłaty po spełnieniu
    warunków; pieniądze zawsze trafiają do z góry ustalonych odbiorców.
    Skonfigurowanego podziału nie wolno ominąć podmienionym kontem. Wcześniej
    przyznane i niewypłacone roszczenia pozostają zarezerwowane przy
    zakończeniu, nie wchodzą do puli refundacyjnej.
11. **Zakończenie:** po drugiej porażce, porzuceniu lub dobrowolnym poddaniu
    się twórca może dopłacić SOL do skarbca przed zamrożeniem puli. Zwrot
    pozostałych, niezarezerwowanych środków i ewentualnie utraconej kaucji
    jest proporcjonalny do zamrożonej wagi wpłat. Wcześniej wypłaconych
    transz program nie może odebrać.
12. **Dostępność po zniknięciu strony:** reguły finansowe i konto kampanii
    muszą być możliwe do odczytania i wywołania przez alternatywnego klienta.
    Pełne warunki i dowody wymagają stabilnego, publicznego nośnika danych
    oraz hasha/URI związanego z kontem; URL lokalnego frontendu nie wystarcza.
    Przed deklaracją niezmienności ujawnić i sprawdzić uprawnienia do
    aktualizacji programu.

### Status decyzji P0

Szczegółowe decyzje i format V2 są zapisane w [docs/PROTOCOL_V2.md](PROTOCOL_V2.md).

| Punkt | Status | Wynik |
| --- | --- | --- |
| P0.1 | ✅ Zakończone projektowo | 1% `floor`, 0,1 SOL, 183 dni, 30 dni na pierwszy dowód, reguły nieaktywnych głosujących, rounding i kaucja są zamknięte. |
| P0.1-D | ⚠ Problem wdrożeniowy | Repozytorium nie zawiera konkretnego publicznego klucza treasury. Trzeba go podać przed inicjalizacją `ProtocolConfigV2` i deploymentem. |
| P0.2 | ✅ Zakończone projektowo | Nowe konta/PDA/IDL V2, wersjonowanie i migracja V1 są opisane w `PROTOCOL_V2.md`. |
| P0.3 | ✅ Zakończone projektowo | RFC 8785 JCS, manifest warunków, manifest dowodu, Arweave URI i hash są opisane w `PROTOCOL_V2.md`. |

## Stan kodu w chwili napisania

- Rust ma 18 instrukcji, bazowy tryb all-or-nothing i tryb etapowy; `MAX_DONORS = 12`,
  `refund_all`, limit wpłat do celu, maksymalnie 5 etapów bez minimum,
  70% całej kwoty jako próg i brak okien głosowania. `add_milestone` jest
  możliwe podczas zbiórki, także po wpłatach. Obecne `claim_bond` zwalnia
  kaucję za wcześnie i nie obsługuje porażki celu.
- `release_tranche` może utworzyć ponownie roszczenie po jego zamknięciu;
  `withdraw_claim` pozwala ominąć podział. `terminate` wlicza niewypłacone
  roszczenia do puli refundacyjnej i blokuje ich wypłatę. Nie używać tych ścieżek
  z rzeczywistymi środkami przed naprawą i testami regresji.
- Backend ma SQLite, indeks kampanii, ledgerów i zdarzeń, hasło i sesje, łączenie
  portfela podpisem, logowanie portfelem po wcześniejszym powiązaniu,
  metadane i intencje płatnicze. Nadal wystawia budowniczy `refund_all` i
  nie ma profilu startupu, nagród do odebrania ani konta backera tworzonego
  bezpośrednio po połączeniu portfela.
- Frontend na commicie `15cb14a` ma szkielety stron tworzenia i szczegółów
  kampanii; biblioteka Solana i provider są obecne, lecz pełny przepływ UI nie
  jest podłączony. Nie traktować starszych opisów gotowego interfejsu jako
  aktualnego stanu. Wdrożenie najnowszego programu na devnet nie jest
  potwierdzone, a `devnet-smoke.mjs` obejmuje bazowy scenariusz.

## Zadania w kolejności wykonania

Każda faza kończy się testami i przeglądem zmian, zanim kolejna zacznie
polegać na jej kontrakcie. Nie implementować zależności backendu lub UI
od starego układu kont jako docelowego API.

### 0. Domknięcie protokołu i migracja — wykonane

- [x] **P0.1** Zatwierdzić decyzje ekonomiczne. Prowizja, kaucja, terminy,
  rounding, brak aktywności i nadwyżka są opisane; konkretny adres treasury
  pozostaje problemem wdrożeniowym P0.1-D.
- [x] **P0.2** Zaprojektować wersję kont/PDA/IDL V2 i ścieżkę migracji V1.
- [x] **P0.3** Ustalić kanoniczny JSON warunków i dowodów, publiczny storage
  oraz weryfikację hasha. Szczegóły: [PROTOCOL_V2.md](PROTOCOL_V2.md).

### 1. Program Solana: finansowanie i rachunkowość

Status wykonania P1: dodano osobny moduł
[`funding_v2.rs`](../rust/programs/charity-vault/src/funding_v2.rs).
Pięć testów bibliotecznych przeszło (`cargo test --lib --offline`).
Checkboxy poniżej pozostają otwarte do potwierdzenia instrukcji w testach
transakcyjnych. Build SBF nie zakończył się: instalacja `platform-tools`
zwróciła `Odmowa dostępu (os error 5)`. Nie wykonywano deploymentu.

| Zadanie | Wynik tego etapu | Problem do pełnego zamknięcia |
| --- | --- | --- |
| P1.1 | Dodane konta V2, szkic, 2–5 transz, dodatnie udziały <=50%, suma 100%, 7–183 dni i `seal_terms_v2`; po starcie dodawanie transz jest odrzucane | Brak testu transakcyjnego zamknięcia warunków i obsługi kont |
| P1.2 | `pledge_v2` bez limitu celu; `cancel_pledge_v2` tylko przed końcem okna, zamknięcie ledgeru i zwrot rent | Brak testu transakcyjnego transferów i ponownej wpłaty po anulowaniu |
| P1.3 | V2 nie ma listy donorów ani limitu 12; `claim_refund_v2` jest indywidualny i permissionless z odbiorcą związanym z ledgerem | Legacy `refund_all` zachowane dla V1; jego globalne usunięcie wymaga migracji/wycofania V1 i aktualizacji klientów. Test 13+ portfeli pozostaje do wykonania |
| P1.4 | Finalizacja zamraża kwotę, pobiera 1% tylko przy sukcesie i rozdziela netto z resztą w ostatniej transzy; stan blokuje ponowną finalizację | Brak testu transakcyjnego treasury, powtórzeń i pełnych refundów |
| P1.5 | 0,1 SOL w oddzielnym vault; zwrot po porażce celu lub `Completed` po siedmiu dniach | Brak adresu treasury do konfiguracji; P2 musi wdrożyć przepadek oraz ustawienie `Completed` i czasu ostatniego rozliczenia |
| P1.6 | Permissionless `close_backer_ledger_v2` zwraca rent do backera tylko po `Completed` | P2 musi wyznaczyć zakończenie wszystkich głosowań i zobowiązań; przedtem instrukcja jest celowo niedostępna |

Jednokrotna konfiguracja V2 jest autoryzowana aktualnym upgrade authority
programu, aby pierwszy przypadkowy caller nie mógł przejąć adresu prowizji.
Nie jest to wymóg podpisu platformy przy tworzeniu kampanii. Brak instrukcji
zmiany konfiguracji; inicjalizować przed usunięciem upgrade authority.

- [ ] **P1.1** Wprowadzić stan szkicu i atomowe `start_funding` / `seal_terms`
  po dodaniu 2-5 etapów; nie przyjmować wpłat przed zamknięciem warunków.
  Odrzucać zmiany po starcie, sumy != 10000 bps, etap 0 lub >5000 bps oraz
  czas zbiórki poza 7-183 dniami. Ustalić startową transzę jako etap 0.
- [ ] **P1.2** Usunąć górny limit `pledge <= goal`; dodać `cancel_pledge`
  tylko w trakcie finansowania, z poprawną wartością `raised`, ledgerem i zwrotem rent.
- [ ] **P1.3** Usunąć rejestr 12 backerów i `refund_all`; zachować pojedyncze
  ledgery/PDA i permissionless `refund_for` z niepodmienialnym odbiorcą.
- [ ] **P1.4** W finalizacji zamrozić `raised`, przy porażce odblokować 100%
  wpłat bez prowizji; przy sukcesie pobrać prowizję dokładnie raz, rozliczyć kwotę
  netto i procentowe transze z resztą zaokrągleń w ostatniej.
- [ ] **P1.5** Wymagać 0,1 SOL kaucji w oddzielnym skarbcu i wdrożyć
  zatwierdzone reguły zwrotu/przepadku, także gdy cel nie zostanie osiągnięty.
- [ ] **P1.6** Po zakończeniu wszystkich głosowań w udanej kampanii umożliwić
  zamknięcie ledgerów backerów i zwrot rent właściwym płatnikom, bez utraty
  danych potrzebnych do rozliczenia kampanii.

### 2. Program Solana: etapy, wypłaty i testy nadużyć

Status wykonania P2: dodano moduł [`lifecycle_v2.rs`](../rust/programs/charity-vault/src/lifecycle_v2.rs)
z terminami dowodu i głosowania, rundą poprawy, obowiązkowym splitem,
jednorazowym claimem, rezerwą zatwierdzonych transz, termination i refundem
proporcjonalnym. Osiem testów bibliotecznych V2 przechodzi. Pełny test
LiteSVM i build SBF są zablokowane błędami środowiska linkera/platform-tools,
więc nie oznaczam P2 jako zweryfikowanego end-to-end.

| Zadanie | Wynik tego etapu | Problem do pełnego zamknięcia |
| --- | --- | --- |
| P2.1 | Okna dowodu i głosowania są zapisane w `TrancheV2`; głos przed/po oknie i finalizacja przed terminem są odrzucane; PDA głosu blokuje duplikat | Brak testu LiteSVM na transakcjach z Clock z powodu niedostępnego SBF |
| P2.2 | Próg to `yes_weight * 2 > final_raised`; 50% i brak głosów przegrywają; pierwsza porażka otwiera 30 dni, potem 7 dni drugiej rundy; timeout dowodu jest permissionless | Brak end-to-end potwierdzenia drugiej rundy i zniknięcia twórcy |
| P2.3 | Claim ma trwałe `claim_created` i `settled`; split i odbiorcy są walidowani z konta etapu; `reserved` chroni zatwierdzone środki przy termination; dowolny caller uruchamia wypłatę | Brak testu kont i transferów; status `Completed` wymaga pełnego przebiegu wszystkich transz |
| P2.4 | Creator może dobrowolnie dopłacić SOL; termination po rejection lub dobrowolnie przenosi kaucję do vault i wylicza pulę po odjęciu rent/rezerw; refund jest indywidualny | Brak testu LiteSVM oraz decyzji, czy dobrowolne zakończenie ma zawsze przepadek kaucji w każdym wariancie |
| P2.5 | Dodano testy granic terminów, progu 50%, drugiej porażki, splitu i rounding; 8 testów bibliotecznych przechodzi | Pełna macierz LiteSVM (2/5 etapów, 13+ backerów, duplikaty i rzeczywiste PDA) czeka na naprawę toolchainu |

- [ ] **P2.1** Egzekwować kolejność i termin pierwszego dowodu; po dowodzie
  otwierać głosowanie na 7 dni. Odrzucać głos za wcześnie lub za późno,
  podwójny głos i finalizację przed terminem.
- [ ] **P2.2** Zastąpić 70% warunkiem `yes_weight * 2 > final_raised` z
  arytmetyką odporną na przepełnienie. Pierwsza porażka uruchamia pełne 30 dni
  poprawy, po których zaczyna się drugi tydzień głosowania. Brak dowodu,
  brak głosów i druga porażka mają skutek, który może wywołać dowolna osoba.
- [ ] **P2.3** Zablokować ponowne wydanie transzy po zamknięciu roszczenia;
  wymuszać istniejący podział i prawidłowego odbiorcę; zachować zarezerwowane
  roszczenia przy zakończeniu. Umożliwić dowolnej osobie techniczne
  uruchomienie wypłaty, bez możliwości zmiany odbiorcy.
- [ ] **P2.4** Dodać dobrowolne zakończenie, opcjonalną dopłatę twórcy przed
  zamrożeniem puli refundacyjnej i prawidłowy podział proporcjonalny według
  zamrożonego stanu.
- [ ] **P2.5** Testy LiteSVM: 2 i 5 etapów, suma 99/100/101%, etap 50/51%,
  7/183 dni, >goal, fee 0/1%, cancel przed/po, 13+ backerów, 0 głosów,
  dokładnie 50%, terminy obu ankiet, brak dowodu, zniknięcie twórcy,
  podwójne roszczenie, obejście podziału, przedwczesny zwrot kaucji,
  kaucja po nieosiągnięciu celu, zarezerwowane roszczenie kontra zwrot,
  duplikaty zwrotów, zaokrąglanie lamportów oraz zamknięcie ledgerów i zwrot
  rent po zakończeniu głosowań w udanej kampanii.

### 3. Backend po stabilizacji IDL

- [ ] **P3.1** Zaktualizować dekodery, indeks, bazę, SDK i REST pod nową
  wersję kont: wpłaty ponad cel, etapy, głosy, prowizję, kaucję, roszczenia,
  zwroty i metadane. Usunąć endpoint i budowniczy `refund_all` oraz zależność
  od 12 backerów. Odbudować stan po zamknięciu ledgerów; nie liczyć starych
  rekordów jako aktywnych. Uodpornić indeks zdarzeń na przerwy i ograniczony skan.
- [ ] **P3.2** Dodać konto backera tworzone po uwierzytelnieniu portfelem
  przez podpisanie wyzwania, zachowując jeden portfel i jedną tożsamość bez hasła.
  Profil twórcy zawiera dane organizacji i powiązany portfel, lecz program
  nie wymaga weryfikacji, zatwierdzenia ani podpisu administratora.
- [ ] **P3.3** Udostępnić „moje wpłaty”, potwierdzone wpłaty i ich statusy,
  historię zwrotów oraz publiczne metadane ze sprawdzonym hashem.
  Backend nie może nadpisać kanonicznych warunków finansowych.
- [ ] **P3.4** Jeśli nagrody wejdą do MVP: serwerowe poziomy nagród i uprawnienia,
  prywatny odbiór klucza lub formularz wysyłki, autoryzacja portfelem i
  idempotentne wydanie po weryfikacji wpłaty. Nie obiecywać fizycznej
  dostawy jako gwarancji on-chain.
- [ ] **P3.5** Testy uwierzytelniania, podpisów, powtórzeń, dostępu do cudzych
  nagród, API prowizji i zwrotów, nowego IDL oraz synchronizacji po zamknięciu kont.

### 4. Frontend po stabilizacji API

- [ ] **P4.0** Przygotować kierunek wizualny inspirowany
  [Colosseum](https://colosseum.com/): hierarchię informacji, typografię,
  rytm i prezentację projektów dostosować do Bestcrow. Nie kopiować
  identyfikacji, zasobów ani układów dosłownie; czytelność finansów i
  dostępność kontrolek pozostają nadrzędne.
- [ ] **P4.1** Zastąpić szkielety pełnym, responsywnym UI dla startupów:
  połączenie portfela i automatyczne logowanie backera, profil twórcy, lista
  zbiórek, szczegóły, „moje wpłaty”, głosowanie, wypłaty i zwroty.
- [ ] **P4.2** Kreator kampanii waliduje wszystkie pola przed pierwszą
  transakcją, pokazuje procenty, kwotę netto, prowizję, kaucję i rent oraz
  odróżnia szkic od nieedytowalnej kampanii po starcie. Obsługuje częściowe
  błędy wielotransakcyjnego szkicu i wznowienie bez ukrywania ryzyka.
- [ ] **P4.3** Strona kampanii pokazuje kanoniczny, zweryfikowany opis i
  dostępny dowód, próg >50% wszystkich wpłat, oba zegary, etapy w
  kolejności, stan kaucji, prowizję i pulę refundacyjną. Formularze są dostępne
  z klawiatury, mają błędy przy polach i pełne stany oczekiwania.
- [ ] **P4.4** Poprawić budowanie transakcji podziału i wypłaty,
  permissionless `finalize`/`release`/`refund_for` oraz linki do potwierdzonych
  transakcji. Nie pokazywać przycisku, którego obecny kontrakt nie obsłuży.
- [ ] **P4.5** Przepisać teksty interfejsu: startupy/prototypy, 1% jawnej prowizji
  tylko po sukcesie, 0,1 SOL kaucji, brak weryfikacji twórców i ograniczenia
  gwarancji. Zniknięcie strony nie może blokować praw on-chain.

### 5. Integracja, bezpieczeństwo i prezentacja

- [ ] **P5.1** Uruchomić testy Rust, backendu i frontendu, build, lokalną
  symulację obu rund z przesunięciem Clock oraz testy e2e z co najmniej
  13 portfelami. Zapisać komendy, wersję programu, wyniki i luki.
- [ ] **P5.2** Wdrożyć nową wersję na devnet po sprawdzeniu zgodności IDL,
  finansowania portfela i uprawnień do aktualizacji programu. Rozszerzyć smoke
  test o udaną kampanię etapową, porażkę celu, poprawkę, zakończenie i zwrot;
  zachować linki do potwierdzonych transakcji.
- [ ] **P5.3** Udokumentować alternatywne instrukcje roszczeń i finalizacji po
  zniknięciu frontendu, adres skarbca prowizji, uprawnienia do aktualizacji
  programu i rzeczywiste koszty rent oraz opłat sieciowych. Nie deklarować
  niemożliwości aktualizacji programu, dopóki te uprawnienia nie zostaną
  faktycznie usunięte.
- [ ] **P5.4** Przygotować demonstrację na wcześniej utworzonych kontach dla
  długich terminów i osobną potwierdzoną transakcję na żywo. Zweryfikować
  zgodność z kryteriami PDF przed ogłoszeniem gotowości.

## Po MVP, jeśli zostanie czas

- Automatyczny worker składający jedynie transakcje dostępne dla każdego,
  powiadomienia i przypomnienia; protokół nadal działa bez workera.
- Pełny katalog nagród, eksport wysyłek i stany realizacji. Dane osobowe
  trzymać prywatnie; kody i dostawy pozostają zobowiązaniem twórcy.
- Podział i streaming jako publiczne narzędzia UI dopiero po testach
  poprawnej wypłaty. USDC, NFT, Arweave dla nagród i kolejne rundy
  finansowania są osobnymi propozycjami, nie warunkiem tego MVP.
- Antyspam/KYC lub moderacja katalogu dopiero w przyszłej polityce
  produktu. Nie przenosić uprawnień finansowych do backendu.
