// Gera perfil-escuro.svg e perfil-claro.svg: arte ASCII à esquerda, painel estilo neofetch à direita.
// As estatísticas vêm da API do GitHub com o token em GITHUB_TOKEN (na Action, o token padrão).
// Uso: GITHUB_TOKEN=... node gerar.mjs        (sem dependências; Node 18+)
import { readFileSync, writeFileSync } from 'node:fs';

const perfil = JSON.parse(readFileSync(new URL('./perfil.json', import.meta.url), 'utf8'));
const arte = JSON.parse(readFileSync(new URL('./arte/arte.json', import.meta.url), 'utf8'));
const token = process.env.GITHUB_TOKEN;
if (!token) { console.error('Falta GITHUB_TOKEN'); process.exit(1); }

const API = 'https://api.github.com';
const cabecalho = { Authorization: `Bearer ${token}`, 'User-Agent': 'perfil-neofetch', Accept: 'application/vnd.github+json' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function graphql(query, variables) {
  const res = await fetch(`${API}/graphql`, { method: 'POST', headers: cabecalho, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
  return json.data;
}

async function repositorios(login) {
  const lista = [];
  let after = null;
  const privacidade = perfil.incluirPrivados ? '' : ', privacy: PUBLIC';
  do {
    const d = await graphql(`query($login: String!, $after: String) {
      user(login: $login) { repositories(ownerAffiliations: OWNER, first: 100, after: $after${privacidade}) {
        pageInfo { hasNextPage endCursor }
        nodes { name isFork stargazerCount owner { login } } } } }`, { login, after });
    const r = d.user.repositories;
    lista.push(...r.nodes);
    after = r.pageInfo.hasNextPage ? r.pageInfo.endCursor : null;
  } while (after);
  return lista;
}

async function commits(login, criadoEm) {
  let total = 0;
  const agora = new Date();
  for (let ano = new Date(criadoEm).getUTCFullYear(); ano <= agora.getUTCFullYear(); ano++) {
    const from = new Date(Date.UTC(ano, 0, 1)).toISOString();
    const to = ano === agora.getUTCFullYear() ? agora.toISOString() : new Date(Date.UTC(ano, 11, 31, 23, 59, 59)).toISOString();
    const d = await graphql(`query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) { contributionsCollection(from: $from, to: $to) {
        totalCommitContributions restrictedContributionsCount } } }`, { login, from, to });
    const c = d.user.contributionsCollection;
    total += c.totalCommitContributions + c.restrictedContributionsCount;
  }
  return total;
}

// Linhas adicionadas e removidas pelo usuário em cada repositório (estatística de contribuidores do GitHub).
async function linhas(login, repos) {
  let mais = 0, menos = 0;
  for (const repo of repos) {
    if (repo.isFork) continue;
    const url = `${API}/repos/${repo.owner.login}/${repo.name}/stats/contributors`;
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      const res = await fetch(url, { headers: cabecalho });
      if (res.status === 202) { await espera(3000); continue; } // o GitHub ainda está calculando
      if (res.status === 204 || !res.ok) break;                 // repositório vazio ou sem acesso
      const autores = await res.json();
      const meu = Array.isArray(autores) && autores.find((a) => a.author?.login?.toLowerCase() === login.toLowerCase());
      if (meu) for (const s of meu.weeks) { mais += s.a; menos += s.d; }
      break;
    }
  }
  return { mais, menos };
}

async function estatisticas() {
  const login = perfil.usuario;
  const d = await graphql(`query($login: String!) { user(login: $login) {
    createdAt followers { totalCount }} }`, { login });
  const repos = await repositorios(login);
  return {
    repos: repos.length,
    estrelas: repos.reduce((s, r) => s + r.stargazerCount, 0),
    seguidores: d.user.followers.totalCount,
    commits: await commits(login, d.user.createdAt),
    ...(await linhas(login, repos)),
  };
}

// ---------- desenho ----------
const TEMAS = {
  escuro: { fundo: '#161b22', borda: '#30363d', arte: '#c9d1d9', chave: '#ffa657', valor: '#a5d6ff', pontos: '#616e7f', texto: '#c9d1d9', mais: '#3fb950', menos: '#f85149' },
  claro:  { fundo: '#f6f8fa', borda: '#d0d7de', arte: '#24292f', chave: '#953800', valor: '#0a3069', pontos: '#8c959f', texto: '#24292f', mais: '#1a7f37', menos: '#cf222e' },
};
const RAMPA = ' .:-=+*#%@';
const LARGURA = 62; // colunas do painel
const METADE1 = Math.ceil((LARGURA - 3) / 2), METADE2 = LARGURA - 3 - METADE1; // larguras das duas metades
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => n.toLocaleString('pt-BR');

function linhasArte(tema) {
  // fundo escuro: claro vira denso; fundo claro: escuro vira denso. Dentro do contorno nunca fica vazio.
  return arte.grade.map((l) => [...l].map((ch) => {
    if (ch === ' ') return ' ';
    const v = Number(ch) / 9;
    const t = tema === 'escuro' ? v : 1 - v;
    return RAMPA[1 + Math.round(t * (RAMPA.length - 2))];
  }).join(''));
}

// Uma linha do painel é uma lista de pedaços [texto, cor].
function chaveValor(chave, valor, largura = LARGURA) {
  const pontos = Math.max(1, largura - chave.length - valor.length - 4);
  return [['. ', 'pontos'], [chave, 'chave'], [':', 'texto'], [` ${'.'.repeat(pontos)} `, 'pontos'], [valor, 'valor']];
}
function secao(nome) {
  return [['- ', 'texto'], [nome, 'texto'], [' ' + '—'.repeat(Math.max(1, LARGURA - nome.length - 3)), 'texto']];
}
function painel(e) {
  const out = [[[perfil.titulo, 'chave'], [' ' + '—'.repeat(LARGURA - perfil.titulo.length - 1), 'texto']]];
  for (const bloco of perfil.blocos) {
    if (!Array.isArray(bloco)) { out.push([]); out.push(secao(bloco.secao)); continue; }
    if (out.length > 1) out.push([]);
    for (const [k, v] of bloco) out.push(chaveValor(k, v));
  }
  // duas estatísticas por linha: metade esquerda com o ". " inicial, metade direita depois de " | "
  const par = (k1, v1, k2, v2) => chaveValor(k1, v1, METADE1).concat([[' | ', 'texto']], chaveValor(k2, v2, METADE2 + 1).slice(1));
  out.push(par('Repos', num(e.repos), 'Estrelas', num(e.estrelas)));
  out.push(par('Commits', num(e.commits), 'Seguidores', num(e.seguidores)));
  const detalhe = ` ( ${num(e.mais)}++, ${num(e.menos)}-- )`;
  out.push([...chaveValor('Linhas de código', num(e.mais - e.menos), LARGURA - detalhe.length), [' ( ', 'texto'], [`${num(e.mais)}++`, 'mais'], [', ', 'texto'], [`${num(e.menos)}--`, 'menos'], [' )', 'texto']]);
  return out;
}

function svg(tema, e) {
  const cor = TEMAS[tema];
  const arteL = linhasArte(tema);
  const fA = 10.5, lhA = 12;          // arte
  const fP = 15, lhP = 24;             // painel
  const xP = 415;
  const painelL = painel(e);
  const altura = Math.max(arteL.length * lhA, painelL.length * lhP) + 40;
  const largura = 985;
  const yP0 = 20 + (altura - 40 - painelL.length * lhP) / 2 + fP;
  const partes = [];
  partes.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" font-family="ConsolasFallback,Consolas,'Courier New',monospace">`);
  partes.push(`<rect x="0.5" y="0.5" width="${largura - 1}" height="${altura - 1}" rx="12" fill="${cor.fundo}" stroke="${cor.borda}"/>`);
  partes.push(`<text x="20" y="${20 + fA}" font-size="${fA}px" fill="${cor.arte}" xml:space="preserve">`);
  arteL.forEach((l, i) => partes.push(`<tspan x="20" y="${(20 + fA + i * lhA).toFixed(1)}">${esc(l)}</tspan>`));
  partes.push('</text>');
  partes.push(`<text x="${xP}" y="${yP0}" font-size="${fP}px" fill="${cor.texto}" xml:space="preserve">`);
  painelL.forEach((l, i) => {
    const y = (yP0 + i * lhP).toFixed(1);
    const conteudo = l.map(([t, c]) => `<tspan fill="${cor[c]}">${esc(t)}</tspan>`).join('');
    partes.push(`<tspan x="${xP}" y="${y}">${conteudo}</tspan>`);
  });
  partes.push('</text></svg>');
  return partes.join('\n') + '\n';
}

const e = await estatisticas();
console.log('Estatísticas:', e);
for (const tema of Object.keys(TEMAS)) writeFileSync(new URL(`./perfil-${tema}.svg`, import.meta.url), svg(tema, e));
console.log('SVGs gerados.');
