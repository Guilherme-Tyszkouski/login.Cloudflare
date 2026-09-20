# Testes de falha

Executados em 20/09/2026 contra https://login-cloudflare-7ni.pages.dev, no
Chrome, com o painel Network do DevTools aberto e *Keep log* ativo.

Cada caso registra preparação, pedido enviado, resultado esperado e resultado
observado. Valores transitórios (cookie de transação, cookie de sessão, state,
code, nonce e code_challenge) aparecem como [REMOVIDO].

## Caso 1 — retorno sem cookie temporário

- **Preparação:** login iniciado com o GitHub na janela comum, parando na tela
  de autorização sem autorizar. Em outra aba do mesmo navegador, o cookie
  `__Host-oauth-tx` foi apagado pelo painel Application > Cookies.
- **Pedido enviado:** `GET /oauth/callback/github?code=[REMOVIDO]&state=[REMOVIDO]`,
  gerado ao clicar em Autorizar já sem o cookie de transação.
- **Resultado esperado:** a rota recusa a resposta e não cria sessão.
- **Resultado observado:** HTTP **400** com `{"error":"transacao_ausente"}`.
  Nenhuma sessão criada.

**Observação sobre o método.** O roteiro sugere concluir o login em uma janela
privativa. Essa variante foi tentada primeiro com o Google e não chegou a
exercitar a rota: o próprio Google respondeu 400 em
`accounts.google.com/signin/oauth/consent`, porque a URL de autorização carrega
um parâmetro `part=` vinculado à sessão do navegador onde foi gerada, e colá-la
em outro contexto a invalida antes do retorno. A deleção do cookie produz
exatamente a mesma condição na fronteira que se quer testar — o retorno chega
sem `__Host-oauth-tx` — sem depender do comportamento interno do provedor.

## Caso 2 — state alterado

- **Preparação:** login iniciado com o GitHub, parando na tela de autorização.
  O cookie de transação foi mantido.
- **Pedido enviado:** na URL de autorização, um único caractere do parâmetro
  `state` foi alterado antes de autorizar. A URL modificada não é registrada
  aqui por conter valores transitórios.
- **Resultado esperado:** a rota recusa a resposta antes de trocar o código.
- **Resultado observado:** HTTP **400** com `{"error":"state_invalido"}`.

Este caso se distingue do Caso 1: aqui a transação **foi** localizada no D1
pelo resumo do cookie, e a recusa veio da comparação do resumo do state. São
duas fronteiras diferentes, verificadas em ordem.

## Caso 3 — reutilização da transação

- **Preparação:** um login com o GitHub concluído com sucesso, chegando ao
  painel autenticado. A requisição de retorno foi copiada do painel Network
  com *Copy URL*.
- **Pedido enviado:** a mesma URL de retorno aberta uma segunda vez.
- **Resultado esperado:** a transação já foi apagada e a repetição falha.
- **Resultado observado:** HTTP **400** com `{"error":"transacao_ausente"}`.
  A sessão criada no primeiro fluxo permaneceu válida e nenhuma sessão nova
  foi criada.

**Observação.** O erro observado é `transacao_ausente`, e não
`transacao_invalida`, porque a conclusão bem-sucedida faz duas coisas ao mesmo
tempo: apaga a linha em `oauth_transactions` e expira o cookie
`__Host-oauth-tx` na resposta. Na repetição o navegador já não tem o cookie
para enviar, então a recusa acontece um passo antes da consulta ao banco. As
duas defesas existem e qualquer uma delas, isolada, já impediria a reutilização.

## Caso 4 — sessão expirada

- **Preparação:** sessão criada pelo caminho feliz com o GitHub, com o painel
  autenticado aberto.
- **Pedido enviado:** `UPDATE sessions SET expires_at = 0;` no console do D1 e,
  em seguida, recarga da página com F5.
- **Resultado esperado:** `/api/me` responde 401.
- **Resultado observado:** HTTP **401** em `GET /api/me`, e a página voltou a
  exibir "Nenhuma sessão neste navegador".

O cookie continuou no navegador e a linha continuou na tabela `sessions`. O que
mudou foi apenas a validade, o que demonstra que `expires_at` é conferido a
cada consulta, e não somente no momento em que a sessão é criada.

## Caso 5 — origem inválida na saída

- **Preparação:** sessão válida aberta em URL_BASE e uma segunda aba em
  `https://example.com`.
- **Pedido enviado:** no console da aba do example.com,
  `fetch("https://login-cloudflare-7ni.pages.dev/oauth/logout", { method: "POST", credentials: "include" })`.
- **Resultado esperado:** a rota recusa a operação e a sessão original
  permanece válida.
- **Resultado observado:** o console registrou
  `POST .../oauth/logout net::ERR_FAILED 403 (Forbidden)`, além da mensagem de
  bloqueio por CORS. De volta à aba de URL_BASE, a recarga manteve o painel
  autenticado.

As duas recusas são independentes e é isso que o caso demonstra. O bloqueio de
CORS é do navegador e apenas impede o example.com de **ler** a resposta. O
**403** é da própria Function, pela conferência do cabeçalho `Origin` contra
`PUBLIC_BASE_URL`: a rota se defende sem depender do navegador.

## Caso 6 — reutilização do cookie revogado

- **Preparação:** sessão exclusiva do laboratório. O valor de `__Host-session`
  foi copiado pelo painel Application > Cookies e descartado ao final do teste.
- **Pedido enviado:** logout pelo botão Sair; em seguida, restauração do mesmo
  valor de cookie com
  `document.cookie = "__Host-session=[REMOVIDO]; Path=/; Secure"` e nova
  consulta a `/api/me`.
- **Resultado esperado:** 401, porque a linha correspondente saiu do D1.
- **Resultado observado:** HTTP **401** em `GET /api/me` e a página exibindo
  "Nenhuma sessão neste navegador". O painel Application > Cookies confirmou
  que o cookie estava de volta no navegador, com valor idêntico ao anterior.

Cookie presente e 401 ao mesmo tempo é o ponto do caso: a recusa não vem do
navegador, vem do banco. O resumo SHA-256 do cookie não encontra linha alguma
em `sessions`, porque o logout a removeu. Um cookie capturado antes do logout
não tem valor depois dele.

## Resumo

| Caso | Fronteira exercitada | Status HTTP | Erro |
| --- | --- | --- | --- |
| 1 | cookie de transação ausente | 400 | transacao_ausente |
| 2 | state adulterado | 400 | state_invalido |
| 3 | transação de uso único | 400 | transacao_ausente |
| 4 | expiração da sessão | 401 | sessao_invalida |
| 5 | conferência de Origin na saída | 403 | origem_invalida |
| 6 | cookie revogado | 401 | sessao_invalida |
