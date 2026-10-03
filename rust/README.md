# Charity Vault: dokumentacja programu Solana

Folder `rust` zawiera program crowdfundingowy `charity_vault` napisany w Rust
z użyciem **Anchor 1.1.2**. Obsługuje wpłaty w SOL, zbiórki typu „wszystko albo
nic” oraz zbiórki etapowe z głosowaniem darczyńców, kaucją i wypłatami w czasie.

Dokumentacja opisuje **obecną implementację** w `programs/charity-vault/src`,
a nie tylko założenia produktu. API programu to instrukcje transakcji Solany,
nie endpointy HTTP.

## Od czego zacząć

| Chcę… | Dokument |
| --- | --- |
| Zrozumieć konta, PDA, podpisy i przepływ SOL | [Mechanizmy Solany](docs/SOLANA.md) |
| Wywołać konkretną funkcję programu | [API: wszystkie 18 instrukcji](docs/API.md) |
| Odczytać stan lub wyznaczyć adres konta | [Konta, pola i PDA](docs/ACCOUNTS.md) |
| Złożyć instrukcję i przejść cały proces | [Integracja i przykłady](docs/INTEGRATION.md) |
| Obsłużyć błędy lub zdarzenia | [Błędy i zdarzenia](docs/ERRORS_EVENTS.md) |

## Dwa tryby zbiórki

**Zwykły:** `create_campaign` → `pledge` → `finalize`.
Po sukcesie twórca wywołuje `claim_success`. Po niepowodzeniu darczyńcy
wywołują `claim_refund` lub dowolny podpisujący uruchamia `refund_all`.

**Etapowy:** `create_staged_campaign` → `add_milestone` → `pledge` → `finalize`.
Po sukcesie twórca może wypłacić `release_initial`, przedstawić dowody
(`submit_evidence`) i zebrać głosy (`vote_milestone`). `finalize_vote` zatwierdza
etap, `release_tranche` tworzy prawo do wypłaty, a `withdraw_claim` wypłaca SOL.
`terminate` otwiera proporcjonalne zwroty przez `claim_termination_refund`.

## Najważniejsze wartości

| Parametr | Wartość |
| --- | --- |
| Program ID | `74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG` |
| Domyślna sieć w `Anchor.toml` | `localnet`; skonfigurowany jest też `devnet` |
| Jednostka kwot | lamporty: `1 SOL = 1_000_000_000 lamportów` |
| Jednostka terminów / czasu wypłat | sekundy; termin to Unix timestamp |
| Maksymalna liczba darczyńców | 12 różnych adresów na zbiórkę |
| Maksymalna liczba etapów / odbiorców podziału | 5 / 5 |
| Próg akceptacji etapu | 70% całej zebranej kwoty, nie tylko oddanych głosów |
| Limit pojedynczego etapu / pierwszej transzy | 50% `base_budget` |

## Mapa kodu

| Plik | Odpowiedzialność |
| --- | --- |
| [lib.rs](programs/charity-vault/src/lib.rs) | Publiczne instrukcje, Program ID i eksporty |
| [state.rs](programs/charity-vault/src/state.rs) | Dane kont i statusy |
| [constants.rs](programs/charity-vault/src/constants.rs) | Seeds PDA, limity i progi |
| [error.rs](programs/charity-vault/src/error.rs) | Własne błędy programu |
| [instructions/](programs/charity-vault/src/instructions/) | Walidacja kont i logika instrukcji |
| [tests/flow.rs](programs/charity-vault/tests/flow.rs) | Testy przepływów w LiteSVM i przykłady budowania instrukcji |

## Budowanie i testowanie

Uruchom z foldera `rust`:

```bash
# Testy wczytują plik target/deploy/charity_vault.so.
NO_DNA=1 anchor build --no-idl -- --arch v0
NO_DNA=1 cargo test --manifest-path programs/charity-vault/Cargo.toml

# Opcjonalnie: wygeneruj IDL i typy klienta.
NO_DNA=1 anchor idl build -p charity-vault -o target/idl/charity_vault.json -t target/types/charity_vault.ts
```

Dotychczasowa konfiguracja repozytorium używa `--arch v0` dla zgodności
z lokalnymi platform-tools v1.57. Przy innym toolchainie sprawdź zgodność celu
SBF. Pliki w `target/idl` i `target/types` są generowane, nie stanowią kodu źródłowego.

Przed integracją przeczytaj [istotne zachowania implementacji](docs/API.md#istotne-zachowania-implementacji):
dotyczą m.in. terminów głosowania, kaucji i ponownego utworzenia zamkniętego claimu.
