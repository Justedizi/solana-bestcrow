# Mechanizmy Solany w tym programie

[Spis dokumentacji](../README.md) · [API](API.md) · [Konta](ACCOUNTS.md)

## Program, instrukcja, transakcja

**Program** to kod wdrożony pod adresem `charity_vault::ID`.
Funkcje oznaczone przez Anchor jako `#[program]` w [lib.rs](../programs/charity-vault/src/lib.rs)
są publicznymi instrukcjami, np. `pledge(amount)`.

**Instrukcja** składa się z adresu programu, uporządkowanej listy kont i bajtów
argumentów. **Transakcja** zawiera jedną lub więcej instrukcji, podpisy,
fee payera i recent blockhash. Jeżeli instrukcja zwróci błąd, zmiany stanu
całej transakcji są wycofywane; opłata transakcyjna może nadal zostać pobrana.

Funkcje programu zwracają `Result<()>`: sukces lub błąd. Nie zwracają JSON-a
ani nowych adresów kont. Klient sam wyznacza PDA, a wynik sprawdza przez
potwierdzenie transakcji, odczyt kont i zdarzenia.

## Konta i właściciel konta

Solana przechowuje stan w kontach. Konto ma m.in. adres, saldo lamportów,
właściciela (`owner`) i dane (`data`). Właściciel jest adresem programu,
który może zmieniać dane i obciążać saldo konta zgodnie z regułami runtime.
To inna rola niż biznesowy `creator` zapisany wewnątrz `CampaignAccount`.

W tej aplikacji:

- `CampaignAccount` przechowuje warunki, status i rozliczenia zbiórki.
- `DonorLedgerAccount` przechowuje sumę wpłat jednego darczyńcy.
- `MilestoneAccount`, `VoteRecord`, `SplitAccount`, `ClaimAccount` opisują etapy i wypłaty.
- `vault` i `bond_vault` przechowują SOL, mają zero bajtów danych i należą do programu.

`Account<'info, T>` sprawdza właściciela i deserializuje dane Anchor.
`UncheckedAccount` nie wykonuje pełnej walidacji typu: trzeba sprawdzić jego
atrybuty `#[account(...)]` i kod handlera. Nazwa nie oznacza automatycznie
braku kontroli, np. `vault` ma sprawdzane seeds PDA.

## PDA i bump

**PDA (Program Derived Address)** to adres wyznaczony z seeds i Program ID.
Nie ma zwykłego klucza prywatnego. Przykładowo `vault` wynika z
`[b"vault", campaign]`, więc każda zbiórka ma własny skarbiec.

`Pubkey::find_program_address` zwraca `(adres, bump)`. Bump to dodatkowy bajt
użyty przy wyznaczaniu prawidłowego PDA. Anchor porównuje adresy z seeds
oraz bumpem w ograniczeniach kont. Dla zbiórki `campaign_id` kodowane jest
jako osiem bajtów little-endian, a indeks etapu i runda jako pojedynczy bajt.
Pełna lista jest w [tabeli PDA](ACCOUNTS.md#adresy-pda).

PDA nie jest „portfelem twórcy”. Reguły programu decydują, kiedy środki mogą
opuścić skarbiec. Program może podpisać CPI swoim PDA przez seeds; obecne
wypłaty w tym repozytorium używają bezpośredniej zmiany lamportów.

## Jak Anchor sprawdza wywołanie

Każda struktura `#[derive(Accounts)]` opisuje konta oczekiwane przez instrukcję.
`Context<T>` udostępnia je handlerowi jako `ctx.accounts`.

| Element kodu | Znaczenie tutaj |
| --- | --- |
| `Signer<'info>` | Adres musi podpisać transakcję |
| `#[account(mut)]` | Konto musi być writable; program może je zmienić |
| `init, payer = creator` | Utwórz konto; twórca finansuje jego rezerwę rent |
| `init_if_needed, payer = donor` | Utwórz ledger przy pierwszej wpłacie, później użyj istniejącego |
| `space = 8 + T::INIT_SPACE` | Miejsce na discriminator Anchor i serializowane dane |
| `seeds = [...], bump` | Sprawdź deterministyczny adres PDA |
| `has_one = creator` | Pole `campaign.creator` musi wskazywać przekazane konto twórcy |
| `address = campaign.creator` | Konto musi mieć dokładnie adres twórcy |
| `owner = crate::ID` | Konto musi należeć do tego programu |
| `close = donor` | Po sukcesie zamknij konto i oddaj jego lamporty darczyńcy |
| `require!` / `require_keys_eq!` | Sprawdź warunek / zgodność adresów, inaczej zwróć błąd |

Walidacja struktury kont odbywa się przed handlerem. Dlatego próba ponownego
utworzenia istniejącego `VoteRecord` może zwrócić błąd inicjalizacji konta,
a nie własny `AlreadyVoted`.

## Wpłata: CPI do System Program

`pledge` wywołuje `system_program::transfer` przez `CpiContext`.
**CPI (Cross-Program Invocation)** to wywołanie innego programu z wnętrza programu.
Tutaj System Program przenosi SOL z podpisującego darczyńcy do `vault`.
Analogicznie twórca wpłaca kaucję do `bond_vault` przy tworzeniu zbiórki etapowej.

`system_program` ma adres `11111111111111111111111111111111`. To nie jest
Token Program. Repozytorium nie używa mintów, ATA, SPL Token ani Token-2022
do tych przepływów.

## Wypłata: bezpośrednia zmiana lamportów

Skarbce należą do `charity_vault`, więc System Program nie może obciążyć ich
jak zwykłego konta systemowego. Handlery wypłat zmniejszają saldo skarbca
przez `try_borrow_mut_lamports()` i zwiększają saldo odbiorcy o tę samą kwotę.

Oba konta muszą być writable. Kod sprawdza saldo i używa operacji
`checked_add` / `checked_sub` w rozliczeniach. Przy CPI wpłaty darczyńca
podpisuje obciążenie swojego konta; przy wypłacie odbiorca zwykle nie musi
podpisywać, ponieważ środki pochodzą z konta programu.

## Rent, opłaty i zamykanie kont

**Rezerwa rent** to saldo wymagane, żeby konto było rent-exempt. To osobny
koszt od wpłaty i opłaty za transakcję. Również konto z pustymi danymi ma
rezerwę wynikającą z narzutu konta. Jej wartość ustalaj z `Rent` lub RPC,
nie ze stałej używanej w testach.

- Twórca finansuje konta zbiórki, skarbców, etapów, splitu i claimów.
- Darczyńca finansuje swój ledger; głosujący finansuje `VoteRecord`.
- `claim_refund` i `claim_termination_refund` zamykają ledger i oddają jego saldo darczyńcy.
- `refund_all` zamyka ledgery i oddaje pozostałe saldo skarbca twórcy.
- `claim_success` oraz `claim_bond` opróżniają odpowiedni skarbiec.
- `withdraw_claim` po pełnej wypłacie zamyka claim i oddaje jego rezerwę do `caller`.

Campaign, milestone, vote i split nie mają tu publicznej instrukcji zamknięcia.
Fee payer pokrywa opłatę transakcji i może być inną osobą niż `creator`,
`donor` czy `caller`. `payer = ...` w Anchor wskazuje płatnika utworzenia konta.

## Zegar i zdarzenia

`Clock::get()?.unix_timestamp` daje czas sieci w sekundach. `pledge` wymaga
`now < campaign.deadline`, a `finalize` wymaga `now >= campaign.deadline`.
Przekroczenie terminu samo nie uruchamia żadnej funkcji: potrzebna jest transakcja.
W testach LiteSVM można zmienić sysvar `Clock`, aby sprawdzić te warunki.

W docelowym MVP zegar będzie też wyznaczał sztywne 7-183 dni zbiórki,
dwie 7-dniowe rundy głosowania i pełne 30 dni na poprawę między nimi.
`Clock` pozwala egzekwować warunek przy transakcji, ale nie uruchamia jej
sam: po upływie czasu ktoś nadal musi wywołać `finalize_vote`, zakończenie,
zwrot lub wypłatę. Reguły te **nie istnieją jeszcze** w obecnym programie.

Podobnie obecny `refund_all` i tablica 12 wspierających są do usunięcia.
Docelowy zwrot po nieosiągnięciu celu to indywidualne 100% wpłaty bez
prowizji; 1% całej zebranej kwoty trafia do platformy tylko przy sukcesie.
Osobna kaucja 0,1 SOL dla każdej nowej kampanii etapowej oraz rezerwy rent
i opłaty transakcyjne nie są częścią procentowego podziału transz.
Docelowe MVP tworzy wyłącznie kampanie etapowe; zwykła zbiórka pozostaje
ścieżką legacy obecnego kodu. Integracja musi pokazać koszty i prowizję
oddzielnie, a po zmianie programu uaktualnić obliczenia i dekodery kont.

`emit!` zapisuje zdarzenia Anchor w logach wykonania. Backend może je dekodować,
ale stan kont jest podstawą rozliczeń. Opis zdarzeń i błędów znajduje się
w [osobnym dokumencie](ERRORS_EVENTS.md).
