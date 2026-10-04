# Wdrożenie Bestcrow V2 na Devnet

Ten proces wykonuje osoba posiadająca portfel deployera z SOL na Devnet. Nie
używaj portfela z prawdziwymi środkami.

## Co oznaczają adresy

- **Program ID** identyfikuje kod programu na Solanie. W `rust/Anchor.toml`
  obecny identyfikator to `74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG`.
  Sam wpis w pliku nie oznacza jeszcze wdrożenia.
- **Upgrade authority** to publiczny adres portfela, który może aktualizować
  program. Przed blokadą edycji ten portfel wykonuje deployment i inicjalizację.
- **IDL** to wygenerowany opis instrukcji i kont programu. Powstaje po
  poprawnym buildzie, zwykle jako `rust/target/idl/charity_vault.json`.
- **ProtocolConfigV2** to konto PDA programu z adresem treasury i prowizją.
  Nie tworzy się go ręcznie w portfelu; tworzy je instrukcja
  `initialize_protocol_config_v2`.

## Przygotowanie jednorazowe

Zainstaluj Rust, Solana CLI, Node.js, Anchor CLI zgodny z `anchor-lang` w
`rust/programs/charity-vault/Cargo.toml`, a następnie ustaw portfel:

```powershell
solana config set --url https://api.devnet.solana.com
solana-keygen new --outfile $env:USERPROFILE\.config\solana\id.json
solana airdrop 2
solana address
```

W `rust/Anchor.toml` ustaw `provider.cluster = "devnet"`, `provider.wallet`
na ten sam plik oraz `programs.devnet.charity_vault` na uzgodniony Program ID.
Program ID musi odpowiadać kluczowi `rust/target/deploy/charity_vault-keypair.json`.

## Build i IDL

```powershell
Set-Location rust
anchor build
anchor keys list
anchor idl build
```

Jeżeli `anchor keys list` pokaże inny ID, zaktualizuj `Anchor.toml` i
`rust/programs/charity-vault/src/lib.rs` (`declare_id!`), po czym wykonaj build
ponownie. Nie twórz IDL ręcznie: IDL musi pochodzić z tego samego buildu, który
wdrażasz.

## Deployment i weryfikacja

```powershell
anchor deploy --provider.cluster devnet
solana program show <PROGRAM_ID> --url devnet
```

`solana program show` musi pokazać program na Devnecie i upgrade authority.
Zapisz podpis transakcji deploymentu oraz adres programu.

## Treasury i ProtocolConfigV2

Wybierz osobny publiczny adres treasury, np. adres portfela organizacji:

```powershell
$env:TREASURY = "PUBLIC_KEY_TREASURY"
```

Po deploymentcie wyślij jednorazową instrukcję
`initialize_protocol_config_v2(treasury)`. W Anchor można to zrobić skryptem
TypeScript używającym wygenerowanego IDL; instrukcja tworzy PDA z seeda
`config-v2`, zapisuje `fee_bps = 100` i adres treasury. Zapisz podpis tej
transakcji oraz wyliczony adres PDA.

Przed inicjalizacją sprawdź, że treasury jest poprawnym publicznym kluczem i że
nie jest adresem deployera przypadkowo wpisanym przez pomyłkę. Konfiguracja jest
jednorazowa.

## Zablokowanie aktualizacji

Najpierw wykonaj build, deployment, inicjalizację konfiguracji i smoke test.
Dopiero gdy wszystkie transakcje są potwierdzone:

```powershell
solana program set-upgrade-authority <PROGRAM_ID> --final --url devnet
solana program show <PROGRAM_ID> --url devnet
```

Po tej operacji program staje się nieaktualizowalny. Nie da się naprawić błędu
bez wdrożenia nowego programu pod nowym adresem i migracji klientów.

## Dowód działania

Zapisz w dokumentacji: Program ID, treasury, Config PDA, deployment signature,
config initialization signature, smoke test signatures oraz wynik
`solana program show`. Link ma postać:

`https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet`

