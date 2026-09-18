# Roteiro de configuração — login no Cloudflare Pages

O código deste repositório já está pronto. O que falta é configuração nos
painéis. Faça na ordem abaixo: cada etapa depende da anterior.

Sempre que aparecer `URL_BASE`, troque pela URL do seu projeto, sem barra no
final. Exemplo: `https://login-cloudflare-guilherme.pages.dev`.

---

## 0. Repositório

Estrutura esperada na raiz:

```
public/
  index.html
  app.js
  styles.css
  entrega1/
functions/
  _shared/
  api/
  oauth/
esquema-d1.sql
CONFIGURACAO.md
```

`public` e `functions` são pastas irmãs. `functions` **não** pode ficar dentro
de `public`.

Apague da raiz os três arquivos antigos, se ainda existirem: `index.html`,
`index.js` e `estilo.css`. Eles foram substituídos pelos arquivos dentro de
`public/`. Pelo GitHub: abra o arquivo, botão `...` > *Delete file* > *Commit*.

Não pode existir `package.json`, `package-lock.json`, `node_modules` nem
`wrangler.jsonc`.

---

## 1. Cloudflare Pages

1. Painel da Cloudflare > **Workers & Pages**.
2. **Create application > Pages > Connect to Git**.
3. Autorize o acesso somente ao repositório `login.Cloudflare`.
4. Ramificação de produção: `main`.
5. Configuração de build:

   | Campo | Valor |
   | --- | --- |
   | Framework preset | None |
   | Build command | *(vazio)* |
   | Build output directory | `public` |
   | Root directory | *(vazio)* |

6. **Save and Deploy**.
7. Anote a URL `https://algo.pages.dev`. Essa é a `URL_BASE`.
8. Teste `URL_BASE/api/health` — deve responder `{"status":"ok"}` com 200.
   Um 404 aqui significa que a pasta `functions` está no lugar errado.

Evidência: `public/entrega1/01-pages-configuracao.pdf` (nome do projeto,
ramificação de produção e opções de build — sem identificadores privados da
conta).

---

## 2. Banco D1

1. **Storage & Databases > D1 SQL Database > Create database**.
2. Nome: `oauth-sessions-EQUIPE` (pode trocar `EQUIPE` pelo seu identificador).
3. Abra o banco > **Console** e cole o conteúdo de `esquema-d1.sql`.
4. Rode a consulta de conferência que está comentada no fim do arquivo e copie
   o resultado para `public/entrega1/04-d1-esquema.txt`.
5. Volte ao projeto do Pages: **Settings > Bindings > Add > D1 database**.

   | Campo | Valor |
   | --- | --- |
   | Variable name | `DB` |
   | D1 database | `oauth-sessions-EQUIPE` |

   O nome da variável precisa ser exatamente `DB` — é o que o código lê em
   `context.env.DB`.
6. Peça um novo deploy (**Deployments > ... > Retry deployment**). Bindings só
   valem para implantações feitas depois deles.

---

## 3. Google — cliente Web

Use uma janela privativa.

1. <https://console.cloud.google.com> > aceite os termos. **Não** clique em
   "Ativar avaliação gratuita" nem em faturamento.
2. Crie um projeto novo.
3. **APIs e Serviços > Tela de consentimento OAuth**: tipo **Externo**,
   preencha nome do app, e-mail de suporte e e-mail do desenvolvedor.
4. Mantenha o app em **Teste** e adicione sua conta Google em *Usuários de
   teste*.
5. Escopos: apenas `openid`, `email` e `profile`.
6. **Credenciais > Criar credenciais > ID do cliente OAuth**:

   | Campo | Valor |
   | --- | --- |
   | Tipo | Web application |
   | Authorized redirect URI | `URL_BASE/oauth/callback/google` |

   Uma única URL, sem barra final, sem curinga, sem `localhost`.
7. Guarde o **Client ID** e o **Client Secret** para a etapa 5. Não baixe o
   arquivo JSON de credenciais.

Evidência: `public/entrega1/02-google-retorno.txt` — só a URL de retorno.

---

## 4. GitHub — OAuth App

1. GitHub > **Settings > Developer settings > OAuth Apps > New OAuth App**.
2. Preencha:

   | Campo | Valor |
   | --- | --- |
   | Application name | nome que identifique a equipe |
   | Homepage URL | `URL_BASE` |
   | Authorization callback URL | `URL_BASE/oauth/callback/github` |
   | Enable Device Flow | desmarcado |

3. Registre a aplicação e gere um **Client Secret**.
4. Não peça os escopos `repo`, `user:email` nem `offline_access` — o código já
   omite `scope` no pedido de autorização.

Evidência: `public/entrega1/03-github-retorno.txt` — homepage e URL de retorno.

---

## 5. Variáveis e segredos no Pages

Projeto do Pages > **Settings > Variables and Secrets > Add**, ambiente
**Production**.

Texto simples:

| Nome | Valor |
| --- | --- |
| `PUBLIC_BASE_URL` | `URL_BASE` (sem barra final) |
| `GOOGLE_CLIENT_ID` | Client ID do Google |
| `GITHUB_CLIENT_ID` | Client ID do GitHub |

Criptografados (marque **Encrypt** antes de salvar):

| Nome | Valor |
| --- | --- |
| `GOOGLE_CLIENT_SECRET` | Client Secret do Google |
| `GITHUB_CLIENT_SECRET` | Client Secret do GitHub |

Peça um novo deploy depois de salvar. Nenhum desses valores pode aparecer no
repositório, no HTML ou em capturas de tela.

---

## 6. Caminho feliz

1. Abra `URL_BASE`. A página deve mostrar "Nenhuma sessão neste navegador."
2. **Entrar com Google** > conclua o login > você volta para `URL_BASE` e a
   página mostra o perfil.
3. Confira em DevTools > Application > Local Storage e Session Storage: devem
   estar vazios. O único rastro é o cookie `__Host-session`.
4. **Sair** > a página volta a "Nenhuma sessão neste navegador." e `/api/me`
   passa a responder 401.
5. Repita com **Entrar com GitHub**. O e-mail pode vir nulo — é esperado,
   porque o laboratório não pede `user:email`.

---

## 7. Evidências que faltam gerar

| Arquivo | Como obter |
| --- | --- |
| `01-pages-configuracao.pdf` | Captura da tela de build settings do Pages, exportada em PDF |
| `05-inicio-login-google.pdf` | DevTools > Network > *Preserve log*, visite `/oauth/login/google`, abra a resposta 302 e capture os cabeçalhos com `Set-Cookie`, `Location`, `state` e `code_challenge` ocultos |
| `06-inicio-login-github.pdf` | Mesmo procedimento em `/oauth/login/github` |

No 05 e no 06, confirme na URL de `Location`: `response_type=code`,
`code_challenge_method=S256`, a `redirect_uri` exata, e a ausência de
Client Secret e `code_verifier`. No 06, confirme também que não há `nonce`
nem os escopos `repo`, `user:email` e `offline_access`.

Troque qualquer valor sensível por `[REMOVIDO]` antes de salvar.

---

## Diagnóstico rápido

| Sintoma | Primeira conferência |
| --- | --- |
| `/api/health` responde 404 | pasta `functions` na raiz e deploy mais recente |
| `DB is undefined` | binding com o nome exato `DB` e novo deploy depois dele |
| `redirect_uri_mismatch` | URL de retorno exata no provedor, sem barra final |
| `invalid_client` | Client ID e Client Secret no ambiente de produção |
| `transacao_invalida` no retorno | cookie `__Host-oauth-tx` presente e transação ainda válida (10 min) |
| `/api/me` responde 401 logo após o login | `PUBLIC_BASE_URL` diferente do host que você abriu |
