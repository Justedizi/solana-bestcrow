# Błędy i zdarzenia

[Spis dokumentacji](../README.md) · [API](API.md) · [Integracja](INTEGRATION.md)

## Jak interpretować błąd

`CharityVaultError` jest zdefiniowany w [error.rs](../programs/charity-vault/src/error.rs).
Domyślne własne kody Anchor zaczynają się od 6000; poniższa numeracja wynika
z obecnej kolejności enumu. Przy zmianie kodu generuj aktualne IDL, zamiast
zakładać, że numery pozostaną takie same.

Błąd może pochodzić również z Anchor, System Program lub runtime Solany:
np. zły signer, nieprawidłowe seeds, niewłaściwy owner, brak środków na rent
albo próba `init` istniejącego konta. Nie każdy błąd pojawi się w tej tabeli.
W logach ustal, która instrukcja się nie powiodła. Ponawianie identycznego
wywołania nie naprawi błędnego stanu lub brakującego konta.

## Własne kody błędów

| Kod | Nazwa | Znaczenie w obecnym kodzie |
| --- | --- | --- |
| 6000 | `InvalidGoal` | Cel / budżet nieprawidłowy lub zerowa wpłata |
| 6001 | `InvalidDeadline` | Termin zbiórki nie jest w przyszłości |
| 6002 | `CampaignNotActive` | Instrukcja wymaga `Active` |
| 6003 | `DeadlinePassed` | Minął termin wpłat / dodawania etapów |
| 6004 | `DeadlineNotPassed` | Za wcześnie na `finalize` |
| 6005 | `CampaignNotSucceeded` | Instrukcja wymaga `Succeeded` |
| 6006 | `CampaignNotRefunded` | Instrukcja wymaga `Refunded` |
| 6007 | `CampaignNotStaged` | Wymagana zbiórka etapowa |
| 6008 | `CampaignTerminated` | Zbiórka ma `terminated = true` |
| 6009 | `CampaignNotTerminated` | Zwrot wymaga wcześniejszego `terminate` |
| 6010 | `GoalNotReached` | W miejscach użycia: `raised` musi być dodatnie |
| 6011 | `GoalReached` | Zdefiniowany, obecnie nieużywany w handlerach |
| 6012 | `GoalOverflow` | Wpłata przekroczyłaby cel |
| 6013 | `DonorRegistryFull` | Limit 12 różnych darczyńców wyczerpany |
| 6014 | `DonorNotRegistered` | Ledger / darczyńca nie zgadza się lub brak dodatniej wagi |
| 6015 | `AlreadyClaimed` | Wypłata oznaczona jako odebrana |
| 6016 | `InvalidRefundAccounts` | Błędna lista kont w `refund_all` |
| 6017 | `InsufficientVaultBalance` | Brak środków lub przekroczony limit rozliczanych transz |
| 6018 | `ArithmeticOverflow` | Przepełnienie sprawdzanej operacji arytmetycznej |
| 6019 | `TooManyMilestones` | Zdefiniowany, obecnie nieużywany; limit sprawdzany przez `InvalidMilestoneIndex` |
| 6020 | `InvalidMilestoneIndex` | Niewłaściwy indeks lub kolejność dodawania etapów |
| 6021 | `MilestoneExceedsHalf` | Etap / pierwsza transza przekracza połowę budżetu |
| 6022 | `MilestoneSumExceedsBudget` | Łączna alokacja przekracza `base_budget` |
| 6023 | `InvalidMilestoneStatus` | Stan etapu nie pozwala na tę operację |
| 6024 | `UnauthorizedCreator` | Inny caller próbuje termination bez odrzuconego etapu |
| 6025 | `VoteWeightExceedsRaised` | Łączna waga głosów przekroczyłaby sumę wpłat |
| 6026 | `AlreadyVoted` | Zdefiniowany, obecnie nieużywany; duplikat blokuje `init` vote PDA |
| 6027 | `InvalidSplit` | Błędny podział albo ujemny `duration` w `release_tranche` |
| 6028 | `NothingVested` | Brak nowej kwoty do wypłaty z claimu |
| 6029 | `InvalidRecipient` | Brak / błędny odbiorca wypłaty lub reszty po zwrotach |
| 6030 | `BondUnavailable` | Kaucja oznaczona jako skonfiskowana |
| 6031 | `NoBond` | Zadeklarowana kwota kaucji wynosi 0 |
| 6032 | `StagedCampaignUsesMilestones` | `claim_success` nie działa dla zbiórki etapowej |

Odmowa dostępu w `has_one = creator` pochodzi zwykle z ograniczeń Anchor,
a nie z własnego `UnauthorizedCreator`. Odwołania do zamkniętych kont też
mogą zawieść podczas deserializacji, przed wejściem do handlera.

## Zdarzenia

Zdarzenia są emitowane przez `emit!` w modułach
[instructions/](../programs/charity-vault/src/instructions/).
Standardowy payload Anchor zaczyna się od 8-bajtowego discriminatora
`SHA-256("event:NazwaZdarzenia")[0..8]`, po którym są pola Borsh.
W logach `Program data:` są zakodowane jako base64.

| Zdarzenie | Instrukcja | Pola w kolejności serializacji |
| --- | --- | --- |
| `CampaignCreated` | `create_campaign` | `campaign`, `creator`, `campaign_id`, `goal`, `deadline`, `desc_hash` |
| `PledgeReceived` | `pledge` | `campaign`, `donor`, `amount`, `raised` |
| `CampaignFinalized` | `finalize` | `campaign`, `status` |
| `SuccessClaimed` | `claim_success` | `campaign`, `creator`, `amount` |
| `RefundIssued` | `claim_refund`, `refund_all` | `campaign`, `donor`, `amount` |
| `StagedCampaignCreated` | `create_staged_campaign` | `campaign`, `creator`, `campaign_id`, `goal`, `deadline`, `desc_hash`, `base_budget`, `initial_tranche`, `bond` |
| `MilestoneAdded` | `add_milestone` | `campaign`, `index`, `amount`, `deadline`, `evidence_hash` |
| `EvidenceSubmitted` | `submit_evidence` | `campaign`, `index`, `evidence_hash`, `round` |
| `MilestoneVoted` | `vote_milestone` | `campaign`, `index`, `round`, `backer`, `approve`, `weight` |
| `MilestoneFinalized` | `finalize_vote` | `campaign`, `index`, `round`, `approve_bps`, `status` |
| `TrancheReleased` | `release_initial`, `release_tranche` | `campaign`, `index`, `amount`, `streamed` |
| `ClaimWithdrawn` | `withdraw_claim` | `campaign`, `index`, `amount` |
| `CampaignTerminated` | `terminate` | `campaign`, `refund_pool`, `bond_forfeited` |
| `TerminationRefund` | `claim_termination_refund` | `campaign`, `donor`, `amount` |
| `BondClaimed` | `claim_bond` | `campaign`, `creator`, `amount` |

Adresy mają typ `Pubkey`, kwoty oraz `campaign_id` i `approve_bps` to `u64`,
terminy to `i64`, hashe to `[u8; 32]`, `index` / `round` to `u8`.
`approve`, `streamed`, `bond_forfeited` to `bool`.
`status` w `CampaignFinalized` to `CampaignStatus`, a w `MilestoneFinalized`
to `MilestoneStatus`.

`set_split` nie emituje zdarzenia: odczytaj `SplitAccount`.
`TrancheReleased` z `index = 255` oznacza pierwszą transzę. Dla zwykłego
etapu zdarzenie opisuje utworzenie claimu, a nie transfer SOL.
Kwoty `RefundIssued` i `TerminationRefund` nie obejmują osobnego zwrotu
rezerwy zamykanego ledgeru.

## Wskazówki dla indeksowania

- Przetwarzaj tylko transakcje zakończone sukcesem: log może powstać przed późniejszym błędem i wycofaniem zmian.
- Sprawdzaj, z którego programu pochodzi log; sama nazwa zdarzenia nie wystarcza.
- Ustal commitment zgodnie z potrzebami aplikacji i obsługuj ponowne dostarczenie danych.
- Zdarzenia nie zastępują odczytu kont; weryfikuj saldo vault i aktualne flagi przy rozliczeniach.
- Zachowaj podpis transakcji i pozycję zdarzenia, żeby nie zaksięgować go ponownie.
