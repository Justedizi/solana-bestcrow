# Integracja i przykłady

[Spis dokumentacji](../README.md) · [API](API.md) · [Konta i PDA](ACCOUNTS.md)

## Co przygotować do wywołania

1. Wybierz sieć i RPC; `Anchor.toml` domyślnie wskazuje `localnet`.
2. Wyznacz wymagane PDA z Program ID i seeds.
3. Zbuduj argumenty oraz konta w kolejności z [API](API.md).
4. Wstaw instrukcję do transakcji z fee payerem i aktualnym blockhashem.
5. Zasymuluj transakcję, podpisz wymaganymi portfelami i wyślij ją.
6. Sprawdź potwierdzenie, błąd, logi oraz zaktualizowany stan kont.

Adres Program ID w konfiguracji nie jest dowodem, że program jest wdrożony
na danej sieci. Przykłady poniżej opisują budowanie danych oraz działanie
programu; nie wysyłają transakcji do publicznej sieci.

## IDL i ręczne kodowanie

IDL Anchor opisuje nazwy instrukcji, argumenty, konta i typy. Generowanie:

```bash
# Z foldera rust.
NO_DNA=1 anchor idl build -p charity-vault -o target/idl/charity_vault.json -t target/types/charity_vault.ts
```

Można użyć klienta wygenerowanego z IDL. Repozytorium ma również ręcznie
budowane instrukcje w [tests/flow.rs](../programs/charity-vault/tests/flow.rs),
[frontend/app/lib/charity-vault.ts](../../frontend/app/lib/charity-vault.ts)
i [backend/src/solana/program.ts](../../backend/src/solana/program.ts).
Zakres funkcji tych klientów nie musi obejmować wszystkich instrukcji programu.

Format danych instrukcji w tej implementacji:

```text
8 bajtów discriminatora + argumenty Borsh w kolejności z lib.rs
discriminator = SHA-256("global:nazwa_instrukcji")[0..8]
```

| Typ argumentu | Kodowanie |
| --- | --- |
| `u64`, `i64` | 8 bajtów little-endian |
| `u16` | 2 bajty little-endian |
| `u8` | 1 bajt |
| `bool` | 1 bajt: 0 albo 1 |
| `[u8; 32]`, `Pubkey` | 32 surowe bajty, bez długości |
| `Vec<T>` | Długość `u32` LE, potem elementy |

Przykładowo `vote_milestone(index = 2, approve = true)` ma 10 bajtów:
8 bajtów discriminatora, `0x02`, `0x01`. `pledge(amount)` ma 16 bajtów.
`set_split` koduje najpierw cały wektor adresów, potem cały wektor udziałów,
a nie pary adres–udział.

## Przykład Rust: PDA i instrukcja pledge

Fragment używa zależności dostępnych w testach `charity-vault`. Przyjmuje
adresy istniejącej zbiórki i darczyńcy. Buduje instrukcję, bez jej podpisywania
lub wysyłania:

```rust
use anchor_lang::prelude::Pubkey;
use solana_address::Address;
use solana_instruction::{account_meta::AccountMeta, Instruction};

fn address(key: Pubkey) -> Address {
    Address::new_from_array(key.to_bytes())
}

fn pledge_instruction(donor: Pubkey, campaign: Pubkey, amount: u64) -> Instruction {
    let (ledger, _) = Pubkey::find_program_address(
        &[b"donor", campaign.as_ref(), donor.as_ref()],
        &charity_vault::ID,
    );
    let (vault, _) = Pubkey::find_program_address(
        &[b"vault", campaign.as_ref()],
        &charity_vault::ID,
    );

    // SHA-256("global:pledge")[0..8], zgodny z tests/flow.rs.
    let mut data = vec![235, 47, 156, 254, 0, 88, 212, 142];
    data.extend_from_slice(&amount.to_le_bytes());

    let accounts = vec![
        AccountMeta { pubkey: address(donor), is_signer: true, is_writable: true },
        AccountMeta { pubkey: address(campaign), is_signer: false, is_writable: true },
        AccountMeta { pubkey: address(ledger), is_signer: false, is_writable: true },
        AccountMeta { pubkey: address(vault), is_signer: false, is_writable: true },
        AccountMeta {
            pubkey: address(anchor_lang::system_program::ID),
            is_signer: false,
            is_writable: false,
        },
    ];

    Instruction { program_id: address(charity_vault::ID), accounts, data }
}
```

Dla 1 SOL przekazujesz `amount = 1_000_000_000`. Darczyńca musi mieć również
środki na nowy ledger i, jeżeli jest fee payerem, opłatę transakcyjną.
Instrukcja nie zawiera blockhasha ani fee payera: te należą do transakcji.

## Przykład: zwykła zbiórka

| Krok | Wywołanie | Wynik |
| --- | --- | --- |
| 1 | Twórca: `create_campaign(1, 2_000_000_000, przyszły_deadline, hash)` | `Active`, cel 2 SOL |
| 2 | Darczyńca A: `pledge(1_000_000_000)` | `raised = 1 SOL`, ledger A = 1 SOL |
| 3 | Darczyńca B: `pledge(1_000_000_000)` | `raised = 2 SOL` |
| 4 | Po deadline, dowolny caller: `finalize()` | `Succeeded` |
| 5 | Twórca: `claim_success()` | Twórca dostaje 2 SOL + pozostałą rezerwę vault |

Osiągnięcie celu wcześniej nie pozwala przyspieszyć `finalize`.
Jeżeli wpłacono tylko 1 SOL, krok 4 daje `Refunded`, a krok 5 zastępują
`claim_refund` darczyńcy lub `refund_all` z pełną listą kont darczyńców.

## Przykład: zbiórka etapowa

Wartości przykładu: `goal = base_budget = 10 SOL`, `initial_tranche = 2 SOL`,
`bond = 1 SOL`. Etapy: indeks 0 za 4 SOL i indeks 1 za 4 SOL.
Łączna alokacja wynosi `2 + 4 + 4 = 10 SOL`; każdy etap mieści się w limicie 5 SOL.

| Krok | Wywołanie | Wynik |
| --- | --- | --- |
| 1 | `create_staged_campaign(id, goal, deadline, hash, base_budget, initial_tranche, bond)` | Twórca wpłaca kaucję, powstają dwa skarbce |
| 2 | `add_milestone(0, 4 SOL, termin_0, hash_0)`, następnie indeks 1 | Dwa etapy `Pending` |
| 3 | A wpłaca 7 SOL, B wpłaca 3 SOL przez `pledge` | Cel 10 SOL osiągnięty |
| 4 | Po deadline: `finalize()` | `Succeeded` |
| 5 | Twórca: `release_initial()` | 2 SOL trafiają od razu do twórcy |
| 6 | Twórca: `submit_evidence(0, nowy_hash)` | Etap 0 ma `Submitted` |
| 7 | A: `vote_milestone(0, true)` | 7 SOL wagi za, czyli 70% |
| 8 | Dowolny caller: `finalize_vote(0)` | Etap `Released`, jeszcze bez wypłaty |
| 9 | Twórca: `release_tranche(0, 3600)` | Claim 4 SOL odblokowywany przez godzinę |
| 10 | Dowolny caller: `withdraw_claim(0)` po 1800 sekundach od kroku 9 | 2 SOL możliwe do wypłaty |
| 11 | `withdraw_claim(0)` po pełnej godzinie | Pozostałe 2 SOL; claim zamknięty |

Kwoty zapisane jako `4 SOL` w tabeli trzeba przeliczyć na lamporty.
Przy wypłacie bez splitu przekaż `campaign` w polu `split` oraz twórcę
jako writable w `remaining_accounts`. Caller również powinien być writable.

## Przykład: podział i streaming

`set_split([odbiorca_A, odbiorca_B], [6000, 4000])` tworzy podział 60% / 40%.
Przy `withdraw_claim` przekaż właściwe split PDA i oba konta odbiorców `W`
w tej samej kolejności. Jeśli nowo odblokowane `delta` wynosi 2 SOL,
A dostaje 1,2 SOL, B dostaje 0,8 SOL. Split nie obejmuje pierwszej transzy.

Dzielenie odbywa się dla każdej wypłaty osobno. Ostatni odbiorca dostaje
resztę po zaokrągleniach, więc suma transferów zawsze wynosi `delta`.
Przeczytaj [ograniczenia egzekwowania splitu](API.md#istotne-zachowania-implementacji).

## Przykład: revision i termination

1. Pierwszy wynik poniżej 70% daje `Revision`, nawet przy 0% akceptacji.
2. Twórca ponownie wywołuje `submit_evidence`; otwiera rundę 2 z zerowymi wagami.
3. Darczyńcy głosują ponownie, używając nowych vote PDA z `round = 2`.
4. Drugi wynik poniżej 70% daje `Rejected`.
5. Dowolny caller wywołuje `terminate`; zapisuje się pula zwrotów.
6. Każdy darczyńca wywołuje `claim_termination_refund` z kontem twórcy `W` w remaining accounts.

Jeżeli z 10 SOL wpłat wypłacono tylko początkowe 2 SOL, pozostaje 8 SOL
plus rezerwa vault. Przy nadal zdeponowanej kaucji 1 SOL, jej konfiskata
dodaje również saldo bond vault. Każdy darczyńca otrzymuje:

```text
refund = floor(wpłata_darczyńcy * refund_pool / łączna_kwota_wpłat)
```

A z udziałem 70% dostaje około 6,3 SOL, B około 2,7 SOL, dodatkowo swoje
rezerwy ledgerów i proporcjonalną część rezerw w puli. Dokładna kwota
wynika z salda zamrożonego przez `terminate`, nie z zaokrąglonego przykładu.
Jeśli twórca wcześniej odebrał kaucję przez `claim_bond`, nie ma jej w tej puli.

## Przykłady i testy w repozytorium

[tests/flow.rs](../programs/charity-vault/tests/flow.rs) zawiera sześć testów:

| Test | Co sprawdza |
| --- | --- |
| `refund_flow_returns_exact_donations` | Indywidualne zwroty |
| `success_flow_releases_to_creator_and_batch_refunds` | Wypłatę po sukcesie i zbiorcze zwroty |
| `rejects_invalid_terms_and_out_of_window_calls` | Błędne warunki i wywołania poza terminem |
| `staged_approve_release_stream_and_bond` | Akceptację, claim, streaming i kaucję |
| `staged_revision_then_terminate_refunds_pro_rata` | Drugą rundę, termination i proporcjonalne zwroty |
| `staged_split_distributes_release` | Podział wypłaty |

Testy działają w procesie przez LiteSVM, bez RPC, devnet i podpisywania
transakcji publicznej sieci. Instrukcje uruchomienia są w [README](../README.md#budowanie-i-testowanie).
Lista testów nie oznacza pełnego pokrycia ograniczeń opisanych w API.
