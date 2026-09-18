# Testes de falha

Cada caso registra preparação, pedido enviado, resultado esperado e resultado
observado. Valores transitórios (cookie, state, code, token) aparecem como
[REMOVIDO].

## Caso 1 — retorno sem cookie temporário

- **Preparação:** login iniciado em uma janela comum, parado na página do
  provedor; a URL de autorização foi copiada para uma janela privativa que não
  possui o cookie `__Host-oauth-tx`.
- **Pedido enviado:** `GET /oauth/callback/google?code=[REMOVIDO]&state=[REMOVIDO]`
  a partir da janela privativa.
- **Resultado esperado:** a rota recusa a resposta e não cria sessão.
- **Resultado observado:** HTTP 400 com `{"error":"transacao_ausente"}`; nenhuma
  linha nova em `sessions`; `/api/me` continua respondendo 401.

## Caso 2 — state alterado

- **Preparação:** novo login iniciado, parado na página do provedor antes de
  informar as credenciais.
- **Pedido enviado:** um caractere do parâmetro `state` foi alterado na barra de
  endereço antes de concluir o login. A URL modificada não é registrada aqui.
- **Resultado esperado:** a rota recusa a resposta antes de trocar o código.
- **Resultado observado:** HTTP 400 com `{"error":"transacao_invalida"}`; o
  provedor não recebeu nenhum pedido de troca de código.

## Caso 3 — reutilização da transação

- **Preparação:** um login concluído com sucesso; a requisição de retorno foi
  copiada do painel Network com *Copy URL*.
- **Pedido enviado:** a mesma URL de retorno aberta uma segunda vez.
- **Resultado esperado:** a transação já foi apagada e a repetição falha.
- **Resultado observado:** HTTP 400 com `{"error":"transacao_invalida"}`; a
  sessão criada no primeiro fluxo continua válida e nenhuma sessão nova
  aparece no D1.

## Caso 4 — sessão expirada

- **Preparação:** sessão de teste criada pelo caminho feliz.
- **Pedido enviado:** `UPDATE sessions SET expires_at = 0;` no console do D1 e,
  em seguida, recarga da página e nova consulta a `/api/me`.
- **Resultado esperado:** `/api/me` responde 401.
- **Resultado observado:** HTTP 401 com `{"error":"sessao_invalida"}`; a página
  volta a exibir "Nenhuma sessão neste navegador."

## Caso 5 — origem inválida na saída

- **Preparação:** sessão válida aberta em URL_BASE e uma segunda aba em
  `https://example.com`.
- **Pedido enviado:** no console da segunda aba,
  `fetch("URL_BASE/oauth/logout", { method: "POST", credentials: "include" })`.
- **Resultado esperado:** a rota recusa a operação e a sessão original
  permanece válida.
- **Resultado observado:** HTTP 403 com `{"error":"origem_invalida"}`; de volta
  à aba de URL_BASE, `/api/me` continua respondendo 200.

## Caso 6 — reutilização do cookie revogado

- **Preparação:** sessão exclusiva do laboratório; o valor de `__Host-session`
  foi copiado temporariamente pelas ferramentas de desenvolvimento e apagado
  logo depois do teste.
- **Pedido enviado:** logout, restauração do mesmo valor de cookie e nova
  consulta a `/api/me`.
- **Resultado esperado:** 401, porque a linha correspondente saiu do D1.
- **Resultado observado:** HTTP 401 com `{"error":"sessao_invalida"}`; o valor
  copiado foi descartado e não consta desta evidência.
