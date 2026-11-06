// Gera arte/avatar.svg: só a arte ASCII, quadrada e em fundo escuro, para usar como foto de perfil.
// Para virar PNG (Windows):
//   msedge --headless=new --disable-lcd-text --screenshot=arte/avatar.png --window-size=800,800 file:///<caminho>/arte/avatar.svg
import { readFileSync, writeFileSync } from 'node:fs';

const arte = JSON.parse(readFileSync(new URL('../arte/arte.json', import.meta.url), 'utf8'));
const RAMPA = ' .:-=+*#%@';
const linhas = arte.grade.map((l) => [...l].map((ch) => (ch === ' ' ? ' ' : RAMPA[1 + Math.round((Number(ch) / 9) * (RAMPA.length - 2))])).join(''));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const lado = 800, fonte = 11, entre = 11.4; // cabe dentro do circulo do avatar do GitHub
const largura = arte.colunas * fonte * 0.55;          // largura aproximada de um caractere monoespaçado
const x = (lado - largura) / 2, y0 = (lado - arte.linhas * entre) / 2 + fonte;
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">`,
  `<rect width="${lado}" height="${lado}" fill="#0d1117"/>`,
  `<text font-family="Consolas,'Courier New',monospace" font-size="${fonte}px" fill="#c9d1d9" xml:space="preserve">`,
  ...linhas.map((l, i) => `<tspan x="${x.toFixed(1)}" y="${(y0 + i * entre).toFixed(1)}">${esc(l)}</tspan>`),
  '</text></svg>',
].join('\n');
writeFileSync(new URL('../arte/avatar.svg', import.meta.url), svg + '\n');
console.log('arte/avatar.svg gerado');
