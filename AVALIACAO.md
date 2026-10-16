# Avaliação: GitHub Actions com IA

Aluno: Guilherme Tyszkouski — RA 2025207312
Repositório: https://github.com/Guilherme-Tyszkouski/login.Cloudflare
Site: https://login-cloudflare-7ni.pages.dev
Banco D1: `oauth-sessions-guilherme` (binding `DB`)

---

## Preparação

O repositório não tinha `migrations/` nem `wrangler.toml` — o esquema do D1 havia sido
criado à mão no console, e a avaliação anterior proibia o uso do Wrangler.

A migração inicial foi escrita com `CREATE TABLE IF NOT EXISTS` e
`CREATE INDEX IF NOT EXISTS`, porque as tabelas já existiam no banco remoto e o
Wrangler não tinha registro de nenhuma migração aplicada. Sem isso, a primeira
aplicação remota falharia com *table already exists*.

O `wrangler.toml` foi gerado com `npx wrangler pages download config login-cloudflare`
em vez de escrito à mão. Motivo: ao adotar um `wrangler.toml` com
`pages_build_output_dir`, o arquivo passa a ser a fonte da verdade do projeto Pages, e
as variáveis configuradas no painel deixam de valer. Baixar a configuração existente
preservou `PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID` e `GITHUB_CLIENT_ID`, evitando quebrar
o login em produção. O login com Google e com GitHub foi testado depois do deploy e
continuou funcionando.

Duas correções foram necessárias no arquivo baixado: o `GOOGLE_CLIENT_ID` vinha com um
`\n` no final (resíduo de um valor colado no painel, que já havia causado
`invalid_client` no bimestre anterior) e o `database_name` vinha como `DB`, que é o
nome do binding e não do banco.

---

## Tarefa 1 — CI a cada commit

**Execução verde:** https://github.com/Guilherme-Tyszkouski/login.Cloudflare/actions/runs/38845638382

**Execução vermelha:** https://github.com/Guilherme-Tyszkouski/login.Cloudflare/actions/runs/38846873827

**Linha do log que mostra o erro**, no step *Aplica as migrações*:

```
Aplicando migrations/0001_esquema_inicial.sql
Aplicando migrations/0099_erro.sql
Parse error near line 3: near ";": syntax error
  CREATE TABLE x (;
            ^--- error here
Error: Process completed with exit code 1.
```

A falha foi provocada por um arquivo `migrations/0099_erro.sql` descartável, com
`CREATE TABLE x (;`. Depois de colhida a evidência o arquivo foi apagado, não
corrigido: um `.sql` quebrado sobrevivendo em `migrations/` faria o
`wrangler d1 migrations apply --remote` da Tarefa 4 tentar aplicá-lo em produção.

### Por que a migração é testada em SQLite antes de chegar ao D1

Porque o D1 é SQLite e aplicar a migração num banco local descartável reproduz o mesmo
parser sem tocar em dado real. O erro de sintaxe aparece no CI, antes do merge, em vez
de aparecer no banco de produção depois dele — e uma migração que falha pela metade no
D1 deixa o esquema num estado intermediário, difícil de reverter.

### Ajuste necessário no esqueleto do enunciado

O comando de varredura de segredos do enunciado **detectava a si mesmo**. A expressão
regular contém o texto `GOCSPX-`, e o `git grep` encontrava essa string dentro do
próprio `ci.yml`, deixando toda execução vermelha.

A correção óbvia seria excluir o arquivo da varredura, mas isso criaria um ponto cego:
um segredo real colado dentro do `ci.yml` deixaria de ser detectado, justamente no
arquivo que existe para detectar segredos. Em vez disso, o padrão foi tornado
auto-evitante com classes de caractere:

```
GOCSPX[-]|client[_]secret *= *['\"][^'\"]+
```

`GOCSPX[-]` continua casando com o texto `GOCSPX-` em qualquer arquivo, mas o texto
literal `GOCSPX[-]` escrito no workflow não casa com o padrão. Testado com dois
vazamentos falsos (`GOCSPX-abc123` num `.js` e `client_secret = 'xyz789'` num `.txt`,
mais um terceiro dentro de `.github/workflows/`): os três foram detectados, nenhum
arquivo ficou de fora, e `client_secret:` com dois-pontos — sintaxe de objeto usada em
`functions/oauth/callback/[provider].js` — continuou não casando.

O `-bail` do `sqlite3` foi considerado e **não foi necessário**: a execução vermelha
mostrou que o `sqlite3` já sai com código diferente de zero diante do erro de sintaxe.

---

## Tarefa 2 — proteger a main com o CI

**PR bloqueado e depois liberado:** https://github.com/Guilherme-Tyszkouski/login.Cloudflare/pull/1

O ruleset `protege-main` exige pull request e o status check `verificar`, com
*Enforcement status* ativo e lista de bypass vazia — isto é, a regra vale inclusive
para o dono do repositório.

**Saída do `git push` direto recusado:**

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote:
remote: - Changes must be made through a pull request.
remote:
remote: - Required status check "verificar" is expected.
remote:
 ! [remote rejected] main -> main (push declined due to repository rule violations)
error: failed to push some refs to 'https://github.com/Guilherme-Tyszkouski/login.Cloudflare.git'
```

A recusa nomeia as duas regras separadamente, o que confirma que ambas estão ativas.

---

## Tarefa 3 — revisão de PR por IA

**PR usado:** https://github.com/Guilherme-Tyszkouski/login.Cloudflare/pull/2

O workflow `.github/workflows/revisao-ia.yml` foi escrito conforme o enunciado e é
disparado em `opened` e `synchronize`. **Ele não chegou a publicar comentário.** A causa
foi isolada e está fora do código deste repositório. Esta seção documenta a
investigação, porque é o que sobrou de aproveitável.

### Causa raiz

O `actions/ai-inference` executa o **Copilot CLI** (`@github/copilot`) e tenta
interpretar a saída dele como um objeto JSON de *chat completion*, procurando a chave
`choices`. Mas o CLI, na versão instalada pelo `npm install -g @github/copilot`,
devolve **texto puro**.

Log do job, com `@v2`:

```
Using legacy prompt format
Running simple inference without tools
Error: simpleInference: chatCompletion failed: Error: simpleInference: Chat completion
response was a string and not valid JSON (Unexpected token 'O', "OK
" is not valid JSON)
```

A string recebida é `OK\n` — texto, não JSON. É incompatibilidade entre a versão atual
do CLI e o que a ação espera.

### Hipóteses testadas

| # | Hipótese | Teste | Resultado |
| --- | --- | --- | --- |
| 1 | Faltava `models: read` nas permissões | Acrescentado ao bloco `permissions` | Mesmo erro. Descartada. |
| 2 | O `COPILOT_PAT` não tinha acesso | Trocado por `github.token` | Mesmo erro. Inconclusivo: o `github.token` pertence ao app do Actions e pode não ter acesso ao Copilot, então falhar com os dois não inocenta o PAT. |
| 3 | Bug conhecido da ação (issue #96) | Subida de `@v1` para `@v2` | Não resolveu, mas mudou o erro (ver abaixo). |
| 4 | A conta ou o PAT não têm direito de acesso | Copilot CLI instalado e executado **localmente** | **Descartada.** O CLI respondeu normalmente, tanto autenticado por `copilot login` quanto com um `COPILOT_PAT` novo exportado em `COPILOT_GITHUB_TOKEN`. |

A hipótese 4 é a que fecha o caso: a conta (plano Copilot Free), o PAT e a permissão
*Copilot Requests* funcionam. O que não funciona é a ponte entre o CLI e a ação.

### O que a troca de versão revelou

Na `@v1` o erro era opaco:

```
Error: API error: TypeError: Cannot use 'in' operator to search for 'choices' in OK
```

A issue [#96](https://github.com/actions/ai-inference/issues/96) do `actions/ai-inference`
descreve esse erro; o mantenedor lançou a **v2.0.1** com parsing defensivo. O esqueleto
do enunciado fixa `@v1`, que não tem essa proteção.

Subir para `@v2` não consertou nada, mas trocou um `TypeError` genérico por uma
mensagem que diz exatamente o que chegou e o que era esperado. Foi o que permitiu
chegar à causa raiz.

A lição prática: fixar uma versão maior (`@v1`) dá falsa sensação de estabilidade — a
ação continuou recebendo correções numa linha que este workflow nunca alcançaria.

### Avaliação crítica de uma resposta da IA

O enunciado pede uma afirmação de IA que esteja errada ou seja irrelevante. Como a
revisão automática não chegou a comentar, a crítica recai sobre a explicação que o
**Copilot** produziu quando solicitado a analisar este mesmo job.

Ele acertou o mecanismo — "the step parsing logic assumes valid JSON and does not guard
against non-JSON responses" — e, significativamente, **todas** as correções que propôs
são na ação, não neste repositório, o que corrobora o diagnóstico.

Mas uma das sugestões está errada. Ele recomendou instruir o modelo a *"Respond with
valid JSON only. Do not add any explanation, text, or code fences."*

Isso não resolveria. A ação não espera um JSON qualquer: ela espera um **objeto de chat
completion contendo a chave `choices`**, que é o envelope montado pelo cliente da API,
não o conteúdo redigido pelo modelo. Ainda que o modelo obedecesse e escrevesse um JSON
impecável, o `simpleInference` continuaria quebrando ao procurar `choices` dentro dele.

O erro de raciocínio é confundir **o que o modelo escreve** com **o envelope que o
cliente devolve**. É um conselho plausível à leitura rápida, porque a frase "retorne
JSON" soa como a resposta natural para "a resposta não era JSON" — e é exatamente por
soar natural que ele passaria sem revisão. Serve como ilustração do ponto da Pergunta 4:
uma revisão por IA produz texto convincente, e convincente não é o mesmo que correto.

### Permissões

O bloco declarado foi `contents: read`, `pull-requests: write` e `models: read`. Nenhuma
contornou o defeito. O teste de remover `pull-requests: write` para registrar o erro de
permissão **não pôde ser feito**: o job falha no step de inferência, antes de chegar ao
`gh pr comment`, de modo que a falta da permissão nunca chegaria a se manifestar.

---

## Tarefa 4 — migrações D1 depois do merge

**Execução do merge:** https://github.com/Guilherme-Tyszkouski/login.Cloudflare/actions/runs/38975966397

O workflow `migrar.yml` usa `paths: ['migrations/**']` e só dispara em push na `main`.
O merge do PR #2 trouxe `migrar.yml` e `migrations/0002_adiciona_coluna.sql` juntos, e
o próprio push do merge disparou o workflow recém-chegado — o GitHub avalia os
workflows presentes no commit empurrado.

**Confirmação da coluna no banco remoto:**

```
$ npx wrangler d1 execute oauth-sessions-guilherme --remote --env production \
    --command "PRAGMA table_info(sessions)"

Executing on remote database oauth-sessions-guilherme (e121c95c-...):
Executed 1 command in 0.28ms

 cid  name           type     notnull  dflt_value  pk
 0    id_hash        TEXT     0        null        1
 1    issuer         TEXT     1        null        0
 2    subject        TEXT     1        null        0
 3    email          TEXT     0        null        0
 4    display_name   TEXT     0        null        0
 5    expires_at     INTEGER  1        null        0
 6    created_at     INTEGER  1        null        0
 7    last_seen_at   INTEGER  0        null        0
```

**Merge que não toca `migrations/`:** o merge do PR desta própria entrega altera apenas
`AVALIACAO.md`, e o workflow `migrar` não aparece na aba Actions para esse push.

### Adaptações

O enunciado usa uma tabela `notas`, que não existe neste projeto. A migração `0002`
adiciona `last_seen_at` à tabela real `sessions`, e a conferência usa
`PRAGMA table_info(sessions)`.

O comando precisou de `--env production`. O `wrangler.toml` gerado pelo painel coloca o
banco em `[[env.production.d1_databases]]`, e sem a flag o Wrangler não encontra o
banco — as chaves de ambiente não são herdadas.

---

## Perguntas

### 1. O `ci.yml` roda duas vezes quando você faz push numa ramificação com PR aberto. Por quê, e qual das duas execuções o status check da main considera?

Porque o workflow declara dois gatilhos, `push` e `pull_request`. Com um PR aberto, um
commit na ramificação satisfaz os dois ao mesmo tempo: é um push na ramificação e é uma
atualização do PR. São dois eventos distintos, logo duas execuções do mesmo job sobre o
mesmo commit.

Quanto a qual vale: no PR #1 as duas apareceram na caixa de merge marcadas como
*Required*, como `CI / verificar (push)` e `CI / verificar (pull_request)`, e o merge só
liberou quando **as duas** ficaram verdes. A regra exige o check de nome `verificar`, e
o GitHub aplica isso a toda execução com esse nome no commit, independentemente do
evento.

Na prática isso dobra o consumo de minutos sem ganho. A correção usual é restringir o
gatilho de push à `main` e deixar as ramificações cobertas pelo `pull_request`.

### 2. Por que um PR vindo de um fork não consegue usar `secrets.COPILOT_PAT`? Qual ataque essa regra impede?

A própria página de segredos do repositório diz: os segredos "não são passados para
fluxos de trabalho acionados por uma solicitação de pull request de um fork".

O ataque que isso impede é direto: um fork pertence a qualquer pessoa, e o PR dela traz
código que o dono do repositório não escreveu. Se os segredos fossem injetados, bastaria
abrir um PR cujo workflow — ou qualquer script chamado por ele — imprimisse as variáveis
de ambiente, e os tokens sairiam no log de execução, que é público. O atacante não
precisa nem que o PR seja aceito; basta que o workflow rode.

### 3. Por que o workflow da Tarefa 3 declara `permissions` em vez de usar as permissões padrão do `GITHUB_TOKEN`?

Por menor privilégio. O padrão do `GITHUB_TOKEN` é amplo demais para um job que só
precisa ler o código e comentar num PR. Declarando `contents: read` e
`pull-requests: write`, o token do job não consegue, por exemplo, empurrar commits ou
mexer em releases — mesmo que algum passo seja comprometido.

A contrapartida é que declarar o bloco **zera tudo que não for listado**. Foi por isso
que `models: read` precisou ser acrescentado explicitamente quando a ação de IA passou a
ser usada: ele não vem junto.

### 4. A revisão da IA pode substituir o status check da Tarefa 2? Justifique com o que você observou no item 4 da Tarefa 3.

Não.

A observação mais direta é a desta própria avaliação: a revisão por IA **não produziu
saída nenhuma** nas cinco execuções. Um portão de qualidade que pode simplesmente não
responder — por bug de dependência, cota esgotada ou instabilidade do serviço — não
serve como condição de merge.

Mas o argumento não depende da falha. Mesmo funcionando, as duas coisas são de natureza
diferente. O status check é **determinístico e binário**: o `sqlite3` sai com código 1,
ou não sai. A revisão por IA é probabilística e produz texto — pode apontar um problema
real, pode inventar um que não existe, e pode deixar passar o que importa. É boa para
chamar atenção de um humano; é ruim como autoridade final.

O arranjo correto é o que ficou montado aqui: o status check `verificar` bloqueia o
merge, e a revisão da IA comenta sem poder de veto.

---

## Observações finais

Nenhum segredo foi versionado. Os Client IDs do Google e do GitHub estão no
`wrangler.toml`, o que é permitido — são públicos por natureza, e o próprio enunciado da
avaliação anterior desta disciplina afirma que "o Client ID do Google é público e pode
ficar no repositório". Os Client Secrets permanecem apenas como variáveis criptografadas
no painel do Cloudflare Pages, e os três segredos do Actions
(`COPILOT_PAT`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) ficam em
Settings > Secrets and variables.

O `.gitignore` inclui `.wrangler/`, que guarda o Account ID da Cloudflare em cache local.
