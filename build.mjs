// Bygger public/index.html fra src/template.html + program/*.md + oppdateringer.md
// Kjør: node build.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const WEEKDAYS = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Hjelpelenker som vises dempet, f.eks. "(reiserute, wikipedia)"
const AUX = new Set(['wikipedia', 'reiserute']);

// Inline: [tekst](url), **fet** og [Betal selv]-merkelapper. Alle lenker åpnes i nytt vindu.
const inline = (s) =>
  esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) =>
      `<a href="${url}" target="_blank" rel="noopener"${AUX.has(text) ? ' class="aux"' : ''}>${text}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]/g, '<span class="pay">$1</span>');

const EMOJI = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s+/u;

function parse(file) {
  const src = readFileSync(`program/${file}`, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: mangler frontmatter (---)`);
  const meta = Object.fromEntries(
    m[1].split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf(':');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
  );
  for (const k of ['dato', 'dag', 'tittel']) if (!meta[k]) throw new Error(`${file}: mangler "${k}"`);

  const items = [];
  const notes = [];
  for (const line of m[2].split('\n')) {
    if (/^- /.test(line)) {
      const text = line.slice(2).trim();
      const em = text.match(EMOJI);
      items.push({ icon: em ? em[1] : '•', text: em ? text.slice(em[0].length) : text, sub: [] });
    } else if (/^\s+- /.test(line)) {
      if (!items.length) throw new Error(`${file}: underpunkt uten hovedpunkt`);
      items.at(-1).sub.push(line.replace(/^\s+- /, '').trim());
    } else if (/^> ?/.test(line)) {
      notes.push(line.replace(/^> ?/, ''));
    }
  }
  return { meta, items, note: notes.join(' ').trim() };
}

function renderDay({ meta, items, note }) {
  const li = items
    .map((it) => {
      const sub = it.sub.length ? `\n          <ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join('')}</ul>` : '';
      return `        <li><span class="ic">${it.icon}</span><span>${inline(it.text)}${sub}</span></li>`;
    })
    .join('\n');
  return `  <section class="day" id="d-${meta.dato}" data-date="${meta.dato}">
    <div class="card">
      <div class="day-head"><span class="day-num">Dag ${esc(meta.dag)}</span><span class="badge-today">I dag</span></div>
      <h2>${esc(meta.tittel)}</h2>
${meta.undertittel ? `      <p class="title">${esc(meta.undertittel)}</p>\n` : ''}${meta.rute ? `      <p class="legs">${inline(meta.rute)}</p>\n` : ''}      <ul class="plan">
${li}
      </ul>
${note ? `      <div class="note"><strong>Viktig å vite</strong>${inline(note)}</div>\n` : ''}    </div>
  </section>
`;
}

function renderNav({ meta }) {
  const d = new Date(meta.dato + 'T12:00:00Z');
  const wd = WEEKDAYS[d.getUTCDay()];
  return `    <a href="#d-${meta.dato}" data-date="${meta.dato}"><span>${wd}</span><b>${d.getUTCDate()}.${d.getUTCMonth() + 1}</b></a>\n`;
}

const days = readdirSync('program')
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map(parse);

// Oppdateringer: "- DD.MM: tekst", nyeste først. Linjer som starter med # ignoreres.
const updates = readFileSync('oppdateringer.md', 'utf8')
  .split('\n')
  .filter((l) => /^- /.test(l))
  .map((l) => l.slice(2).trim());

function renderUpdates() {
  if (!updates.length) return '';
  // Signatur av innholdet: knappen gløder igjen når listen endres
  const sig = createHash('sha1').update(updates.join('\n')).digest('hex').slice(0, 10);
  return `    <button type="button" class="updates-btn" aria-expanded="false" aria-controls="updates-panel" data-sig="${sig}">Endringer</button>
    <div class="updates-panel" id="updates-panel" hidden>
      <h3>Endringer</h3>
      <ul>${updates.map((u) => `<li>${inline(u)}</li>`).join('')}</ul>
    </div>
`;
}

const html = readFileSync('src/template.html', 'utf8')
  .replace('<!-- UPDATES -->\n', renderUpdates())
  .replace('    <!-- DAYNAV -->\n', days.map(renderNav).join(''))
  .replace('  <!-- PROGRAM -->\n', days.map(renderDay).join('\n'));

mkdirSync('public', { recursive: true });
writeFileSync('public/index.html', html);
console.log(`Bygget public/index.html med ${days.length} dager.`);
