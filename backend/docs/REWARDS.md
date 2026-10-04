# Nagrody serwerowe

Nagrody nie są częścią programu Solana. Backend może przechowywać ofertę i
realizację, ale kwalifikację sprawdza na podstawie potwierdzonego ledgera
wpłaty oraz statusu kampanii z indeksatora.

Endpointy:

- `GET /api/accounts/rewards/campaigns/:campaign/rewards` — publiczne oferty.
- `POST /api/accounts/rewards` — twórca kampanii tworzy ofertę.
- `POST /api/accounts/rewards/:id/claim` — zalogowany backer składa claim;
  dla nagrody fizycznej body zawiera `delivery`.
- `GET /api/accounts/rewards/me/reward-claims` — claims powiązane z portfelami
  konta.

Obsługiwane typy to `message`, `file`, `code` i `physical`. `minAmount` jest
kwotą w lamportach, a `quantity` ogranicza liczbę realizacji. Unikalny klucz
`(reward_id, wallet)` blokuje podwójne wydanie tej samej nagrody.

W MVP treść cyfrowa jest zwracana w claimie wyłącznie jako lokalny mechanizm
demonstracyjny. Przed użyciem produkcyjnym należy zastąpić ją zaszyfrowanym
storage i jednorazowym URL-em. Dane adresowe nagród fizycznych muszą być
szyfrowane i nie mogą trafić do Solany.
