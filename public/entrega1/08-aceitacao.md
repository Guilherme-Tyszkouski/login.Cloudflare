# Critérios de aceitação

Projeto: login-cloudflare
URL de produção: https://login-cloudflare-7ni.pages.dev
Ramificação de produção: main
Banco D1: oauth-sessions-guilherme (binding DB)
Repositório: github.com/Guilherme-Tyszkouski/login.Cloudflare

- [x] o site é servido pelo endereço pages.dev atribuído à equipe;
- [x] os arquivos estáticos e as Functions compartilham a mesma origem;
- [x] o projeto foi publicado por integração com GitHub;
- [x] a equipe não instalou nem executou Node.js, npm, npx ou Wrangler;
- [x] cada provedor usa uma URL de retorno própria e exata;
- [x] os pedidos de autorização usam código e PKCE S256;
- [x] a Function apresenta o Client Secret correto somente na troca de tokens;
- [x] o retorno recusa uma transação ausente, expirada, alterada ou reutilizada;
- [x] o id_token do Google só produz uma sessão depois da validação criptográfica e semântica;
- [x] o access_token do GitHub é usado somente para consultar /user e a autorização é revogada antes da criação da sessão;
- [x] o cookie de sessão é opaco, Secure, HttpOnly, SameSite=Strict e não possui Domain;
- [x] o D1 guarda o resumo do cookie, não seu valor bruto;
- [x] /api/me devolve somente o perfil necessário;
- [x] o logout confere Origin, remove a sessão e expira o cookie;
- [x] um cookie revogado não restaura a sessão;
- [x] tokens e segredos não aparecem no HTML, nas URLs salvas, no armazenamento Web ou nos registros;
- [x] a dupla consegue explicar por que os arquivos estáticos permanecem públicos;
- [x] as sessões administrativas foram encerradas (computador pessoal, não compartilhado).

## Onde cada critério foi verificado

| Critério | Evidência |
| --- | --- |
| endereço pages.dev, mesma origem, integração com GitHub | 01 |
| sem Node.js, npm, npx ou Wrangler | 01 (Build command vazio, Framework preset None) |
| URLs de retorno próprias e exatas | 02 e 03 |
| PKCE S256 nos dois provedores | 05 e 06 (`code_challenge_method=S256`) |
| escopos mínimos | 05 (`openid email profile`) e 06 (`scope` ausente) |
| D1 guarda resumos, não valores | 04 (esquema) e 06 (cookie revogado não restaura) |
| recusa de transação ausente, alterada e reutilizada | 07, casos 1, 2 e 3 |
| expiração da sessão conferida a cada consulta | 07, caso 4 |
| conferência de Origin na saída | 07, caso 5 |
| cookie revogado não restaura sessão | 07, caso 6 |
| cookie opaco, Secure, HttpOnly, SameSite=Strict, sem Domain | painel Application > Cookies, confirmado durante o caso 6 |
| sem tokens no armazenamento Web | console: `{local: 0, session: 0}` |
| /api/me devolve apenas o perfil mínimo | emissor, identificador, nome e e-mail; nenhum token ou resumo |

## Por que os arquivos estáticos permanecem públicos

Tudo que está em `public/` é servido pelo Cloudflare Pages como conteúdo
estático, antes de qualquer código do laboratório ser executado. A sessão
protege apenas as rotas dinâmicas `/api/*` e `/oauth/*`, que consultam o cookie
e o banco. Por isso `dashboard.html` abre por URL direta mesmo sem login — o
que não aparece é o conteúdo, porque `/api/me` responde 401 e a página não tem
o que exibir. Esconder um link não torna o arquivo privado.

## Assinaturas

- Guilherme Tyszkouski — data: ____/____/______
- (dupla) ______________________ — data: ____/____/______

## Rotação dos Client Secrets

Responsável: Guilherme Tyszkouski
