// Worker: /api/vaer?steder=Kraków,Praha → værvarsel per sted og dato, fra MET Norway (api.met.no).
// Alt annet serveres som statiske filer fra public/ før Workeren i det hele tatt kjøres.
import STEDER from './steder.json';

const UA = 'polentur-2026 polen@chha.no';
// Ca. kl. 12 norsk tid i oktober (sommertid, UTC+2) – samme tidssone i hele reiseruta
const NOON_UTC = 10;

// Mellomlager per sted, lever så lenge Worker-instansen lever. Respekterer METs Expires.
const cache = new Map();

async function forecast(name) {
  const hit = cache.get(name);
  if (hit && hit.expires > Date.now()) return hit.days;

  const { lat, lon } = STEDER[name];
  const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) {
    if (hit) return hit.days; // gammelt varsel er bedre enn ingenting
    throw new Error(`MET ${res.status}`);
  }
  const days = summarize((await res.json()).properties.timeseries);
  const expires = Date.parse(res.headers.get('expires')) || Date.now() + 30 * 60e3;
  cache.set(name, { days, expires });
  return days;
}

// Én verdi per dato: tidspunktet nærmest kl. 12 som har værsymbol
function summarize(timeseries) {
  const best = {};
  for (const { time, data } of timeseries) {
    const symbol = (data.next_1_hours || data.next_6_hours || data.next_12_hours)?.summary.symbol_code;
    if (!symbol) continue;
    const date = time.slice(0, 10);
    const dist = Math.abs(Number(time.slice(11, 13)) - NOON_UTC);
    if (best[date] && best[date].dist <= dist) continue;
    const d = data.instant.details;
    best[date] = { dist, symbol, temp: Math.round(d.air_temperature), wind: Math.round(d.wind_speed) };
  }
  return Object.fromEntries(Object.entries(best).map(([date, { dist, ...v }]) => [date, v]));
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/vaer') return new Response('Ikke funnet', { status: 404 });

    const names = [...new Set((url.searchParams.get('steder') || '').split(','))].filter((n) => n in STEDER);
    const out = {};
    await Promise.all(
      names.map(async (n) => {
        try { out[n] = await forecast(n); } catch { /* sted uten varsel vises bare ikke */ }
      })
    );
    return Response.json(out, { headers: { 'Cache-Control': 'public, max-age=900' } });
  },
};
