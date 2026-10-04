# API programu charity_vault

[Spis dokumentacji](../README.md) · [Konta i PDA](ACCOUNTS.md) ·
[Przykłady integracji](INTEGRATION.md) · [Błędy i zdarzenia](ERRORS_EVENTS.md)

Publiczne wejścia są w [lib.rs](../programs/charity-vault/src/lib.rs).
Każda instrukcja zwraca `Result<()>`. Kwoty podawaj w lamportach,
terminy jako Unix timestamp w sekundach, a `duration` jako liczbę sekund.
Hashe mają dokładnie 32 bajty. Program zapisuje je, ale nie weryfikuje
treści dokumentów ani sposobu obliczenia hasha.

## Jak czytać listy kont

Konta podano **w kolejności wymaganej przez program**. Oznaczenia:

- `S` = signer: wymagany podpis.
- `W` = writable: konto może zostać zmienione.
- `R` = read-only: wystarczy konto tylko do odczytu.
- `nowe` = konto tworzone przez `init`; klient wyznacza PDA, nie podpisuje nim.

`remaining_accounts` dopisuje się po stałej liście kont.
`system_program` to zawsze `11111111111111111111111111111111` (`R`).
Adresy PDA znajdują się w [tabeli kont](ACCOUNTS.md#adresy-pda).
Listy odzwierciedlają ograniczenia Anchor, z dodatkowym wymogiem dla
`caller` w `withdraw_claim` opisanym przy tej instrukcji.

## Szybki indeks

| Instrukcja | Podpis | Cel |
| --- | --- | --- |
| [create_campaign](#create_campaign) | twórca | Zwykła zbiórka |
| [pledge](#pledge) | darczyńca | Wpłata SOL |
| [finalize](#finalize) | dowolny caller | Rozstrzygnięcie zbierania wpłat |
| [claim_success](#claim_success) | twórca | Cała wypłata zwykłej zbiórki |
| [claim_refund](#claim_refund) | darczyńca | Zwrot po nieosiągnięciu celu |
| [refund_all](#refund_all) | dowolny caller | Zbiorczy zwrot |
| [create_staged_campaign](#create_staged_campaign) | twórca | Zbiórka etapowa z kaucją |
| [add_milestone](#add_milestone) | twórca | Dodanie etapu |
| [submit_evidence](#submit_evidence) | twórca | Dowody i otwarcie rundy głosowania |
| [vote_milestone](#vote_milestone) | darczyńca | Głos ważony wpłatą |
| [finalize_vote](#finalize_vote) | dowolny caller | Rozstrzygnięcie rundy |
| [release_initial](#release_initial) | twórca | Wypłata pierwszej transzy |
| [set_split](#set_split) | twórca | Podział wypłat na odbiorców |
| [release_tranche](#release_tranche) | twórca | Utworzenie claimu etapu |
| [withdraw_claim](#withdraw_claim) | dowolny caller | Wypłata odblokowanej części claimu |
| [terminate](#terminate) | twórca lub dowolny caller po odrzuceniu | Zamrożenie puli zwrotów |
| [claim_termination_refund](#claim_termination_refund) | darczyńca | Proporcjonalny zwrot |
| [claim_bond](#claim_bond) | twórca | Odbiór kaucji |

## create_campaign

**Argumenty:** `campaign_id: u64`, `goal: u64`, `deadline: i64`, `desc_hash: [u8; 32]`.
Identyfikator jest unikalny w obrębie adresu twórcy.

**Konta:** `creator (S,W)` → `campaign (W,nowe)` → `vault (W,nowe)` → `system_program (R)`.

Wymaga `goal > 0` i `deadline > now`. Twórca finansuje utworzenie kont.
Ustawia `Active`, `staged = false`, `raised = 0` i pusty rejestr darczyńców.
Istniejącego campaign PDA nie można utworzyć ponownie.

**Zdarzenie:** `CampaignCreated`. **Typowe błędy:** `InvalidGoal`, `InvalidDeadline`.
Źródło: [create_campaign.rs](../programs/charity-vault/src/instructions/create_campaign.rs).

## pledge

**Argumenty:** `amount: u64` — dodatkowa kwota wpłaty, nie nowa suma ledgeru.

**Konta:** `donor (S,W)` → `campaign (W)` → `ledger (W,init_if_needed)` → `vault (W)` → `system_program (R)`.

Wymaga `Active`, `now < deadline`, `amount > 0` i `raised + amount <= goal`.
Pierwsza wpłata tworzy ledger i rejestruje darczyńcę, o ile limit 12 nie jest
wyczerpany. Kolejne wpłaty tego samego adresu zwiększają ten sam ledger.
Transfer przez System Program zwiększa saldo vault. `raised` i `ledger.amount`
rosną o `amount`. Limit dotyczy różnych darczyńców, nie liczby wpłat.

**Zdarzenie:** `PledgeReceived`. **Typowe błędy:** `CampaignNotActive`, `DeadlinePassed`,
`InvalidGoal` także dla zerowej wpłaty, `GoalOverflow`, `DonorRegistryFull`.
Źródło: [pledge.rs](../programs/charity-vault/src/instructions/pledge.rs).

## finalize

**Argumenty:** brak.

**Konta:** `caller (S)` → `campaign (W)`.

Każdy może wywołać po `deadline`, jeżeli status to `Active`.
`raised >= goal` daje `Succeeded`, w przeciwnym razie `Refunded`.
Ponieważ wpłaty są ograniczone do celu, normalny sukces oznacza `raised == goal`.
Dotyczy obu trybów. Instrukcja nie wypłaca środków i nie uruchamia się automatycznie.

**Zdarzenie:** `CampaignFinalized`. **Typowe błędy:** `CampaignNotActive`, `DeadlineNotPassed`.
Źródło: [finalize.rs](../programs/charity-vault/src/instructions/finalize.rs).

## claim_success

**Argumenty:** brak.

**Konta:** `creator (S,W)` → `campaign (W)` → `vault (W)`.

Wyłącznie twórca zwykłej zbiórki ze statusem `Succeeded` i `paid = false`.
Ustawia `paid = true`, przenosi **całe saldo vault**, łącznie z rezerwą rent,
do twórcy i opróżnia skarbiec. Wypłata jest jednorazowa.

**Zdarzenie:** `SuccessClaimed`. **Typowe błędy:** `StagedCampaignUsesMilestones`,
`CampaignNotSucceeded`, `AlreadyClaimed`.
Źródło: [claim_success.rs](../programs/charity-vault/src/instructions/claim_success.rs).

## claim_refund

**Argumenty:** brak.

**Konta:** `donor (S,W)` → `campaign (W)` → `ledger (W)` → `vault (W)`.

Wymaga `Refunded`, `terminated = false` i nieodebranego ledgeru darczyńcy.
Zwraca dokładnie `ledger.amount`. Anchor zamyka ledger i oddaje jego rezerwę
rent darczyńcy. Rezerwa samego vault zostaje w skarbcu. Działa też po
nieudanej zbiórce etapowej; nie jest ścieżką zwrotu po `terminate`.

**Zdarzenie:** `RefundIssued`. **Typowe błędy:** `CampaignNotRefunded`,
`CampaignTerminated`, `AlreadyClaimed`, `InsufficientVaultBalance`.
Źródło: [claim_refund.rs](../programs/charity-vault/src/instructions/claim_refund.rs).

## refund_all

**Argumenty:** brak.

**Stałe konta:** `caller (S,W)` → `campaign (W)` → `vault (W)` → `creator (W)`.
`creator` musi mieć adres `campaign.creator`, ale nie musi podpisywać.

**remaining_accounts:** dokładnie `donor_count * 2` kont:

```text
ledger(donors[0]) (W), donors[0] (W),
ledger(donors[1]) (W), donors[1] (W),
...
```

Wymaga `Refunded` i `terminated = false`. Kolejność musi odpowiadać rejestrowi
`campaign.donors`. Weryfikuje PDA ledgerów oraz odbiorców, zwraca wpłaty,
zamyka ledgery i oddaje ich rezerwy darczyńcom. Pozostałe saldo vault trafia
do **twórcy**, nie do caller. Ledgery zamknięte wcześniej przez `claim_refund`
są pomijane, ale ich adresy i adresy darczyńców nadal trzeba przekazać.

**Zdarzenia:** `RefundIssued` dla wypłaconych dodatnich kwot.
**Typowe błędy:** `InvalidRefundAccounts`, `CampaignNotRefunded`, `CampaignTerminated`.
Źródło: [refund_all.rs](../programs/charity-vault/src/instructions/refund_all.rs).

## create_staged_campaign

**Argumenty, w kolejności:** `campaign_id: u64`, `goal: u64`, `deadline: i64`,
`desc_hash: [u8; 32]`, `base_budget: u64`, `initial_tranche: u64`, `bond: u64`.

**Konta:** `creator (S,W)` → `campaign (W,nowe)` → `vault (W,nowe)` →
`bond_vault (W,nowe)` → `system_program (R)`.

Wymaga `goal > 0`, `0 < base_budget <= goal`, `deadline > now`,
`initial_tranche <= 50% base_budget`. Zerowa pierwsza transza i zerowa kaucja
są dozwolone. Tworzy oba skarbce nawet przy zerowej kaucji.
Ustawia `staged = true`, `Active`, `allocated = initial_tranche` i przelewa
`bond` od twórcy do bond vault. Kaucja nie zwiększa `raised` ani wagi głosów.

**Zdarzenie:** `StagedCampaignCreated`. **Typowe błędy:** `InvalidGoal`,
`InvalidDeadline`, `MilestoneExceedsHalf`.
Źródło: [staged.rs](../programs/charity-vault/src/instructions/staged.rs).

## add_milestone

**Argumenty:** `index: u8`, `amount: u64`, `deadline: i64`, `evidence_hash: [u8; 32]`.

**Konta:** `creator (S,W)` → `campaign (W)` → `milestone (W,nowe)` → `system_program (R)`.

Wymaga twórcy, zbiórki etapowej, `Active` i czasu przed terminem zbiórki.
Indeks musi być równy `milestone_count` i mieścić się w `0..4`.
`amount <= 50% base_budget` oraz `allocated + amount <= base_budget`.
Tworzy etap `Pending`, `round = 1`, zwiększa `allocated` i `milestone_count`.
`allocated` już zawiera pierwszą transzę, mimo komentarza w `state.rs`
sugerującego jej wyłączenie.

Nie wymaga dodatniego `amount`, nie sprawdza terminu etapu ani nie wymaga
pełnego rozpisania budżetu. Etapy można dodawać również po pierwszych wpłatach,
dopóki zbiórka pozostaje aktywna i jej deadline nie minął.

**Zdarzenie:** `MilestoneAdded`. **Typowe błędy:** `InvalidMilestoneIndex`,
`MilestoneExceedsHalf`, `MilestoneSumExceedsBudget`, `DeadlinePassed`.
Źródło: [staged.rs](../programs/charity-vault/src/instructions/staged.rs).

## submit_evidence

**Argumenty:** `index: u8`, `evidence_hash: [u8; 32]`.

**Konta:** `creator (S,W)` → `campaign (R)` → `milestone (W)`.

Wyłącznie twórca przy `Succeeded` i `terminated = false`.
Etap musi być `Pending` lub `Revision`. Zastępuje hash, ustawia `Submitted`
i zeruje obie sumy głosów. Nie zmienia rundy; przejście do rundy 2 wykonuje
`finalize_vote`. Hash sam w sobie nie dowodzi wykonania etapu.

**Zdarzenie:** `EvidenceSubmitted`. **Typowe błędy:** `CampaignNotSucceeded`,
`CampaignTerminated`, `InvalidMilestoneStatus`.
Źródło: [voting.rs](../programs/charity-vault/src/instructions/voting.rs).

## vote_milestone

**Argumenty:** `index: u8`, `approve: bool`.

**Konta:** `backer (S,W)` → `campaign (R)` → `milestone (W)` →
`ledger (R)` → `vote (W,nowe)` → `system_program (R)`.

Wymaga `Succeeded`, braku termination, etapu `Submitted` i dodatniej wpłaty
głosującego. Waga to całe `ledger.amount`, nie liczba transakcji wpłat.
Dodaje wagę do `approve_weight` lub `reject_weight`; suma wszystkich wag
nie może przekroczyć `raised`. Tworzy PDA głosu zawierające bieżącą rundę.
Jeden adres może zagłosować raz na etap w każdej rundzie; nie ma zmiany głosu.

**Zdarzenie:** `MilestoneVoted`. **Typowe błędy:** `DonorNotRegistered`,
`InvalidMilestoneStatus`, `VoteWeightExceedsRaised`; ponowny głos zwykle kończy
się błędem `init` konta, nie `AlreadyVoted`.
Źródło: [voting.rs](../programs/charity-vault/src/instructions/voting.rs).

## finalize_vote

**Argumenty:** `index: u8`.

**Konta:** `caller (S)` → `campaign (W)` → `milestone (W)`.

Wymaga `Succeeded`, braku termination, `raised > 0` i etapu `Submitted`.
Każdy caller może rozstrzygnąć od razu: kod nie wymaga deadline ani
oddania wszystkich głosów. Oblicza `approve_bps = floor(approve_weight * 10_000 / raised)`.

| Wynik | Zmiana stanu |
| --- | --- |
| `approve_bps >= 7_000` | `Released`, bez transferu SOL |
| Poniżej progu w rundzie 1 | `Revision`, `round = 2`, obie sumy głosów wyzerowane |
| Poniżej progu w rundzie 2 | `Rejected`, `campaign.rejections += 1` |

Próg liczy się od **wszystkich wpłat**, a brak głosu nie zwiększa akceptacji.
Przy 10 SOL zebranych środków potrzeba co najmniej 7 SOL wagi głosów za.
Druga porażka nie wywołuje `terminate` automatycznie.

**Zdarzenie:** `MilestoneFinalized`. Po przejściu do `Revision` pole `round`
w zdarzeniu ma już wartość 2, a `approve_bps` opisuje zakończoną rundę 1.
Źródło: [voting.rs](../programs/charity-vault/src/instructions/voting.rs).

## release_initial

**Argumenty:** brak.

**Konta:** `creator (S,W)` → `campaign (W)` → `vault (W)`.

Wymaga twórcy, zbiórki etapowej, `Succeeded`, braku termination i `paid = false`.
Przelewa `initial_tranche` bezpośrednio do twórcy, ustawia `paid = true`
i zwiększa `released`. Nie używa splitu ani streamingu. Może zostać wykonana
również dla zerowej transzy.

**Zdarzenie:** `TrancheReleased` z `index = 255`, `streamed = false`.
**Typowe błędy:** `AlreadyClaimed`, `CampaignNotStaged`, `InsufficientVaultBalance`.
Źródło: [release.rs](../programs/charity-vault/src/instructions/release.rs).

## set_split

**Argumenty:** `recipients: Vec<Pubkey>`, `shares_bps: Vec<u16>`.

**Konta:** `creator (S,W)` → `campaign (R)` → `split (W,nowe)` → `system_program (R)`.

Wymaga twórcy, zbiórki etapowej i braku termination. Wektory muszą mieć tę
samą długość od 1 do 5. Wszystkie udziały muszą być dodatnie i sumować się
do 10 000 bps. Przykład: `[6000, 4000]` oznacza 60% i 40%.
Adresy nie są sprawdzane pod kątem unikalności.

Konfigurację można utworzyć tylko raz (`init`), ale nie ma ograniczenia do
statusu `Active` ani wymogu utworzenia jej przed claimami. Nie emituje zdarzenia.
**Typowy błąd:** `InvalidSplit`.
Źródło: [release.rs](../programs/charity-vault/src/instructions/release.rs).

## release_tranche

**Argumenty:** `index: u8`, `duration: i64` — 0 oznacza wypłatę bez czekania.

**Konta:** `creator (S,W)` → `campaign (W)` → `milestone (W)` →
`claim (W,nowe)` → `system_program (R)`.

Wymaga twórcy, zbiórki etapowej, `Succeeded`, braku termination, `duration >= 0`
i etapu `Released`. Sprawdza `released + milestone.amount <= raised`.
Zwiększa `released` o kwotę etapu i tworzy claim z `start = now`, `claimed = 0`,
`recipient = creator`. **Nie przenosi SOL:** środki nadal leżą w vault.
Nie wymaga wcześniejszego `release_initial` ani wykonania etapów po kolei.
Nie zmienia statusu etapu po utworzeniu claimu.

**Zdarzenie:** `TrancheReleased`, `streamed = (duration > 0)`.
**Typowe błędy:** `InvalidMilestoneStatus`, `InvalidSplit` dla ujemnego czasu,
`InsufficientVaultBalance`. Istniejący claim blokuje `init`, ale patrz
[ograniczenia implementacji](#istotne-zachowania-implementacji) po jego zamknięciu.
Źródło: [release.rs](../programs/charity-vault/src/instructions/release.rs).

## withdraw_claim

**Argumenty:** `index: u8`.

**Stałe konta:** `caller (S,W)` → `campaign (R)` → `vault (W)` → `claim (W)` → `split (R)`.

`caller` nie ma `mut` w strukturze Anchor, ale po pełnej wypłacie otrzymuje
rezerwę zamykanego claimu. **Przekaż go jako writable**, również gdy fee payer
jest innym adresem. Fee payer jest writable z racji swojej roli w transakcji.

Konto `split` jest obowiązkowe i musi należeć do tego programu:

| Wariant | `split` | `remaining_accounts` |
| --- | --- | --- |
| Wypłata z podziałem | Właściwe split PDA | Dokładnie `split.count` odbiorców `W`, w kolejności `split.recipients` |
| Wypłata do twórcy | Inne konto programu, np. `campaign` | `claim.recipient (W)` jako pierwsze konto; wystarczy jedno |

Wymaga `Succeeded`, braku termination i dodatniej nowo odblokowanej kwoty.
Przy `duration = 0` odblokowane jest całe `total`. Przy dodatnim czasie:

```text
elapsed = min(now - start, duration)
vested = floor(total * elapsed / duration)
delta = vested - claimed
```

Przelewa `delta` z vault. Przy splicie każdy poza ostatnim dostaje
`floor(delta * shares_bps[i] / 10_000)`, a ostatni resztę. Zwiększa
`claim.claimed`; po pełnej wypłacie zamyka claim i oddaje rent do caller.

**Zdarzenie:** `ClaimWithdrawn`. **Typowe błędy:** `NothingVested`,
`InvalidRecipient`, `InsufficientVaultBalance`, `CampaignTerminated`.
Źródło: [release.rs](../programs/charity-vault/src/instructions/release.rs).

## terminate

**Argumenty:** brak.

**Konta:** `caller (S)` → `campaign (W)` → `vault (W)` → `bond_vault (W)`.

Wymaga zbiórki etapowej, `Succeeded` i `terminated = false`.
Twórca może zakończyć ją sam. Inny caller może to zrobić tylko przy
`rejections > 0`. Nie istnieje osobny warunek oparty na terminie etapu.

Ustawia `terminated = true`. Jeżeli jest odrzucony etap, zadeklarowana kaucja
jest dodatnia i nie została wcześniej skonfiskowana, przenosi całe bieżące
saldo bond vault do vault i ustawia `bond_forfeited = true`.
Zapisuje bieżące saldo vault jako `refund_pool`, razem z rezerwą rent.
Blokuje dalsze wypłaty claimów. Pula obejmuje też kwoty claimów utworzonych,
ale jeszcze niewypłaconych. Wypłaconych wcześniej kwot nie cofa.

**Zdarzenie:** `CampaignTerminated`. **Typowe błędy:** `UnauthorizedCreator`,
`CampaignNotSucceeded`, `CampaignTerminated`.
Źródło: [settle.rs](../programs/charity-vault/src/instructions/settle.rs).

## claim_termination_refund

**Argumenty:** brak.

**Stałe konta:** `donor (S,W)` → `campaign (W)` → `ledger (W)` → `vault (W)`.
**remaining_accounts:** przekazuj `campaign.creator (W)` jako pierwsze konto.
Jest potrzebne przy ostatnim zwrocie, jeżeli pozostaje reszta w vault;
najprościej dołączać je zawsze.

Wymaga `terminated = true`, `raised > 0` i nieodebranego ledgeru.
Zwraca `floor(ledger.amount * refund_pool / raised)` z niezmiennej puli
zapisanej przez `terminate`. Zamyka ledger, oddaje jego rezerwę darczyńcy
i zwiększa `refunds_claimed`. Po zwrocie dla wszystkich darczyńców całe
pozostałe saldo vault trafia do twórcy. Nie jest to zwrot dokładnej wpłaty;
może obejmować skonfiskowaną kaucję.

**Zdarzenie:** `TerminationRefund`. **Typowe błędy:** `CampaignNotTerminated`,
`InvalidRecipient`, `InsufficientVaultBalance`.
Źródło: [settle.rs](../programs/charity-vault/src/instructions/settle.rs).

## claim_bond

**Argumenty:** brak.

**Konta:** `creator (S,W)` → `campaign (R)` → `bond_vault (W)`.

Wymaga twórcy, zbiórki etapowej, `Succeeded`, braku termination,
`bond_forfeited = false` i zadeklarowanego `bond > 0`.
Przelewa całe bieżące saldo bond vault, razem z rent, do twórcy.
Nie wymaga zakończenia wszystkich etapów, nie sprawdza `rejections`
i nie aktualizuje `campaign.bond` ani osobnej flagi odbioru.

**Zdarzenie:** `BondClaimed`. **Typowe błędy:** `NoBond`, `BondUnavailable`,
`CampaignTerminated`, `CampaignNotSucceeded`.
Źródło: [settle.rs](../programs/charity-vault/src/instructions/settle.rs).

## Istotne zachowania implementacji

Poniższe punkty opisują kod obecny w repozytorium. Sam interfejs klienta
nie może zastąpić brakujących kontroli programu.

| Zachowanie | Znaczenie dla integracji |
| --- | --- |
| Deadline etapu nie jest egzekwowany; `finalize_vote` nie czeka na głosy | Dowolny caller może rozstrzygnąć `Submitted` nawet przy zerowej frekwencji |
| `Released` oznacza zatwierdzenie głosowania | Wypłata wymaga osobnych `release_tranche` i `withdraw_claim` |
| Claim zamyka się po wypłacie, a etap nadal ma `Released` | Można ponownie utworzyć claim tego etapu, jeżeli limit `released <= raised` pozwala; brak trwałej flagi jednorazowego rozliczenia |
| `withdraw_claim` rozpoznaje split po adresie przekazanego konta | Przekazanie `campaign` zamiast split PDA wybiera wypłatę do twórcy nawet przy istniejącym splicie; split nie jest wymuszony |
| Kaucję można odebrać zaraz po sukcesie | Nie jest zabezpieczeniem utrzymywanym obowiązkowo do końca etapów; późniejsza konfiskata dotyczy tylko faktycznego salda bond vault |
| `claim_bond` wymaga `Succeeded` i braku termination | Brak obecnej ścieżki odbioru kaucji po nieudanej zbiórce lub dobrowolnym termination bez konfiskaty |
| `base_budget` może być mniejszy od `goal`, a alokacja nie musi wypełniać budżetu | Pozostałe środki nie są automatycznie wypłacane po etapach; termination otwiera zwroty |
| Split można utworzyć po rozpoczęciu wypłat; nie ma aktualizacji | Podział jest wybierany przy każdej wypłacie, nie zamrażany w claimie |
| Zakończenie blokuje niewypłacone claimy | Ich środki pozostają częścią puli zwrotów, a ich konta nie są automatycznie zamykane |

Są to ograniczenia aktualnego API, nie gwarancje docelowego produktu ani wynik pełnego audytu.

## Wymagane zmiany API przed MVP

Ta sekcja jest listą zmian do wykonania, **nie** opisem działających obecnie
instrukcji. Sygnatury i kody błędów nowych instrukcji trzeba ustalić przy
implementacji; przykłady powyżej pozostają prawidłowe tylko dla bieżącego kodu.
Docelowe MVP tworzy wyłącznie kampanie etapowe; `create_campaign` i
`claim_success` zwykłej kampanii to ścieżka legacy do wycofania z produktu.

| Obszar | Docelowa kontrola programu |
| --- | --- |
| Tworzenie i publikacja | Rozdzielić szkic od uruchomienia zbiórki albo utworzyć wszystkie warunki atomowo. Przy starcie zweryfikować 7-183 dni, 2-5 dodatnich transz (wliczając pierwszą), każdą najwyżej 50% i sumę dokładnie 100%. Po starcie nie dopuścić dodania/edycji opisu, harmonogramu i splitu. Bez podpisu platformy lub weryfikacji twórcy. |
| Wpłaty | Usunąć ograniczenie `raised <= goal` i globalny rejestr 12 adresów. Zachować osobny ledger dla każdego wspierającego; umożliwić anulowanie własnej wpłaty przed terminem i poprawnie pomniejszać `raised`. Po terminie zamrozić końcową sumę. |
| Finał zbiórki i prowizja | Gdy `raised < goal`, żadnej prowizji i prawo do zwrotu dokładnie całej wpłaty. Gdy `raised >= goal`, pobrać dokładnie raz 1% od **całej** wpłaconej sumy, również nadwyżki. Rozdzielić prowizję od kosztów sieci/rent oraz od kaucji. Wyliczać transze od 99% pozostałej kwoty z jednoznacznym przydziałem reszt zaokrągleń. |
| Głosowanie | Zapisać początek/koniec rundy. `vote_milestone` działa tylko przez 7 dni, `finalize_vote` dopiero po zakończeniu okna. „Tak” musi reprezentować ponad 50% **wszystkich** zamrożonych wpłat; dokładnie 50% i brak głosów oznaczają odmowę. Po pierwszej odmowie jest sztywne 30 dni na ponowny dowód; druga 7-dniowa runda zaczyna się po upływie 30 dni, także przy wcześniejszym zgłoszeniu poprawki. Bez dowodu po 30 dniach lub po drugiej odmowie każdy może zakończyć kampanię. |
| Etapy i wypłaty | Egzekwować terminy i kolejność, a przekroczony termin etapu dopuścić do zakończenia kampanii bez twórcy. Trwale oznaczać przyznanie/rozliczenie transzy, także po zamknięciu claimu, by nie powstał drugi claim. Po zatwierdzeniu dowolny caller może uruchomić transzę. Jeżeli zadeklarowano split, jego PDA i odbiorcy muszą być wyegzekwowani z zapisanego stanu; brak możliwości ominięcia przez inne konto. |
| Zakończenie | Zarezerwować lub wypłacić już przyznane, niewypłacone roszczenia przed obliczeniem puli zwrotów. Pozostałe środki i ewentualnie skonfiskowaną kaucję rozdzielać indywidualnie; nie pozwolić twórcy dowolnie wyzerować prawa do zatwierdzonej transzy. Dodać drogę zakończenia po bezczynności twórcy. |
| Kaucja | Każda nowa kampania MVP wpłaca przy utworzeniu dokładnie 0,1 SOL do oddzielnego vault. Przed implementacją ustalić warunki i czas zwrotu/przepadku po nieosiągnięciu celu, pełnym sukcesie, dobrowolnym zakończeniu, bezczynności i definitywnej porażce. Nie pozwolić na wcześniejsze `claim_bond`. |
| Zwroty | Wycofać `refund_all`. Zostawić indywidualny `claim_refund` oraz indywidualny zwrot po zakończeniu; żadna ścieżka nie może wymagać tablicy wszystkich wspierających. |

Zmiana układu `CampaignAccount` i danych wejściowych będzie zmianą protokołu:
po implementacji należy wygenerować nowe IDL i uaktualnić klientów, indeksowanie,
testy oraz tę dokumentację. Sam update interfejsu nie uszczelnia kontraktu.
