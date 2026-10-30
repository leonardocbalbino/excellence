# Política de privacidade: app Excellence

O texto fica publicado no site, sem login:

- **Produção:** `http://169.58.37.26:8200/privacidade` (com o domínio, passa a ser
  `https://excellence.cartaocolaborativa.com.br/privacidade`)
- **Staging:** `http://169.58.37.26:8201/privacidade`

A fonte única do texto é
[`apps/web/src/features/legal/privacy-page.tsx`](../../apps/web/src/features/legal/privacy-page.tsx).
Mude lá e o deploy publica.

## Antes de informar o endereço nas lojas

Os campos destacados em laranja na página (`<Fill>` no código) dependem do jurídico/DPO:

- razão social e CNPJ do fornecedor do sistema;
- nome e e-mail do encarregado de dados (DPO);
- prazos de guarda dos dados (pendências P-005, P-006 e P-010).

Troque cada `<Fill>…</Fill>` pelo valor, atualize `UPDATED_AT` e faça o deploy. Enquanto
houver campo destacado, a política está em rascunho e não deve ir para a loja.
