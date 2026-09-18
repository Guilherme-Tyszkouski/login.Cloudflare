// Painel. Consulta /api/me e mostra o perfil mínimo da sessão.
//
// Este arquivo é estático e continua acessível por URL mesmo sem sessão.
// O que a sessão protege é o dado: sem cookie válido, /api/me responde 401
// e não há nada para exibir aqui.

const saudacao = document.getElementById("saudacao");
const status = document.getElementById("status");
const telaSessao = document.getElementById("tela-sessao");
const telaSemSessao = document.getElementById("tela-sem-sessao");

function preencher(id, valor) {
  document.getElementById(id).textContent = valor ?? "não informado";
}

function mostrar(secao, titulo, mensagem) {
  telaSessao.hidden = secao !== "sessao";
  telaSemSessao.hidden = secao !== "sem-sessao";
  saudacao.textContent = titulo;
  status.textContent = mensagem;
}

fetch("/api/me", { credentials: "same-origin" })
  .then((response) => (response.ok ? response.json() : null))
  .then((user) => {
    if (!user) {
      mostrar("sem-sessao", "Nenhuma sessão ativa neste navegador.", "");
      return;
    }

    preencher("perfil-issuer", user.issuer);
    preencher("perfil-subject", user.subject);
    preencher("perfil-nome", user.displayName);
    preencher("perfil-email", user.email);

    mostrar(
      "sessao",
      `Você entrou como ${user.displayName ?? user.email ?? user.subject}.`,
      "Sessão local válida, confirmada por /api/me.",
    );
  })
  .catch(() => {
    mostrar("sem-sessao", "Não foi possível consultar a sessão.", "");
  });
