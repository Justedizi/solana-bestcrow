# Konta, pola i PDA

[Spis dokumentacji](../README.md) · [API](API.md) · [Mechanizmy Solany](SOLANA.md)

Źródła: [state.rs](../programs/charity-vault/src/state.rs) oraz
[constants.rs](../programs/charity-vault/src/constants.rs).

## Adresy PDA

Wszystkie poniższe adresy wyznaczaj z Program ID
`74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG`.
`creator`, `campaign`, `donor`, `milestone` i `backer` w seeds oznaczają
32 surowe bajty adresu, nie tekst base58.

| Konto | Seeds w kolejności |
| --- | --- |
| `campaign` | `[b"campaign", creator, campaign_id.to_le_bytes()]` |
| `vault` | `[b"vault", campaign]` |
| `bond_vault` | `[b"bond", campaign]` |
| `ledger` | `[b"donor", campaign, donor]` |
| `milestone` | `[b"milestone", campaign, [index]]` |
| `vote` | `[b"vote", milestone, [round], backer]` |
| `split` | `[b"split", campaign]` |
| `claim` | `[b"claim", campaign, [index]]` |

`campaign_id` jest `u64` (8 bajtów LE); `index` i `round` są `u8` (1 bajt).
Runda pochodzi z `milestone.round`. Claim jest wspólny dla całej transzy,
nie powstaje osobne konto claim dla każdego odbiorcy splitu.

## Format danych

Konta typowane Anchor mają 8-bajtowy discriminator i pola Borsh w kolejności
deklaracji w Rust. Standardowy discriminator konta to pierwsze 8 bajtów
SHA-256 z `account:NazwaStruktury`, z zachowaniem wielkości liter.
`vault` i `bond_vault` mają `space = 0`, bez discriminatora.

`u64` / `i64` mają 8 bajtów LE, `u16` 2 bajty LE, `u8` i `bool` 1 bajt,
`Pubkey` 32 bajty. Enum statusu jest tagiem `u8` według kolejności wariantów.
Stałe tablice nie mają prefiksu długości. Wartości kwot czytaj w JS jako `bigint`.

## CampaignAccount

| Pole | Typ | Znaczenie |
| --- | --- | --- |
| `creator` | `Pubkey` | Twórca i podstawowy odbiorca wypłat |
| `campaign_id` | `u64` | Identyfikator unikalny dla twórcy, część seeds |
| `goal` | `u64` | Cel w lamportach; wpłaty nie mogą go przekroczyć |
| `deadline` | `i64` | Termin zakończenia zbierania wpłat |
| `desc_hash` | `[u8; 32]` | Hash opisu; program nie przechowuje tekstu ani URL-a |
| `raised` | `u64` | Suma wpłat, nie aktualne saldo vault; nie maleje po wypłatach |
| `paid` | `bool` | Czy wykonano `claim_success` lub `release_initial` |
| `status` | `CampaignStatus` | `Active = 0`, `Succeeded = 1`, `Refunded = 2` |
| `donor_count` | `u8` | Liczba zarejestrowanych różnych darczyńców |
| `donors` | `[Pubkey; 12]` | Rejestr według kolejności pierwszych wpłat; użyj pierwszych `donor_count` pól |
| `bump` | `u8` | Bump campaign PDA |
| `staged` | `bool` | Czy zbiórka jest etapowa |
| `base_budget` | `u64` | Limit budżetu transzy początkowej i etapów |
| `initial_tranche` | `u64` | Kwota jednorazowej wypłaty początkowej |
| `released` | `u64` | Wypłacona transza początkowa + kwoty utworzonych claimów; nie suma faktycznych wypłat claimów |
| `bond` | `u64` | Zadeklarowana kaucja, nie bieżące saldo bond vault |
| `bond_forfeited` | `bool` | Czy kaucja została przeniesiona do puli zwrotów |
| `terminated` | `bool` | Niezależna flaga zakończenia zbiórki etapowej |
| `milestone_count` | `u8` | Liczba dodanych etapów, maksymalnie 5 |
| `allocated` | `u64` | Transza początkowa + suma kwot dodanych etapów |
| `rejections` | `u8` | Liczba etapów odrzuconych po drugiej rundzie |
| `refund_pool` | `u64` | Saldo vault zamrożone logicznie przez `terminate` |
| `refunds_claimed` | `u8` | Liczba wykonanych zwrotów po termination |

`terminate` ustawia `terminated`, ale nie zmienia `status` na `Refunded`.
W zwykłej zbiórce pola rozszerzenia etapowego są inicjalizowane zerami / `false`.
Pola i rejestr darczyńców pozostają po zwrotach; zamykane są ledgery.

## DonorLedgerAccount

| Pole | Typ | Znaczenie |
| --- | --- | --- |
| `campaign` | `Pubkey` | Zbiórka |
| `donor` | `Pubkey` | Darczyńca |
| `amount` | `u64` | Łączna kwota wszystkich jego wpłat i waga głosu |
| `claimed` | `bool` | Flaga sprawdzana przy zwrotach; obecne zwroty zamykają konto zamiast ustawiać ją na `true` |
| `bump` | `u8` | Bump ledger PDA |

## MilestoneAccount

| Pole | Typ | Znaczenie |
| --- | --- | --- |
| `campaign` | `Pubkey` | Zbiórka |
| `index` | `u8` | Indeks `0..4`, nadawany kolejno podczas dodawania |
| `amount` | `u64` | Kwota etapu |
| `deadline` | `i64` | Zapisany termin; obecne handlery nie egzekwują go |
| `evidence_hash` | `[u8; 32]` | Hash dowodów, zastępowany przez `submit_evidence` |
| `status` | `MilestoneStatus` | Stan etapu, patrz niżej |
| `approve_weight` | `u64` | Suma wag głosów za w bieżącej rundzie |
| `reject_weight` | `u64` | Suma wag głosów przeciw w bieżącej rundzie |
| `round` | `u8` | Początkowo 1; po nieudanej pierwszej rundzie 2 |
| `bump` | `u8` | Bump milestone PDA |

| Tag | Status | Znaczenie |
| --- | --- | --- |
| 0 | `Pending` | Etap dodany, bez rozpoczętego głosowania |
| 1 | `Submitted` | Dowody zgłoszone; można głosować i rozstrzygnąć |
| 2 | `Revision` | Pierwsza runda poniżej 70%; twórca może ponownie zgłosić dowody |
| 3 | `Released` | Głosowanie zatwierdziło etap; trzeba jeszcze utworzyć i wypłacić claim |
| 4 | `Rejected` | Druga runda poniżej 70%; dowolny caller może zakończyć zbiórkę |

Komentarz przy `Revision` w kodzie wspomina zakres 50–70%, ale handler
stosuje `Revision` dla **każdego** wyniku poniżej 70% w pierwszej rundzie.

## VoteRecord

| Pole | Typ | Znaczenie |
| --- | --- | --- |
| `milestone` | `Pubkey` | Etap |
| `backer` | `Pubkey` | Głosujący darczyńca |
| `approve` | `bool` | Głos za (`true`) lub przeciw (`false`) |
| `weight` | `u64` | Kwota z ledgeru w chwili głosowania |
| `bump` | `u8` | Bump vote PDA |

Runda jest w adresie PDA, nie w polach `VoteRecord`. `init` uniemożliwia
ponowne utworzenie głosu tego samego darczyńcy w tej samej rundzie.

## SplitAccount

| Pole | Typ | Znaczenie |
| --- | --- | --- |
| `campaign` | `Pubkey` | Zbiórka |
| `count` | `u8` | Liczba odbiorców, od 1 do 5 |
| `recipients` | `[Pubkey; 5]` | Adresy odbiorców w kolejności wypłat |
| `shares_bps` | `[u16; 5]` | Udziały w basis points; suma aktywnych pól musi wynosić 10 000 |
| `bump` | `u8` | Bump split PDA |

`100 bps = 1%`. Używaj pierwszych `count` elementów obu tablic.
Ostatni odbiorca dostaje resztę po zaokrągleniach dla danej wypłaty.

## ClaimAccount

| Pole | Typ | Znaczenie |
| --- | --- | --- |
| `campaign` | `Pubkey` | Zbiórka |
| `milestone_index` | `u8` | Indeks etapu |
| `recipient` | `Pubkey` | Twórca; odbiorca przy wypłacie bez splitu |
| `total` | `u64` | Cała kwota transzy |
| `claimed` | `u64` | Ile faktycznie wypłacono z tego claimu |
| `start` | `i64` | Czas utworzenia claimu |
| `duration` | `i64` | Czas liniowego odblokowania; 0 oznacza całość od razu |
| `bump` | `u8` | Bump claim PDA |

Split jest dobierany podczas `withdraw_claim`, nie kopiowany do claimu.
Po pełnej wypłacie claim jest zamykany.

## Odczyt przez klienta

1. Wyznacz PDA z tabeli albo wyszukaj konta przez `getProgramAccounts`.
2. Sprawdź `owner`, długość danych i discriminator przed dekodowaniem.
3. Zdekoduj typ zgodnie z IDL / Borsh i kolejnością pól w `state.rs`.
4. Salda skarbców odczytaj osobno; `raised`, `released` i `bond` nie są saldami.

Odczyt kont przez RPC nie wymaga podpisu. Nieobecny ledger lub claim może
oznaczać, że konto zostało zamknięte po rozliczeniu.
