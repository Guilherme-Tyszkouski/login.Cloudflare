// Tela de login. Consulta a sessão na mesma origem: o navegador envia
// apenas o cookie opaco, e nenhum token é guardado em localStorage ou
// sessionStorage.
//
// Com sessão válida, a tela troca os botões de login pelo acesso ao painel.

const status = document.getElementById("status");
const subtitulo = document.getElementById("subtitulo");
const telaEntrada = document.getElementById("tela-entrada");
const telaSessao = document.getElementById("tela-sessao");

// Enquanto os SVGs oficiais não estiverem em public/icons/, o navegador
// mostraria um ícone quebrado. Some com a imagem e deixa só o texto.
for (const icone of document.querySelectorAll(".opcao__icone")) {
  // complete + naturalWidth zero significa que a carga já falhou antes
  // deste script rodar; o listener cobre as falhas que vierem depois.
  if (icone.complete && icone.naturalWidth === 0) icone.remove();
  else icone.addEventListener("error", () => icone.remove());
}

function mostrar(secao, mensagem) {
  telaEntrada.hidden = secao !== "entrada";
  telaSessao.hidden = secao !== "sessao";
  // Com a sessão aberta, quem ocupa o lugar do subtítulo é a saudação.
  subtitulo.hidden = secao === "sessao";
  status.textContent = mensagem;
}

fetch("/api/me", { credentials: "same-origin" })
  .then((response) => (response.ok ? response.json() : null))
  .then((user) => {
    if (!user) {
      mostrar("entrada", "Nenhuma sessão neste navegador.");
      return;
    }

    document.getElementById("saudacao").textContent =
      `Você entrou como ${user.displayName ?? user.email ?? user.subject}.`;

    mostrar("sessao", "Sessão local válida, confirmada por /api/me.");
  })
  .catch(() => {
    // Acontece quando /api/me não existe — por exemplo ao abrir a página
    // por um servidor local, que não executa as Pages Functions.
    mostrar("entrada", "Não foi possível consultar a sessão.");
  });
