/* Gym App — rutinas, pesos por sesión, progreso semanal, técnica 3D, notas y calorías.
   Todo se guarda en el navegador (localStorage). */
const { useState, useEffect, useRef } = React;
const html = htm.bind(React.createElement);

// Convierte "a:b;c:d" en un objeto de estilo de React (permite copiar los estilos del diseño tal cual)
const _sx = new Map();
const sx = s => {
  let o = _sx.get(s); if (o) return o; o = {};
  s.split(';').forEach(p => { const i = p.indexOf(':'); if (i < 0) return; const k = p.slice(0, i).trim(); if (!k) return; o[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = p.slice(i + 1).trim(); });
  if (_sx.size > 4000) _sx.clear();
  _sx.set(s, o); return o;
};

const LB = 2.20462;
const DAYS = ['L','M','X','J','V','S','D'];
const EX = {
  sentadilla: { name:'Sentadilla con barra', short:'Sentadilla', anim:'squat', group:'Piernas', level:'Intermedio', muscles:['Cuádriceps','Glúteos','Core'], equip:'Barra · Rack', met:6, tempo:'3 s bajada · 1 s subida',
    cues:[['Pies al ancho de hombros','Puntas abiertas 15–30°. Aprieta la barra contra la espalda alta antes de sacarla del rack.'],['Cadera y rodilla a la vez','Las rodillas siguen la dirección de los pies; no dejes que caigan hacia adentro.'],['Baja a paralelo o más','La cadera llega a la altura de la rodilla con el pecho arriba y la espalda neutra.'],['Empuja el suelo','Peso en todo el pie; cadera y pecho suben al mismo ritmo.']],
    errors:[['Rodillas hacia adentro','Piensa en «abrir el suelo» con los pies durante la subida.'],['Talones despegados','Trabaja movilidad de tobillo o usa calzado con tacón.'],['Espalda baja que se redondea','Baja solo hasta donde mantienes la columna neutra.']],
    breath:['Inhala profundo arriba y bloquea el abdomen','Mantén el aire durante la bajada','Exhala al superar el punto más difícil de la subida'] },
  peso_muerto: { name:'Peso muerto', short:'Peso muerto', anim:'deadlift', group:'Espalda', level:'Intermedio', muscles:['Isquiotibiales','Glúteos','Espalda baja'], equip:'Barra · Discos', met:6, tempo:'1 s subida · 2 s bajada',
    cues:[['Barra sobre el medio del pie','Espinillas a 2–3 cm de la barra antes de agacharte.'],['Bisagra de cadera','Lleva la cadera atrás hasta agarrar la barra con los brazos rectos.'],['Saca la holgura','Tensa los dorsales y tira de la barra sin despegarla todavía.'],['Empuja y extiende','Empuja el suelo con las piernas y termina con la cadera, sin hiperextender.']],
    errors:[['Barra lejos del cuerpo','Rózala por las piernas durante todo el recorrido.'],['La cadera sube primero','Cadera y hombros deben subir juntos al despegar.'],['Tirar con los brazos','Los brazos son ganchos: no flexiones los codos.']],
    breath:['Inhala y tensa el core antes de cada repetición','Aguanta el aire al despegar la barra','Exhala arriba, con la cadera bloqueada'] },
  press_banca: { name:'Press de banca', short:'Press banca', anim:'bench', group:'Pecho', level:'Principiante', muscles:['Pecho','Tríceps','Hombro anterior'], equip:'Barra · Banco', met:5, tempo:'2 s bajada · 1 s subida',
    cues:[['Escápulas atrás y abajo','Crea un arco natural y apoya firme la espalda alta.'],['Agarre algo más ancho que los hombros','Muñecas rectas, la barra sobre el talón de la mano.'],['Baja a la parte baja del pecho','Codos a 45–60° del torso, no abiertos a 90°.'],['Empuja hacia atrás y arriba','La barra vuelve a la línea de los hombros.']],
    errors:[['Rebotar en el pecho','Toca suave y controla la transición.'],['Glúteos que se levantan','Pies firmes y cadera pegada al banco.'],['Codos muy abiertos','Estresa el hombro: ciérralos ligeramente.']],
    breath:['Inhala al bajar la barra','Mantén la tensión abajo','Exhala al empujar'] },
  press_militar: { name:'Press militar', short:'Press militar', anim:'ohp', group:'Hombros', level:'Intermedio', muscles:['Hombros','Tríceps','Core'], equip:'Barra', met:5, tempo:'1 s subida · 2 s bajada',
    cues:[['Barra sobre las clavículas','Codos ligeramente por delante de la barra.'],['Glúteos y abdomen apretados','Evita arquear la zona lumbar.'],['Aparta la cabeza','Retrae el mentón y empuja en línea recta.'],['Bloquea arriba','Barra sobre el medio del pie, cabeza «a través de la ventana».']],
    errors:[['Arquear la zona lumbar','Aprieta glúteos y reduce el peso.'],['Barra que se va adelante','Trayectoria vertical, pegada a la cara.'],['Impulso de piernas','Eso es push press: rodillas fijas.']],
    breath:['Inhala abajo y bloquea el core','Exhala al pasar la frente','Vuelve a inhalar arriba antes de bajar'] },
  curl: { name:'Curl con barra', short:'Curl', anim:'curl', group:'Brazos', level:'Principiante', muscles:['Bíceps','Antebrazo'], equip:'Barra', met:3.5, tempo:'1 s subida · 3 s bajada',
    cues:[['Codos pegados al torso','Fíjalos a los costados durante todo el movimiento.'],['Sube sin balancear','El torso no se mueve; solo trabaja el codo.'],['Aprieta arriba','Pausa breve con el bíceps contraído.'],['Baja controlado','Extiende casi por completo sin perder tensión.']],
    errors:[['Balancear el cuerpo','Reduce el peso o apoya la espalda en una pared.'],['Codos que avanzan','Convierte el curl en un ejercicio de hombro.'],['Recorrido corto','Baja hasta casi extender el brazo.']],
    breath:['Exhala al subir','Inhala al bajar'] },
};
const ORDER = ['sentadilla','peso_muerto','press_banca','press_militar','curl'];
const CAT_BASE = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0';
const BP = [['Todos',null],['Piernas','legs'],['Espalda','back'],['Pecho','chest'],['Hombros','shoulders'],['Brazos','arms'],['Core','core'],['Cardio','cardio']];
const EQ = [['Todo equipo',null],['Barra','barbell'],['Mancuerna','dumbbell'],['Polea','cable'],['Máquina','machine'],['Peso corporal','bodyweight'],['Kettlebell','kettlebell'],['Banda','band'],['Barra EZ','ez-bar'],['Smith','smith'],['Palanca','lever']];
const EQN = { barbell:'Barra', dumbbell:'Mancuerna', cable:'Polea', machine:'Máquina', bodyweight:'Peso corporal', band:'Banda', kettlebell:'Kettlebell', smith:'Smith', 'ez-bar':'Barra EZ', lever:'Palanca', other:'Otro' };
const MU = { abductors:'Abductores', abs:'Abdomen', adductors:'Aductores', biceps:'Bíceps', calves:'Gemelos', cardio:'Cardio', delts:'Deltoides', forearms:'Antebrazos', glutes:'Glúteos', hamstrings:'Isquiotibiales', lats:'Dorsales', 'levator-scapulae':'Elevador de la escápula', pectorals:'Pectorales', quads:'Cuádriceps', 'serratus-anterior':'Serrato anterior', spine:'Lumbares', traps:'Trapecio', triceps:'Tríceps', 'upper-back':'Espalda alta' };
const CATN = { strength:'Fuerza', stretching:'Estiramiento', cardio:'Cardio', plyometrics:'Pliometría' };
// MET aproximado del catálogo según categoría (para estimar calorías)
const CAT_MET = { strength:5, stretching:2.5, cardio:7, plyometrics:8 };
const CUET = { sentadilla:[.04,.28,.53,.78], peso_muerto:[.03,.75,.06,.3], press_banca:[.03,.03,.53,.78], press_militar:[.03,.2,.3,.53], curl:[.03,.25,.53,.8] };
const TAGS = ['Buena energía','Poco sueño','Molestia','Nuevo récord','Gimnasio lleno'];
const REST_S = 90;

const norm = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const nf = (n, d=1) => Number(n).toLocaleString('de-DE', { maximumFractionDigits:d });
const clock = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return (h ? h+':'+String(m).padStart(2,'0') : m) + ':' + String(x).padStart(2,'0'); };
const durTxt = s => { const m = Math.max(1, Math.round(s/60)); return m >= 60 ? Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min' : m+' min'; };
const seg = active => ({ bg: active ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'transparent', fg: active ? 'var(--color-accent-300)' : 'var(--color-neutral-400)' });
const chip = active => ({ bg: active ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'transparent', fg: active ? 'var(--color-accent-200)' : 'var(--color-neutral-300)', border: active ? 'var(--color-accent)' : 'var(--color-divider)' });
const shortName = n => n.length > 20 ? n.slice(0, 19) + '…' : n;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Fechas (semana de lunes a domingo)
const dayIdx = t => (new Date(t).getDay() + 6) % 7;
const weekStart = t => { const d = new Date(t); d.setHours(0,0,0,0); d.setDate(d.getDate() - dayIdx(d)); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const fmtLong = t => cap(new Date(t).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' }));
const fmtShort = t => cap(new Date(t).toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short' }).replace(/[.,]/g, ''));
const fmtDM = t => new Date(t).toLocaleDateString('es-ES', { day:'numeric', month:'short' }).replace('.', '');

const topSet = sets => sets.reduce((b, x) => !b || x.w > b.w || (x.w === b.w && x.reps > b.reps) ? x : b, null);
const e1rm = s => s.w * (1 + s.reps / 30);

// —— Persistencia ——
const KEY = 'gymapp-v1';
const DEFAULT = {
  profile: { name:'', kg:75, age:30 }, units:'kg', logMode:'tabla', names:{},
  routines: [
    { id:'a', name:'Fuerza A', days:[0,3], items:[{exId:'sentadilla',sets:4,reps:6},{exId:'press_banca',sets:4,reps:8},{exId:'curl',sets:3,reps:10}] },
    { id:'b', name:'Fuerza B', days:[1,4], items:[{exId:'peso_muerto',sets:3,reps:5},{exId:'press_militar',sets:4,reps:8},{exId:'curl',sets:3,reps:12}] },
  ],
  history: [], session: null, summary: null,
};
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d === 'object') return { ...DEFAULT, ...d, profile: { ...DEFAULT.profile, ...(d.profile || {}) } }; } catch (e) {}
  return DEFAULT;
}

// Marca qué cambió entre dos versiones de los datos (para que la sincronización sepa qué es más nuevo)
function stamp(prev, next) {
  if (prev === next) return next;
  const t = Date.now(), meta = { ...(next.meta || {}) }, deleted = { ...(next.deleted || {}) };
  GYM_LWW.forEach(k => { if (prev[k] !== next[k]) meta[k] = t; });
  const list = k => {
    if (prev[k] === next[k]) return next[k];
    const pm = new Map(prev[k].map(x => [x.id, x])), ids = new Set(next[k].map(x => x.id));
    prev[k].forEach(x => { if (!ids.has(x.id)) deleted[x.id] = t; });
    return next[k].map(x => pm.get(x.id) === x ? x : { ...x, u: t });
  };
  return { ...next, routines: list('routines'), history: list('history'), meta, deleted };
}

// —— Sincronización (servidor propio en Google Apps Script) ——
const SYNC_KEY = 'gymapp-sync';
const syncCfg = () => {
  const base = window.GYM_SYNC || {};
  try { return { url: base.url, code: base.code, ...JSON.parse(localStorage.getItem(SYNC_KEY) || '{}') }; } catch (e) { return { url: base.url, code: base.code }; }
};
const saveSyncCode = code => { try { localStorage.setItem(SYNC_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'), code })); } catch (e) {} };
const agoTxt = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'hace un momento' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : 'hace ' + Math.round(s / 3600) + ' h'; };

function App() {
  const [data, setData] = useState(load);
  const [ui, setUi] = useState(() => ({
    screen: data.summary ? 'summary' : 'home', detailId:'sentadilla', detailFrom:'library', detailTab:'tec', openCue:-1, layer:'normal', showAngles:false, showPath:false, fault:-1, seek:'', viewerFull:false,
    editing:null, editErr:false, picker:false, pickQ:'', progMetric:'vol', progEx:null, search:'', bp:'Todos', eq:'Todo equipo', libLimit:40,
    gifId:null, gifFrom:'library', addSheet:false, toast:'', histId:null, histFrom:'home', profile:null,
  }));
  const [catalog, setCatalog] = useState(null);
  const [catErr, setCatErr] = useState(false);
  const [now, setNow] = useState(Date.now());
  const catMap = useRef({});
  const detailRef = useRef(null);
  const toastT = useRef();

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }, [data]);

  // Sincronización: se envía 2,5 s después de cada cambio y se revisa cada minuto / al volver a la app
  const [sync, setSync] = useState({ status: 'off' });
  const dataRef = useRef(data); dataRef.current = data;
  const lastSynced = useRef(null), busy = useRef(false), again = useRef(false);
  const doSync = async () => {
    const cfg = syncCfg();
    if (!cfg.url || !cfg.code) { setSync({ status: 'off' }); return; }
    if (busy.current) { again.current = true; return; }
    busy.current = true; setSync(x => ({ ...x, status: 'syncing' }));
    try {
      const sent = dataRef.current;
      const res = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ code: cfg.code, data: sent }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Error del servidor');
      lastSynced.current = JSON.stringify(gymMerge(sent, j.data));
      setData(d => gymMerge(d, j.data));
      setSync({ status: 'ok', at: Date.now() });
    } catch (e) {
      setSync({ status: 'error', at: Date.now(), msg: navigator.onLine === false ? 'Sin conexión' : String(e.message || e) });
    }
    busy.current = false;
    if (again.current) { again.current = false; doSync(); }
  };
  useEffect(() => {
    if (lastSynced.current === JSON.stringify(data)) return;
    const t = setTimeout(doSync, lastSynced.current == null ? 0 : 2500);
    return () => clearTimeout(t);
  }, [data]);
  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'visible') doSync(); };
    const iv = setInterval(vis, 60000);
    document.addEventListener('visibilitychange', vis); window.addEventListener('online', doSync);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', doSync); };
  }, []);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);
  const loadCatalog = () => {
    setCatErr(false);
    fetch(CAT_BASE + '/api/es/exercises.json').then(r => r.json()).then(d => {
      const arr = (Array.isArray(d) ? d : (d.exercises || [])).map(e => ({ ...e, key: 'cat:' + e.id, lc: norm(e.name + ' ' + e.slug + ' ' + (MU[e.muscle] || '')) }));
      const m = {}; arr.forEach(e => { m[e.key] = e; }); catMap.current = m;
      setCatalog(arr);
    }).catch(() => setCatErr(true));
  };
  useEffect(loadCatalog, []);

  const commit = fn => setData(d => stamp(d, fn(d)));
  const upd = p => commit(d => ({ ...d, ...(typeof p === 'function' ? p(d) : p) }));
  const setU = p => setUi(u => ({ ...u, ...(typeof p === 'function' ? p(u) : p) }));
  const toast = msg => { setU({ toast: msg }); clearTimeout(toastT.current); toastT.current = setTimeout(() => setU({ toast:'' }), 2200); };

  const units = data.units, kg = data.profile.kg;
  const toUnit = k => units === 'kg' ? Math.round(k*2)/2 : Math.round(k*LB);
  const fw = k => nf(toUnit(k));
  const fwu = k => fw(k) + ' ' + units;
  const fvol = k => { const v = units === 'kg' ? k : k*LB; return v >= 10000 ? nf(v/1000) + (units === 'kg' ? ' t' : 'k lb') : nf(Math.round(v), 0) + ' ' + units; };
  const parseW = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : (units === 'kg' ? n : n / LB); };

  const info = id => {
    if (EX[id]) return EX[id];
    const c = catMap.current[id];
    if (c) return { name: c.name, short: shortName(c.name), muscles: [MU[c.muscle] || c.muscle] };
    const n = data.names[id] || 'Ejercicio';
    return { name: n, short: shortName(n), muscles: [] };
  };
  const met = id => EX[id] ? EX[id].met : (catMap.current[id] && CAT_MET[catMap.current[id].category]) || 5;

  // —— Historial ——
  const hist = data.history;
  const lastPerf = id => { for (const h of hist) { const e = h.ex.find(e => e.exId === id); if (e && e.sets.length) return topSet(e.sets); } return null; };
  const maxEver = id => { let m = null; hist.forEach(h => h.ex.forEach(e => { if (e.exId === id) { const t = topSet(e.sets); if (t && (!m || t.w > m.w || (t.w === m.w && t.reps > m.reps))) m = t; } })); return m; };
  const loggedIds = () => { const seen = []; hist.forEach(h => h.ex.forEach(e => { if (!seen.includes(e.exId)) seen.push(e.exId); })); return seen; };
  const weekMax = (id, ws) => { let m = null; hist.forEach(h => { if (h.date >= ws && h.date < addDays(ws, 7)) h.ex.forEach(e => { if (e.exId === id) e.sets.forEach(x => { if (m == null || x.w > m) m = x.w; }); }); }); return m; };
  // Calorías: MET medio de los ejercicios × 3,5 × peso / 200 por minuto
  const avgMet = s => { const all = s.ex.flatMap(e => e.sets.map(() => met(e.exId))); return all.length ? all.reduce((a, b) => a + b, 0) / all.length : 5; };
  const sessKcal = (s, sec) => avgMet(s) * 3.5 * kg / 200 * sec / 60;

  // —— Sesión ——
  const startSession = r => {
    if (data.session && !confirm('Ya tienes una sesión en curso. ¿Descartarla y empezar otra?')) return;
    const ex = r.items.map(it => {
      const p = lastPerf(it.exId), w = p ? p.w : 20;
      return { exId: it.exId, prev: p ? { w: p.w, reps: p.reps } : null, sets: Array.from({ length: it.sets }, () => ({ w, reps: it.reps, done: false, wStr: null })) };
    });
    upd({ session: { name: r.name, routineId: r.id, start: Date.now(), ex, cur: 0, notes: '', tags: [], restEnd: 0, restMax: REST_S } });
    setU({ screen: 'session' });
  };
  const updSes = fn => commit(d => d.session ? { ...d, session: fn(d.session) } : d);
  const updSet = (i, patch) => updSes(s => ({ ...s, ex: s.ex.map((e, k) => k !== s.cur ? e : { ...e, sets: e.sets.map((x, j) => j === i ? { ...x, ...patch } : x) }) }));
  const toggleSet = i => {
    const s = data.session, set = s.ex[s.cur].sets[i];
    updSet(i, { done: !set.done, wStr: null });
    if (!set.done) updSes(x => ({ ...x, restEnd: Date.now() + REST_S * 1000, restMax: REST_S }));
  };
  const finishSession = () => {
    const s = data.session; if (!s) return;
    const elapsed = (Date.now() - s.start) / 1000;
    const doneEx = s.ex.map(e => ({ exId: e.exId, sets: e.sets.filter(x => x.done).map(({ w, reps }) => ({ w, reps })) })).filter(e => e.sets.length);
    if (!doneEx.length && !confirm('No has completado ninguna serie. ¿Terminar igualmente?')) return;
    let vol = 0, sets = 0;
    doneEx.forEach(e => e.sets.forEach(x => { vol += x.w * x.reps; sets++; }));
    const rows = doneEx.map(e => { const t = topSet(e.sets), pm = maxEver(e.exId); return { exId: e.exId, top: t.w, reps: t.reps, pr: !!pm && (t.w > pm.w || (t.w === pm.w && t.reps > pm.reps)) }; });
    const names = { ...data.names }; doneEx.forEach(e => { if (!EX[e.exId]) names[e.exId] = info(e.exId).name; });
    upd({ names, session: null, summary: { name: s.name, start: s.start, elapsed, kcal: Math.round(sessKcal(s, elapsed)), met: avgMet(s), vol, sets, rows, ex: doneEx, notes: s.notes, tags: s.tags } });
    setU({ screen: 'summary' });
  };
  const discardSession = () => { if (!confirm('¿Descartar esta sesión? No se guardará nada.')) return; upd({ session: null }); setU({ screen: 'home' }); };

  // —— Navegación ——
  const go = screen => () => setU({ screen });
  const openDetail = (id, from) => !EX[id]
    ? setU({ screen:'gif', gifId:id, gifFrom:from, addSheet:false })
    : setU({ screen:'detail', detailId:id, detailFrom:from, detailTab:'tec', openCue:-1, fault:-1, seek:'', viewerFull:false });
  const backTo = from => from === 'session' && data.session ? 'session' : from;
  const scheme = it => it.sets + '×' + it.reps;

  const S = ui, s = data.session, ses = s ? (() => {
    const elapsed = (now - s.start) / 1000;
    return { elapsed, kcal: Math.round(sessKcal(s, elapsed)), rest: Math.max(0, (s.restEnd - now) / 1000) };
  })() : null;

  const UnitSeg = () => html`<div style=${sx('display:flex;border:1px solid var(--color-divider);border-radius:var(--radius-md);overflow:hidden;flex:none')}>
    ${['kg','lb'].map(u => { const c = seg(u === units); return html`<button key=${u} onClick=${() => { upd({ units: u }); updSes(x => ({ ...x, ex: x.ex.map(e => ({ ...e, sets: e.sets.map(y => ({ ...y, wStr:null })) })) })); }} style=${sx(`border:0;background:${c.bg};color:${c.fg};font-size:12px;padding:6px 10px;cursor:pointer`)}>${u}</button>`; })}
  </div>`;
  const Stat = (label, value) => html`<div style=${sx('padding:12px;border-radius:var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:2px;min-width:0')}><span style=${sx('font-size:11px;color:var(--color-neutral-400)')}>${label}</span><span style=${sx('font-size:20px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>${value}</span></div>`;
  const Sheet = (title, right, body) => html`<div style=${sx('position:absolute;inset:0;background:color-mix(in srgb, var(--color-neutral-900) 70%, transparent);display:flex;flex-direction:column;justify-content:flex-end;z-index:30')}>
    <div style=${sx('background:var(--color-surface);border-radius:var(--radius-lg) var(--radius-lg) 0 0;box-shadow:var(--shadow-lg);padding:10px 20px 20px;display:flex;flex-direction:column;gap:12px;max-height:90%')}>
      <span style=${sx('align-self:center;width:36px;height:4px;border-radius:2px;background:var(--color-neutral-700)')}></span>
      <div style=${sx('display:flex;justify-content:space-between;align-items:center')}><span style=${sx('font-size:17px;font-weight:500')}>${title}</span>${right}</div>
      ${body}
    </div></div>`;
  const BackBar = (onBack, middle, right, icon='ph-arrow-left') => html`<div style=${sx('display:flex;align-items:center;gap:8px;padding:8px 12px')}>
    <button class="btn btn-icon btn-secondary" onClick=${onBack} style=${sx('border:0')}><i class=${'ph ' + icon} style=${sx('font-size:20px')}></i></button>
    <span style=${sx('flex:1;min-width:0;font-size:13px;color:var(--color-neutral-400)')}>${middle}</span>${right}</div>`;
  const scrollCol = (pad, gap) => sx(`flex:1;min-height:0;overflow-y:auto;padding:${pad};display:flex;flex-direction:column;gap:${gap}`);

  // ════════ INICIO ════════
  const renderHome = () => {
    const today = dayIdx(now), ws = weekStart(now);
    const routines = data.routines;
    const todays = routines.filter(r => r.days.includes(today));
    let next = todays[0];
    if (!next) { for (let k = 1; k <= 7 && !next; k++) next = routines.find(r => r.days.includes((today + k) % 7)); }
    next = next || routines[0];
    const isToday = next && next.days.includes(today);
    const weekH = hist.filter(h => h.date >= ws);
    const doneDays = new Set(weekH.map(h => dayIdx(h.date)));
    const planned = new Set(routines.flatMap(r => r.days));
    const wVol = weekH.reduce((n, h) => n + h.vol, 0), wKcal = weekH.reduce((n, h) => n + h.kcal, 0);
    const estMin = next ? Math.round(next.items.reduce((n, it) => n + it.sets, 0) * 2.8 + 5) : 0;
    return html`<div class="scroll" style=${scrollCol('12px 20px 24px', '22px')}>
      <div style=${sx('display:flex;align-items:flex-start;justify-content:space-between;gap:12px')}>
        <div><div style=${sx('font-size:12px;color:var(--color-neutral-500)')}>${fmtLong(now)}</div><h3 style=${sx('margin:4px 0 0')}>Hola${data.profile.name ? ', ' + data.profile.name : ''}</h3></div>
        <div style=${sx('display:flex;gap:6px;align-items:center')}>${UnitSeg()}
          <button class="btn btn-icon btn-secondary" onClick=${openProfile} aria-label="Perfil y sincronización" style=${sx(`width:32px;height:32px;position:relative;color:${sync.status === 'error' ? '#e5826f' : 'inherit'}`)}><i class=${sync.status === 'off' ? 'ph ph-user-circle' : sync.status === 'error' ? 'ph ph-cloud-warning' : sync.status === 'syncing' ? 'ph ph-cloud-arrow-up' : 'ph ph-cloud-check'} style=${sx('font-size:18px')}></i></button>
        </div>
      </div>

      ${s ? html`<button onClick=${go('session')} style=${sx('display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:var(--radius-lg);border:1px solid var(--color-accent);background:color-mix(in srgb, var(--color-accent) 10%, transparent);color:var(--color-text);cursor:pointer;text-align:left')}>
          <span style=${sx('width:8px;height:8px;border-radius:50%;background:var(--color-accent);box-shadow:0 0 10px var(--color-accent)')}></span>
          <span style=${sx('flex:1;display:flex;flex-direction:column')}><span style=${sx('font-size:15px;font-weight:500')}>${s.name} en curso</span><span style=${sx('font-size:12px;color:var(--color-neutral-400)')}>${clock(ses.elapsed)} · ${ses.kcal} kcal</span></span>
          <span style=${sx('font-size:13px;color:var(--color-accent)')}>Continuar</span><i class="ph ph-caret-right" style=${sx('color:var(--color-accent)')}></i>
        </button>`
      : next ? html`<div style=${sx('padding:18px;border-radius:var(--radius-lg);background:linear-gradient(160deg, var(--color-accent-900), var(--color-surface) 70%);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:14px')}>
          <div style=${sx('font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--color-accent-300)')}>${isToday ? 'Hoy toca' : 'Próxima rutina'}</div>
          <div style=${sx('display:flex;justify-content:space-between;align-items:baseline;gap:8px')}><span style=${sx('font-size:24px;font-weight:500;letter-spacing:-.02em')}>${next.name}</span><span style=${sx('font-size:12px;color:var(--color-neutral-400);white-space:nowrap')}>${next.items.length} ejercicios · ~${estMin} min</span></div>
          <div style=${sx('display:flex;flex-direction:column;gap:8px')}>
            ${next.items.map((it, i) => { const p = lastPerf(it.exId); return html`<div key=${i} style=${sx('display:flex;align-items:center;gap:10px;font-size:14px')}><span style=${sx('width:4px;height:4px;border-radius:50%;background:var(--color-neutral-500)')}></span><span style=${sx('flex:1;min-width:0')}>${info(it.exId).short}</span><span style=${sx('color:var(--color-neutral-400);font-size:13px')}>${scheme(it)}</span><span style=${sx('width:64px;text-align:right;font-size:13px;color:var(--color-accent-300)')}>${p ? fwu(p.w) : '—'}</span></div>`; })}
          </div>
          <button class="btn btn-primary" onClick=${() => startSession(next)} style=${sx('height:46px;font-size:15px;margin-top:2px')}><i class="ph ph-play"></i>Empezar sesión</button>
        </div>`
      : html`<div style=${sx('padding:18px;border-radius:var(--radius-lg);background:var(--color-surface);display:flex;flex-direction:column;gap:12px')}>
          <span style=${sx('font-size:17px;font-weight:500')}>Crea tu primera rutina</span>
          <span style=${sx('font-size:13px;color:var(--color-neutral-400)')}>Elige ejercicios, series y repeticiones, y los días que entrenas.</span>
          <button class="btn btn-primary" onClick=${newRoutine} style=${sx('height:44px')}><i class="ph ph-plus"></i>Nueva rutina</button>
        </div>`}

      <div style=${sx('display:flex;flex-direction:column;gap:10px')}>
        <div style=${sx('display:flex;justify-content:space-between;align-items:baseline')}><span style=${sx('font-size:16px;font-weight:500')}>Esta semana</span><span style=${sx('font-size:12px;color:var(--color-neutral-500)')}>${fmtDM(ws)} – ${fmtDM(addDays(ws, 6))}</span></div>
        <div style=${sx('display:grid;grid-template-columns:repeat(7,1fr);gap:6px')}>
          ${DAYS.map((l, i) => { const done = doneDays.has(i), isT = i === today, plan = planned.has(i);
            return html`<div key=${i} style=${sx(`display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0;border-radius:var(--radius-md);background:${isT ? 'var(--color-surface)' : 'transparent'}`)}>
              <span style=${sx('font-size:11px;color:var(--color-neutral-500)')}>${l}</span>
              <span style=${sx(`width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:${done ? 'var(--color-accent)' : 'transparent'};color:${done ? 'var(--color-bg)' : (isT ? 'var(--color-text)' : 'var(--color-neutral-500)')};border:1px ${plan && !done ? 'dashed' : 'solid'} ${done || isT ? 'var(--color-accent)' : plan ? 'var(--color-neutral-500)' : 'var(--color-divider)'}`)}>${new Date(addDays(ws, i)).getDate()}</span>
            </div>`; })}
        </div>
        <div style=${sx('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px')}>
          ${Stat('Sesiones', html`${weekH.length}${planned.size ? html`<span style=${sx('font-size:13px;color:var(--color-neutral-500)')}> / ${planned.size}</span>` : ''}`)}
          ${Stat('Volumen', fvol(wVol))}
          ${Stat('Calorías', nf(wKcal, 0))}
        </div>
      </div>

      <div style=${sx('display:flex;flex-direction:column;gap:10px')}>
        <span style=${sx('font-size:16px;font-weight:500')}>Sesiones recientes</span>
        ${!hist.length && html`<div style=${sx('font-size:13px;color:var(--color-neutral-500)')}>Aún no hay sesiones. Cuando termines una, aparecerá aquí con tus pesos, calorías y notas.</div>`}
        ${hist.slice(0, 6).map(h => html`<button key=${h.id} onClick=${() => setU({ screen:'hist', histId:h.id, histFrom:'home' })} style=${sx('padding:14px;border-radius:var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:8px;border:0;color:var(--color-text);text-align:left;cursor:pointer')}>
          <div style=${sx('display:flex;justify-content:space-between;align-items:baseline;width:100%')}><span style=${sx('font-size:15px;font-weight:500')}>${h.name}</span><span style=${sx('font-size:12px;color:var(--color-neutral-500)')}>${fmtShort(h.date)}</span></div>
          <div style=${sx('display:flex;gap:14px;font-size:12px;color:var(--color-neutral-400)')}><span style=${sx('display:flex;gap:4px;align-items:center')}><i class="ph ph-timer"></i>${durTxt(h.elapsed)}</span><span style=${sx('display:flex;gap:4px;align-items:center')}><i class="ph ph-fire"></i>${h.kcal} kcal</span><span style=${sx('display:flex;gap:4px;align-items:center')}><i class="ph ph-barbell"></i>${fvol(h.vol)}</span></div>
          ${(h.notes || (h.tags && h.tags.length)) && html`<div style=${sx('display:flex;gap:8px;font-size:13px;line-height:1.45;color:var(--color-neutral-300)')}><i class="ph ph-note-pencil" style=${sx('color:var(--color-accent);margin-top:2px')}></i><span>${[h.notes, ...(h.tags || []).map(t => '#' + t.replace(/ /g, ''))].filter(Boolean).join(' ')}</span></div>`}
        </button>`)}
      </div>
    </div>`;
  };

  // ════════ DETALLE DE SESIÓN PASADA ════════
  const renderHist = () => {
    const h = hist.find(x => x.id === S.histId);
    if (!h) return null;
    const del = () => { if (!confirm('¿Borrar esta sesión del historial?')) return; upd(d => ({ history: d.history.filter(x => x.id !== h.id) })); setU({ screen: S.histFrom }); };
    return html`<div style=${sx('flex:1;min-height:0;display:flex;flex-direction:column')}>
      ${BackBar(go(S.histFrom), fmtLong(h.date), html`<button class="btn btn-icon btn-secondary" onClick=${del} aria-label="Borrar" style=${sx('border:0;color:var(--color-neutral-400)')}><i class="ph ph-trash"></i></button>`)}
      <div class="scroll" style=${scrollCol('8px 20px 24px', '18px')}>
        <h3 style=${sx('margin:0')}>${h.name}</h3>
        <div style=${sx('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px')}>${Stat('Duración', durTxt(h.elapsed))}${Stat('Calorías', h.kcal + ' kcal')}${Stat('Volumen', fvol(h.vol))}</div>
        ${h.ex.map((e, i) => html`<div key=${i} style=${sx('padding:12px 14px;border-radius:var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:6px')}>
          <span style=${sx('font-size:15px;font-weight:500')}>${info(e.exId).name}</span>
          ${e.sets.map((x, j) => html`<div key=${j} style=${sx('display:flex;gap:12px;font-size:13px;color:var(--color-neutral-300)')}><span style=${sx('width:18px;color:var(--color-neutral-500)')}>${j + 1}</span><span>${fwu(x.w)} × ${x.reps}</span></div>`)}
        </div>`)}
        <div class="field"><label>Notas</label><textarea class="input" value=${h.notes || ''} onChange=${e => { const v = e.target.value; upd(d => ({ history: d.history.map(x => x.id === h.id ? { ...x, notes: v } : x) })); }} placeholder="Sin notas" style=${sx('font-size:14px;line-height:1.45')}></textarea></div>
        ${h.tags && h.tags.length > 0 && html`<div style=${sx('display:flex;flex-wrap:wrap;gap:6px')}>${h.tags.map(t => html`<span key=${t} class="tag tag-accent">${t}</span>`)}</div>`}
      </div>
    </div>`;
  };

  const openProfile = () => setU({ profile: { ...data.profile, kgStr: fw(data.profile.kg), code: syncCfg().code || '' } });

  // ════════ RUTINAS ════════
  const newRoutine = () => setU({ editing: { id:null, name:'', days:[], items:[] }, editErr:false, screen:'editor' });
  const renderRoutines = () => html`<div class="scroll" style=${scrollCol('12px 20px 24px', '16px')}>
    <div style=${sx('display:flex;justify-content:space-between;align-items:center')}><h3 style=${sx('margin:0')}>Rutinas</h3><button class="btn btn-primary" onClick=${newRoutine}><i class="ph ph-plus"></i>Nueva</button></div>
    ${!data.routines.length && html`<div style=${sx('font-size:13px;color:var(--color-neutral-500)')}>No tienes rutinas. Crea una con el botón «Nueva».</div>`}
    ${data.routines.map(r => html`<div key=${r.id} style=${sx('padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);display:flex;flex-direction:column;gap:12px')}>
      <div style=${sx('display:flex;justify-content:space-between;align-items:baseline')}><span style=${sx('font-size:18px;font-weight:500')}>${r.name}</span><span style=${sx('font-size:12px;color:var(--color-neutral-400)')}>${r.days.length ? r.days.slice().sort().map(d => DAYS[d]).join(' · ') : 'Sin días'}</span></div>
      <div style=${sx('display:flex;flex-direction:column;gap:6px')}>${r.items.map((it, i) => html`<div key=${i} style=${sx('display:flex;justify-content:space-between;gap:8px;font-size:13px')}><span style=${sx('color:var(--color-neutral-300)')}>${info(it.exId).name}</span><span style=${sx('color:var(--color-neutral-500);flex:none')}>${scheme(it)}</span></div>`)}</div>
      <div style=${sx('display:flex;gap:8px')}>
        <button class="btn btn-secondary" onClick=${() => setU({ editing: JSON.parse(JSON.stringify(r)), editErr:false, screen:'editor' })} style=${sx('flex:1;height:40px')}><i class="ph ph-pencil-simple"></i>Editar</button>
        <button class="btn btn-primary" onClick=${() => startSession(r)} style=${sx('flex:1;height:40px')}><i class="ph ph-play"></i>Empezar</button>
      </div>
    </div>`)}
  </div>`;

  // ════════ EDITOR DE RUTINA ════════
  const renderEditor = () => {
    const ed = S.editing; if (!ed) return null;
    const updEd = fn => setU(u => ({ editing: fn(u.editing), editErr:false }));
    const save = () => {
      if (!ed.items.length) { setU({ editErr:true }); return; }
      const r = { ...ed, name: ed.name.trim() || 'Rutina nueva', id: ed.id || 'r' + Date.now() };
      upd(d => ({ routines: ed.id ? d.routines.map(x => x.id === ed.id ? r : x) : [...d.routines, r] }));
      setU({ editing:null, picker:false, screen:'routines' });
    };
    const del = () => { if (!confirm('¿Borrar la rutina «' + ed.name + '»?')) return; upd(d => ({ routines: d.routines.filter(x => x.id !== ed.id) })); setU({ editing:null, screen:'routines' }); };
    const pq = norm(S.pickQ.trim());
    const pickIds = pq ? [...ORDER.filter(id => norm(EX[id].name).includes(pq)), ...(catalog || []).filter(e => e.lc.includes(pq)).slice(0, 30).map(e => e.key)]
      : [...ORDER, ...ed.items.map(it => it.exId).filter(id => !EX[id])];
    const counter = (label, onDec, onInc) => html`<div style=${sx('display:flex;align-items:center;justify-content:space-between;border:1px solid var(--color-divider);border-radius:var(--radius-md);padding:2px')}><button class="btn btn-icon btn-ghost" onClick=${onDec} style=${sx('width:34px;height:34px')}><i class="ph ph-minus"></i></button><span style=${sx('font-size:14px')}>${label}</span><button class="btn btn-icon btn-ghost" onClick=${onInc} style=${sx('width:34px;height:34px')}><i class="ph ph-plus"></i></button></div>`;
    return html`<div style=${sx('flex:1;min-height:0;display:flex;flex-direction:column')}>
      <div style=${sx('display:flex;align-items:center;gap:8px;padding:8px 12px')}>
        <button class="btn btn-icon btn-secondary" onClick=${() => setU({ editing:null, picker:false, screen:'routines' })} style=${sx('border:0')}><i class="ph ph-x" style=${sx('font-size:20px')}></i></button>
        <span style=${sx('flex:1;font-size:17px;font-weight:500')}>${ed.id ? 'Editar rutina' : 'Nueva rutina'}</span>
        <button class="btn btn-primary" onClick=${save}>Guardar</button>
      </div>
      <div class="scroll" style=${scrollCol('8px 20px 24px', '20px')}>
        <div class="field"><label>Nombre</label><input class="input" value=${ed.name} onChange=${e => { const v = e.target.value; updEd(x => ({ ...x, name: v })); }} placeholder="Ej. Torso / Pierna" /></div>
        <div class="field"><label>Días</label>
          <div style=${sx('display:grid;grid-template-columns:repeat(7,1fr);gap:6px')}>
            ${DAYS.map((l, i) => { const on = ed.days.includes(i), c = chip(on); return html`<button key=${i} onClick=${() => updEd(x => ({ ...x, days: on ? x.days.filter(d => d !== i) : [...x.days, i] }))} style=${sx(`height:40px;border-radius:var(--radius-md);border:1px solid ${c.border};background:${c.bg};color:${c.fg};cursor:pointer;font-size:13px`)}>${l}</button>`; })}
          </div></div>
        <div style=${sx('display:flex;flex-direction:column;gap:10px')}>
          <div style=${sx('display:flex;justify-content:space-between;align-items:baseline')}><span style=${sx('font-size:12px;color:color-mix(in srgb, var(--color-text) 70%, transparent)')}>Ejercicios</span><span style=${sx('font-size:12px;color:var(--color-neutral-500)')}>${ed.items.length} ${ed.items.length === 1 ? 'ejercicio' : 'ejercicios'}</span></div>
          ${ed.items.map((it, i) => {
            const mod = patch => updEd(x => ({ ...x, items: x.items.map((y, j) => j === i ? { ...y, ...patch(y) } : y) }));
            const move = d => updEd(x => { const items = x.items.slice(), j = i + d; if (j < 0 || j >= items.length) return x; [items[i], items[j]] = [items[j], items[i]]; return { ...x, items }; });
            return html`<div key=${it.exId + i} style=${sx('padding:12px 14px;border-radius:var(--radius-md);background:var(--color-surface);display:flex;flex-direction:column;gap:10px')}>
              <div style=${sx('display:flex;align-items:center;gap:4px')}><span style=${sx('font-size:12px;color:var(--color-neutral-500);width:16px')}>${i + 1}</span><span style=${sx('flex:1;min-width:0;font-size:15px;font-weight:500')}>${info(it.exId).name}</span>
                <button class="btn btn-icon btn-secondary" onClick=${() => move(-1)} aria-label="Subir" style=${sx('width:30px;height:30px;border:0;color:var(--color-neutral-400)')}><i class="ph ph-caret-up"></i></button>
                <button class="btn btn-icon btn-secondary" onClick=${() => move(1)} aria-label="Bajar" style=${sx('width:30px;height:30px;border:0;color:var(--color-neutral-400)')}><i class="ph ph-caret-down"></i></button>
                <button class="btn btn-icon btn-secondary" onClick=${() => updEd(x => ({ ...x, items: x.items.filter((_, j) => j !== i) }))} aria-label="Quitar" style=${sx('width:30px;height:30px;border:0;color:var(--color-neutral-400)')}><i class="ph ph-trash"></i></button></div>
              <div style=${sx('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
                ${counter(it.sets + ' series', () => mod(y => ({ sets: Math.max(1, y.sets - 1) })), () => mod(y => ({ sets: Math.min(10, y.sets + 1) })))}
                ${counter(it.reps + ' reps', () => mod(y => ({ reps: Math.max(1, y.reps - 1) })), () => mod(y => ({ reps: Math.min(50, y.reps + 1) })))}
              </div>
            </div>`; })}
          ${S.editErr && html`<div style=${sx('font-size:13px;color:var(--color-accent-300);display:flex;gap:6px;align-items:center')}><i class="ph ph-warning-circle"></i>Añade al menos un ejercicio para guardar.</div>`}
          <button class="btn btn-secondary" onClick=${() => setU({ picker:true })} style=${sx('height:46px;border-style:dashed')}><i class="ph ph-plus"></i>Añadir ejercicio</button>
          ${ed.id && html`<button class="btn btn-danger" onClick=${del} style=${sx('height:42px;margin-top:8px')}><i class="ph ph-trash"></i>Borrar rutina</button>`}
        </div>
      </div>
      ${S.picker && Sheet('Añadir ejercicios', html`<button class="btn btn-primary" onClick=${() => setU({ picker:false, pickQ:'' })}>Listo</button>`, html`
        <input class="input" value=${S.pickQ} onChange=${e => setU({ pickQ: e.target.value })} placeholder=${catalog ? 'Buscar en ' + nf(catalog.length, 0) + ' ejercicios' : 'Buscar ejercicio'} style=${sx('min-height:40px')} />
        <div class="scroll" style=${sx('max-height:440px;overflow-y:auto;display:flex;flex-direction:column')}>
          ${pickIds.map(id => { const inf = info(id), gif = catMap.current[id] ? catMap.current[id].gifUrl : ''; const on = ed.items.some(it => it.exId === id);
            return html`<button key=${id} onClick=${() => { if (!on && !EX[id]) upd(d => ({ names: { ...d.names, [id]: inf.name } })); updEd(x => ({ ...x, items: on ? x.items.filter(it => it.exId !== id) : [...x.items, { exId:id, sets:3, reps:10 }] })); }} style=${sx('display:flex;align-items:center;gap:12px;padding:10px 4px;border:0;background:transparent;color:var(--color-text);cursor:pointer;text-align:left;min-height:52px')}>
              <span style=${sx('width:40px;height:40px;flex:none;border-radius:var(--radius-md);background:var(--color-accent-900);display:grid;place-items:center;color:var(--color-accent-300);overflow:hidden')}>${gif ? html`<img src=${gif} alt="" loading="lazy" style=${sx('width:100%;height:100%;object-fit:cover;background:var(--color-neutral-100)')} />` : html`<i class="ph ph-cube" style=${sx('font-size:20px')}></i>`}</span>
              <span style=${sx('flex:1;min-width:0;display:flex;flex-direction:column')}><span style=${sx('font-size:15px')}>${inf.name}</span><span style=${sx('font-size:12px;color:var(--color-neutral-500)')}>${inf.muscles.join(' · ')}</span></span>
              <span style=${sx(`width:24px;height:24px;flex:none;border-radius:50%;display:grid;place-items:center;border:1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-divider)'};background:${on ? 'var(--color-accent)' : 'transparent'};color:var(--color-bg)`)}><i class="ph-bold ph-check" style=${sx('font-size:12px')}></i></span>
            </button>`; })}
          ${pq && !pickIds.length && html`<div style=${sx('padding:16px 4px;font-size:13px;color:var(--color-neutral-500)')}>Sin resultados.</div>`}
        </div>`)}
    </div>`;
  };

  // ════════ EJERCICIOS ════════
  const renderLibrary = () => {
    const q = norm(S.search.trim());
    const bpKey = (BP.find(b => b[0] === S.bp) || [])[1], eqKey = (EQ.find(b => b[0] === S.eq) || [])[1];
    const ownIds = ORDER.filter(id => (S.bp === 'Todos' || EX[id].group === S.bp) && (!eqKey || eqKey === 'barbell') && (!q || norm(EX[id].name + ' ' + EX[id].muscles.join(' ')).includes(q)));
    const catAll = catalog ? catalog.filter(e => (!bpKey || e.bodyPart === bpKey) && (!eqKey || e.equipment === eqKey) && (!q || e.lc.includes(q))) : [];
    const chipRow = (list, cur, key, h, r) => html`<div class="scroll" style=${sx('display:flex;gap:6px;overflow-x:auto;margin:0 -20px;padding:0 20px')}>
      ${list.map(([label]) => { const c = chip(cur === label); return html`<button key=${label} onClick=${() => setU({ [key]: label, libLimit: 40 })} style=${sx(`flex:none;height:${h}px;padding:0 12px;border-radius:${r};border:1px solid ${c.border};background:${c.bg};color:${c.fg};font-size:13px;cursor:pointer`)}>${label}</button>`; })}</div>`;
    return html`<div class="scroll" style=${scrollCol('12px 20px 24px', '14px')}>
      <div style=${sx('display:flex;justify-content:space-between;align-items:baseline;gap:8px')}><h3 style=${sx('margin:0')}>Ejercicios</h3><span style=${sx('font-size:12px;color:var(--color-neutral-500)')}>${catalog ? nf(catAll.length, 0) + ' en catálogo · 5 en 3D' : '5 en 3D'}</span></div>
      <div style=${sx('position:relative')}><i class="ph ph-magnifying-glass" style=${sx('position:absolute;left:12px;top:12px;color:var(--color-neutral-500)')}></i><input class="input" value=${S.search} onChange=${e => setU({ search: e.target.value, libLimit: 40 })} placeholder="Buscar en el catálogo" style=${sx('padding-left:34px;min-height:40px')} /></div>
      <div style=${sx('display:flex;flex-direction:column;gap:8px')}>${chipRow(BP, S.bp, 'bp', 32, '16px')}${chipRow(EQ, S.eq, 'eq', 28, 'var(--radius-md)')}</div>
      ${ownIds.length > 0 && html`<div style=${sx('display:flex;flex-direction:column')}>
        <span style=${sx('font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-neutral-500);padding-bottom:2px')}>Con modelo 3D interactivo</span>
        ${ownIds.map(id => html`<button key=${id} onClick=${() => openDetail(id, 'library')} style=${sx('display:flex;align-items:center;gap:12px;padding:12px 0;border:0;background:transparent;color:var(--color-text);cursor:pointer;text-align:left;border-bottom:1px solid color-mix(in srgb, var(--color-text) 6%, transparent)')}>
          <span style=${sx('width:48px;height:48px;flex:none;border-radius:var(--radius-md);background:radial-gradient(circle at 50% 70%, var(--color-accent-800), var(--color-surface));display:grid;place-items:center;color:var(--color-accent-300)')}><i class="ph ph-cube" style=${sx('font-size:22px')}></i></span>
          <span style=${sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}><span style=${sx('font-size:15px;font-weight:500')}>${EX[id].name}</span><span style=${sx('font-size:12px;color:var(--color-neutral-500)')}>${EX[id].muscles.join(' · ')}</span></span>
          <span class="tag tag-accent">3D</span><i class="ph ph-caret-right" style=${sx('color:var(--color-neutral-600)')}></i>
        </button>`)}
      </div>`}
      <div style=${sx('display:flex;flex-direction:column')}>
        <span style=${sx('font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-neutral-500);padding-bottom:2px')}>Catálogo animado</span>
        ${!catalog && !catErr && html`<div style=${sx('padding:20px 0;font-size:13px;color:var(--color-neutral-400);display:flex;gap:8px;align-items:center')}><i class="ph ph-circle-notch"></i>Cargando 1.300+ ejercicios…</div>`}
        ${catErr && html`<div style=${sx('padding:16px 0;display:flex;flex-direction:column;gap:10px;align-items:flex-start')}><span style=${sx('font-size:13px;color:var(--color-neutral-400)')}>No se pudo cargar el catálogo. Revisa tu conexión.</span><button class="btn btn-secondary" onClick=${loadCatalog}><i class="ph ph-arrow-clockwise"></i>Reintentar</button></div>`}
        ${catAll.slice(0, S.libLimit).map(e => html`<button key=${e.key} onClick=${() => openDetail(e.key, 'library')} style=${sx('display:flex;align-items:center;gap:12px;padding:10px 0;border:0;background:transparent;color:var(--color-text);cursor:pointer;text-align:left;border-bottom:1px solid color-mix(in srgb, var(--color-text) 6%, transparent)')}>
          <span style=${sx('width:52px;height:52px;flex:none;border-radius:var(--radius-md);background:var(--color-neutral-100);overflow:hidden;display:grid;place-items:center')}><img src=${e.gifUrl} alt="" loading="lazy" style=${sx('width:100%;height:100%;object-fit:cover')} /></span>
          <span style=${sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}><span style=${sx('font-size:14px;font-weight:500')}>${e.name}</span><span style=${sx('font-size:12px;color:var(--color-neutral-500)')}>${(MU[e.muscle] || e.muscle) + ' · ' + (EQN[e.equipment] || e.equipment)}</span></span>
          <i class="ph ph-caret-right" style=${sx('color:var(--color-neutral-600)')}></i>
        </button>`)}
        ${catAll.length > S.libLimit && html`<button class="btn btn-secondary" onClick=${() => setU({ libLimit: S.libLimit + 40 })} style=${sx('margin-top:12px;height:42px')}>Cargar más · ${nf(catAll.length - S.libLimit, 0)} restantes</button>`}
        ${catalog && !ownIds.length && !catAll.length && html`<div style=${sx('padding:24px 0;font-size:13px;color:var(--color-neutral-500)')}>Sin resultados con estos filtros.</div>`}
      </div>
    </div>`;
  };

  // ════════ DETALLE + 3D ════════
  const renderDetail = () => {
    const id = S.detailId, D = EX[id];
    const weeks = Array.from({ length: 8 }, (_, i) => weekStart(addDays(weekStart(now), -7 * (7 - i))));
    const H = weeks.map(w => weekMax(id, w)), vals = H.filter(v => v != null);
    const hmax = vals.length ? Math.max(...vals) : 0, hmin = vals.length ? Math.min(...vals) * 0.8 : 0;
    const best = maxEver(id);
    const full = S.viewerFull;
    const tabs = [['tec','Técnica'],['err','Errores comunes'],['breath','Respiración']];
    return html`<div ref=${detailRef} class="scroll" style=${sx('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column')}>
      ${BackBar(() => setU({ viewerFull:false, screen: backTo(S.detailFrom) }), D.group, html`<span class="tag tag-accent">${D.level}</span>`)}
      <div style=${sx(full ? 'position:absolute;inset:0;z-index:20;height:auto;flex:none;margin:0;padding:8px 12px 12px;background:var(--color-bg);display:flex;flex-direction:column;gap:8px' : 'position:relative;height:420px;flex:none;margin:0 12px;display:flex;flex-direction:column;gap:8px')}>
        <div style=${sx('position:relative;flex:1;min-height:0;border-radius:var(--radius-lg);background:radial-gradient(ellipse at 50% 80%, var(--color-accent-900), var(--color-bg) 72%);box-shadow:var(--shadow-sm);overflow:hidden')}>
          <gym-mannequin exercise=${D.anim} layer=${S.layer} angles=${S.showAngles ? 'true' : 'false'} path=${S.showPath ? 'true' : 'false'} fault=${String(S.fault)} seek=${S.seek} style=${sx('position:absolute;inset:0;width:100%;height:100%')}></gym-mannequin>
          ${S.fault >= 0 && html`<div style=${sx('position:absolute;left:10px;right:10px;bottom:84px;display:flex;align-items:center;gap:10px;padding:8px 6px 8px 12px;border-radius:var(--radius-md);background:color-mix(in srgb, var(--color-bg) 88%, transparent);border:1px solid #e5826f')}>
            <i class="ph ph-warning" style=${sx('color:#e5826f;font-size:16px')}></i>
            <span style=${sx('flex:1;display:flex;flex-direction:column')}><span style=${sx('font-size:13px;font-weight:500')}>${D.errors[S.fault][0]}</span><span style=${sx('font-size:11px;color:var(--color-neutral-400)')}>La silueta muestra la forma correcta</span></span>
            <button onClick=${() => setU({ fault:-1 })} class="btn btn-icon btn-ghost" style=${sx('width:32px;height:32px')}><i class="ph ph-x"></i></button>
          </div>`}
        </div>
        <div style=${sx('display:flex;gap:6px;align-items:center')}>
          ${[['layer','Músculos','ph ph-person-simple'],['showAngles','Ángulos','ph ph-angle'],['showPath','Trayectoria','ph ph-path']].map(([k, label, icon]) => { const on = k === 'layer' ? S.layer === 'muscles' : S[k], c = chip(on);
            return html`<button key=${k} onClick=${() => setU(k === 'layer' ? { layer: on ? 'normal' : 'muscles' } : { [k]: !on })} style=${sx(`height:34px;padding:0 10px;border-radius:17px;border:1px solid ${c.border};background:${c.bg};color:${c.fg};font-size:13px;cursor:pointer;display:flex;gap:6px;align-items:center`)}><i class=${icon}></i>${label}</button>`; })}
          <span style=${sx('flex:1')}></span>
          <button onClick=${() => setU({ viewerFull: !full })} class="btn btn-icon btn-secondary" style=${sx('width:34px;height:34px;flex:none')}><i class=${full ? 'ph ph-arrows-in' : 'ph ph-arrows-out'}></i></button>
        </div>
      </div>

      <div style=${sx('padding:18px 20px 8px;display:flex;flex-direction:column;gap:10px')}>
        <h3 style=${sx('margin:0')}>${D.name}</h3>
        <div style=${sx('display:flex;flex-wrap:wrap;gap:6px;align-items:center')}>
          ${D.muscles.map(m => html`<span key=${m} class="tag tag-accent" style=${sx('display:flex;gap:5px;align-items:center')}><span style=${sx('width:6px;height:6px;border-radius:50%;background:var(--color-accent-300)')}></span>${m}</span>`)}
          <span class="tag tag-neutral">${D.equip}</span>
        </div>
        <div style=${sx('display:flex;gap:6px;align-items:center;font-size:12px;color:var(--color-neutral-400)')}><i class="ph ph-metronome"></i>Tempo ${D.tempo}</div>
      </div>

      <div style=${sx('display:flex;gap:20px;padding:6px 20px 0;border-bottom:1px solid color-mix(in srgb, var(--color-text) 8%, transparent)')}>
        ${tabs.map(([t, label]) => html`<button key=${t} onClick=${() => setU({ detailTab: t })} style=${sx(`padding:10px 0;border:0;background:transparent;color:${S.detailTab === t ? 'var(--color-text)' : 'var(--color-neutral-500)'};font-size:14px;cursor:pointer;box-shadow:inset 0 -2px 0 ${S.detailTab === t ? 'var(--color-accent)' : 'transparent'}`)}>${label}</button>`)}
      </div>

      <div style=${sx('padding:14px 20px 8px;display:flex;flex-direction:column;gap:8px')}>
        ${S.detailTab === 'tec' && D.cues.map(([t, d], i) => { const open = S.openCue === i;
          return html`<button key=${i} onClick=${() => setU(open ? { openCue: -1 } : { openCue: i, seek: CUET[id][i] + '#' + Date.now() })} style=${sx(`display:flex;gap:12px;padding:12px;border-radius:var(--radius-md);border:1px solid ${open ? 'var(--color-accent-700)' : 'transparent'};background:${open ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))' : 'var(--color-surface)'};color:var(--color-text);text-align:left;cursor:pointer`)}>
            <span style=${sx('width:24px;height:24px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:12px;border:1px solid var(--color-accent);color:var(--color-accent)')}>${i + 1}</span>
            <span style=${sx('display:flex;flex-direction:column;gap:4px')}><span style=${sx('font-size:14px;font-weight:500')}>${t}</span>
              ${open && html`<span style=${sx('font-size:13px;line-height:1.45;color:var(--color-neutral-300)')}>${d}</span><span style=${sx('font-size:11px;color:var(--color-accent-300);display:flex;gap:5px;align-items:center')}><i class="ph ph-cube"></i>Pausado en este momento en el modelo</span>`}</span>
          </button>`; })}
        ${S.detailTab === 'err' && D.errors.map(([t, d], i) => { const on = S.fault === i;
          return html`<div key=${i} style=${sx(`display:flex;gap:12px;padding:12px;border-radius:var(--radius-md);background:var(--color-surface);border:1px solid ${on ? '#e5826f' : 'transparent'}`)}>
            <i class="ph ph-x-circle" style=${sx('font-size:20px;color:#e5826f;flex:none')}></i>
            <span style=${sx('flex:1;display:flex;flex-direction:column;gap:4px')}><span style=${sx('font-size:14px;font-weight:500')}>${t}</span><span style=${sx('font-size:13px;line-height:1.45;color:var(--color-neutral-300)')}>${d}</span>
              <button onClick=${() => { setU({ fault: on ? -1 : i }); const el = detailRef.current; if (el && !on) el.scrollTo({ top: 0, behavior: 'smooth' }); }} style=${sx(`align-self:flex-start;margin-top:4px;height:32px;padding:0 10px;border-radius:var(--radius-md);border:1px solid var(--color-divider);background:${on ? 'color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'transparent'};color:var(--color-accent-200);font-size:12px;cursor:pointer;display:flex;gap:6px;align-items:center`)}><i class="ph ph-cube"></i>${on ? 'Mostrando en 3D' : 'Ver en 3D'}</button></span>
          </div>`; })}
        ${S.detailTab === 'breath' && D.breath.map((b, i) => html`<div key=${i} style=${sx('display:flex;gap:12px;align-items:center;padding:12px;border-radius:var(--radius-md);background:var(--color-surface)')}><i class="ph ph-wind" style=${sx('font-size:18px;color:var(--color-accent-300)')}></i><span style=${sx('font-size:14px')}>${b}</span></div>`)}
      </div>

      <div style=${sx('padding:16px 20px 24px;display:flex;flex-direction:column;gap:12px')}>
        <span style=${sx('font-size:16px;font-weight:500')}>Tu historial</span>
        <div style=${sx('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>${Stat('Mejor serie', best ? fwu(best.w) + ' × ' + best.reps : '—')}${Stat('1RM estimado', best ? fwu(e1rm(best)) : '—')}</div>
        ${vals.length ? html`
          <div style=${sx('display:flex;align-items:flex-end;gap:6px;height:72px')}>${H.map((v, i) => html`<div key=${i} style=${sx(`flex:1;height:${v == null ? 3 : Math.max(6, Math.round((v - hmin) / ((hmax - hmin) || 1) * 100))}${v == null ? 'px' : '%'};border-radius:3px 3px 0 0;background:${v == null ? 'var(--color-neutral-900)' : i === 7 ? 'var(--color-accent)' : 'var(--color-neutral-700)'}`)}></div>`)}</div>
          <div style=${sx('display:flex;justify-content:space-between;font-size:11px;color:var(--color-neutral-500)')}><span>Hace 8 semanas</span><span>Esta semana</span></div>`
        : html`<div style=${sx('font-size:13px;color:var(--color-neutral-500)')}>Registra este ejercicio en una sesión para ver tu progreso semana a semana.</div>`}
        ${S.detailFrom === 'session' && s && html`<button class="btn btn-primary" onClick=${() => setU({ viewerFull:false, screen:'session' })} style=${sx('height:46px;margin-top:6px')}><i class="ph ph-arrow-u-up-left"></i>Volver a la sesión</button>`}
      </div>
    </div>`;
  };

  // ════════ EJERCICIO DEL CATÁLOGO ════════
  const renderGif = () => {
    const Gx = S.gifId ? catMap.current[S.gifId] : null;
    if (!Gx) return html`<div style=${sx('flex:1;display:flex;flex-direction:column')}>${BackBar(() => setU({ screen: backTo(S.gifFrom) }), '', null)}<div style=${sx('padding:20px;font-size:13px;color:var(--color-neutral-400)')}>${catErr ? 'No se pudo cargar el catálogo.' : 'Cargando ejercicio…'}</div></div>`;
    return html`<div style=${sx('flex:1;min-height:0;position:relative;display:flex;flex-direction:column')}>
      <div class="scroll" style=${sx('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column')}>
        ${BackBar(() => setU({ addSheet:false, screen: backTo(S.gifFrom) }), MU[Gx.muscle] || Gx.muscle, html`<span class="tag tag-neutral">${CATN[Gx.category] || Gx.category}</span>`)}
        <div style=${sx('margin:0 12px;border-radius:var(--radius-lg);background:var(--color-neutral-100);aspect-ratio:1/1;display:grid;place-items:center;overflow:hidden;box-shadow:var(--shadow-sm);flex:none')}><img src=${Gx.gifUrl} alt=${Gx.name} style=${sx('width:100%;height:100%;object-fit:contain')} /></div>
        <div style=${sx('padding:18px 20px 8px;display:flex;flex-direction:column;gap:10px')}>
          <h3 style=${sx('margin:0')}>${Gx.name}</h3>
          <div style=${sx('display:flex;flex-wrap:wrap;gap:6px')}>
            <span class="tag tag-accent">${MU[Gx.muscle] || Gx.muscle}</span>
            ${(Gx.secondaryMuscles || []).map(m => html`<span key=${m} class="tag tag-neutral">${MU[m] || m}</span>`)}
            <span class="tag tag-outline">${EQN[Gx.equipment] || Gx.equipment}</span>
          </div>
        </div>
        <div style=${sx('padding:8px 20px;display:flex;flex-direction:column;gap:8px')}>
          <span style=${sx('font-size:16px;font-weight:500')}>Cómo hacerlo</span>
          ${(Gx.instructions || []).map((t, i) => html`<div key=${i} style=${sx('display:flex;gap:12px;padding:10px 12px;border-radius:var(--radius-md);background:var(--color-surface)')}><span style=${sx('width:22px;height:22px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:11px;border:1px solid var(--color-accent);color:var(--color-accent-300)')}>${i + 1}</span><span style=${sx('font-size:13px;line-height:1.45;color:var(--color-neutral-200)')}>${t}</span></div>`)}
          <span style=${sx('font-size:11px;color:var(--color-neutral-500);display:flex;gap:6px;align-items:center;padding-top:4px')}><i class="ph ph-info"></i>Animación de ExerciseGymGifsDB · sin modelo 3D</span>
        </div>
        <div style=${sx('padding:12px 20px 24px;display:flex;gap:8px')}>
          ${S.gifFrom === 'session' && s && html`<button class="btn btn-secondary" onClick=${() => setU({ screen:'session' })} style=${sx('flex:1;height:46px')}>Volver a la sesión</button>`}
          <button class="btn btn-primary" onClick=${() => setU({ addSheet:true })} style=${sx('flex:1;height:46px')}><i class="ph ph-plus"></i>Añadir a rutina</button>
        </div>
      </div>
      ${S.addSheet && Sheet('Añadir a rutina', html`<button class="btn btn-ghost" onClick=${() => setU({ addSheet:false })}>Cancelar</button>`, html`<div style=${sx('display:flex;flex-direction:column')}>
        ${!data.routines.length && html`<span style=${sx('font-size:13px;color:var(--color-neutral-500);padding:8px 0')}>Primero crea una rutina.</span>`}
        ${data.routines.map(r => { const has = r.items.some(it => it.exId === Gx.key);
          return html`<button key=${r.id} onClick=${() => { if (has) return; upd(d => ({ names: { ...d.names, [Gx.key]: Gx.name }, routines: d.routines.map(x => x.id === r.id ? { ...x, items: [...x.items, { exId: Gx.key, sets: 3, reps: 10 }] } : x) })); setU({ addSheet:false }); toast('Añadido a ' + r.name + ' · 3×10'); }} style=${sx('display:flex;align-items:center;gap:12px;padding:10px 4px;min-height:52px;border:0;background:transparent;color:var(--color-text);cursor:pointer;text-align:left')}>
            <span style=${sx('width:40px;height:40px;border-radius:var(--radius-md);background:var(--color-accent-900);display:grid;place-items:center;color:var(--color-accent-300)')}><i class="ph ph-list-checks" style=${sx('font-size:20px')}></i></span>
            <span style=${sx('flex:1;display:flex;flex-direction:column')}><span style=${sx('font-size:15px')}>${r.name}</span><span style=${sx('font-size:12px;color:var(--color-neutral-500)')}>${has ? 'Ya incluido' : r.items.length + ' ejercicios'}</span></span>
            <i class=${has ? 'ph ph-check' : 'ph ph-plus'} style=${sx('color:var(--color-accent-300);font-size:18px')}></i>
          </button>`; })}
      </div>`)}
    </div>`;
  };

  // ════════ SESIÓN EN VIVO ════════
  const renderSession = () => {
    if (!s) return null;
    const logMode = data.logMode;
    const totalSets = s.ex.reduce((n, e) => n + e.sets.length, 0), doneSets = s.ex.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0);
    const ce = s.ex[s.cur];
    const prevTxt = ce.prev ? fw(ce.prev.w) + ' × ' + ce.prev.reps : '—';
    const addSet = () => updSes(x => ({ ...x, ex: x.ex.map((e, k) => k !== x.cur ? e : { ...e, sets: [...e.sets, { ...e.sets[e.sets.length - 1], done:false, wStr:null }] }) }));
    const removeSet = i => updSes(x => ({ ...x, ex: x.ex.map((e, k) => k !== x.cur || e.sets.length <= 1 ? e : { ...e, sets: e.sets.filter((_, j) => j !== i) }) }));
    const fi = ce.sets.findIndex(x => !x.done);
    const step = units === 'kg' ? 2.5 : 5 / LB;
    const round = (w, r) => html`<button onClick=${w} style=${sx('width:56px;height:56px;border-radius:50%;border:1px solid var(--color-divider);background:transparent;color:var(--color-text);font-size:22px;cursor:pointer;display:grid;place-items:center')}><i class=${'ph ' + r}></i></button>`;
    return html`<div style=${sx('flex:1;min-height:0;display:flex;flex-direction:column')}>
      <div style=${sx('display:flex;align-items:center;gap:8px;padding:8px 12px 4px')}>
        <button class="btn btn-icon btn-secondary" onClick=${go('home')} style=${sx('border:0')} aria-label="Minimizar"><i class="ph ph-caret-down" style=${sx('font-size:20px')}></i></button>
        <span style=${sx('flex:1;display:flex;flex-direction:column')}><span style=${sx('font-size:16px;font-weight:500')}>${s.name}</span><span style=${sx('font-size:12px;color:var(--color-neutral-400)')}>${doneSets} de ${totalSets} series</span></span>
        <button class="btn btn-primary" onClick=${finishSession}>Terminar</button>
      </div>

      <div style=${sx('margin:8px 16px 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-radius:var(--radius-md);background:var(--color-surface);padding:10px 0')}>
        <div style=${sx('display:flex;flex-direction:column;align-items:center;gap:2px')}><span style=${sx('font-size:20px;font-weight:500;font-variant-numeric:tabular-nums')}>${clock(ses.elapsed)}</span><span style=${sx('font-size:11px;color:var(--color-neutral-400)')}>Duración</span></div>
        <div style=${sx('display:flex;flex-direction:column;align-items:center;gap:2px;border-left:1px solid var(--color-divider);border-right:1px solid var(--color-divider)')}><span style=${sx('font-size:20px;font-weight:500;display:flex;gap:4px;align-items:center;font-variant-numeric:tabular-nums')}><i class="ph-fill ph-barbell" style=${sx('font-size:14px;color:var(--color-accent)')}></i>${fvol(s.ex.reduce((n, e) => n + e.sets.filter(x => x.done).reduce((m, x) => m + x.w * x.reps, 0), 0))}</span><span style=${sx('font-size:11px;color:var(--color-neutral-400)')}>Volumen</span></div>
        <div style=${sx('display:flex;flex-direction:column;align-items:center;gap:2px')}><span style=${sx('font-size:20px;font-weight:500;display:flex;gap:4px;align-items:center;font-variant-numeric:tabular-nums')}><i class="ph-fill ph-fire" style=${sx('font-size:14px;color:var(--color-accent)')}></i>${ses.kcal}</span><span style=${sx('font-size:11px;color:var(--color-neutral-400)')}>kcal est.</span></div>
      </div>

      ${ses.rest > 0 && html`<div style=${sx('margin:8px 16px 0;padding:10px 12px;border-radius:var(--radius-md);border:1px solid var(--color-accent);display:flex;align-items:center;gap:10px;position:relative;overflow:hidden')}>
        <div style=${sx(`position:absolute;left:0;bottom:0;height:2px;width:${Math.round(ses.rest / s.restMax * 100)}%;background:var(--color-accent)`)}></div>
        <i class="ph ph-hourglass-medium" style=${sx('color:var(--color-accent)')}></i>
        <span style=${sx('flex:1;font-size:14px')}>Descanso <span style=${sx('font-variant-numeric:tabular-nums;font-weight:500')}>${clock(ses.rest)}</span></span>
        <button class="btn btn-ghost" onClick=${() => updSes(x => { const rem = Math.max(0, x.restEnd - Date.now()) + 15000; return { ...x, restEnd: Date.now() + rem, restMax: Math.max(x.restMax, rem / 1000) }; })}>+15 s</button>
        <button class="btn btn-ghost" onClick=${() => updSes(x => ({ ...x, restEnd: 0 }))}>Saltar</button>
      </div>`}

      <div class="scroll" style=${scrollCol('12px 16px 20px', '14px')}>
        <div class="scroll" style=${sx('display:flex;gap:6px;overflow-x:auto;margin:0 -16px;padding:0 16px;flex:none')}>
          ${s.ex.map((e, i) => { const c = chip(i === s.cur); return html`<button key=${i} onClick=${() => updSes(x => ({ ...x, cur: i }))} style=${sx(`flex:none;display:flex;gap:6px;align-items:center;height:34px;padding:0 12px;border-radius:17px;border:1px solid ${c.border};background:${c.bg};color:${c.fg};font-size:13px;cursor:pointer`)}><span>${info(e.exId).short}</span><span style=${sx('font-size:11px;opacity:.75')}>${e.sets.filter(x => x.done).length}/${e.sets.length}</span></button>`; })}
        </div>

        <div style=${sx('display:flex;align-items:center;gap:10px')}>
          <span style=${sx('flex:1;font-size:20px;font-weight:500;letter-spacing:-.01em')}>${info(ce.exId).name}</span>
          <button class="btn btn-secondary" onClick=${() => openDetail(ce.exId, 'session')} style=${sx('height:34px;font-size:13px;flex:none')}><i class="ph ph-cube"></i>${EX[ce.exId] ? 'Técnica 3D' : 'Ver técnica'}</button>
        </div>

        <div style=${sx('display:flex;align-items:center;justify-content:space-between')}>
          <div style=${sx('display:flex;border:1px solid var(--color-divider);border-radius:var(--radius-md);overflow:hidden')}>
            ${[['tabla','Tabla','ph ph-table'],['enfocado','Enfocado','ph ph-target']].map(([m, label, icon]) => { const c = seg(logMode === m); return html`<button key=${m} onClick=${() => upd({ logMode: m })} style=${sx(`border:0;background:${c.bg};color:${c.fg};font-size:12px;padding:6px 12px;cursor:pointer;display:flex;gap:5px;align-items:center`)}><i class=${icon}></i>${label}</button>`; })}
          </div>
          ${UnitSeg()}
        </div>

        ${logMode === 'tabla' ? html`<div style=${sx('display:flex;flex-direction:column')}>
          <div style=${sx('display:grid;grid-template-columns:36px minmax(0,1fr) 72px 56px 40px;gap:8px;padding:0 6px 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--color-neutral-500)')}><span>Serie</span><span>Anterior</span><span style=${sx('text-align:center')}>${units}</span><span style=${sx('text-align:center')}>Reps</span><span></span></div>
          ${ce.sets.map((st, i) => html`<div key=${i} style=${sx(`display:grid;grid-template-columns:36px minmax(0,1fr) 72px 56px 40px;gap:8px;align-items:center;padding:6px;border-radius:var(--radius-md);background:${st.done ? 'color-mix(in srgb, var(--color-accent) 9%, transparent)' : 'transparent'}`)}>
            <button onClick=${() => { if (ce.sets.length > 1 && confirm('¿Quitar la serie ' + (i + 1) + '?')) removeSet(i); }} style=${sx(`font-size:14px;font-weight:500;color:${st.done ? 'var(--color-accent-300)' : 'var(--color-text)'};background:transparent;border:0;padding:0;text-align:left;cursor:pointer`)}>${i + 1}</button>
            <span style=${sx('font-size:13px;color:var(--color-neutral-500)')}>${prevTxt}</span>
            <input class="input" inputmode="decimal" value=${st.wStr ?? fw(st.w)} onChange=${e => { const v = e.target.value, w = parseW(v); updSet(i, w == null ? { wStr: v } : { wStr: v, w }); }} style=${sx('text-align:center;min-height:38px;padding:4px')} />
            <input class="input" inputmode="numeric" value=${String(st.reps)} onChange=${e => { const v = parseInt(e.target.value, 10); updSet(i, { reps: isNaN(v) ? 0 : v }); }} style=${sx('text-align:center;min-height:38px;padding:4px')} />
            <button onClick=${() => toggleSet(i)} aria-label="Completar serie" style=${sx(`width:40px;height:40px;border-radius:var(--radius-md);border:1px solid ${st.done ? 'var(--color-accent)' : 'var(--color-divider)'};background:${st.done ? 'var(--color-accent)' : 'transparent'};color:${st.done ? 'var(--color-bg)' : 'var(--color-neutral-600)'};display:grid;place-items:center;cursor:pointer`)}><i class="ph-bold ph-check"></i></button>
          </div>`)}
          <button class="btn btn-ghost" onClick=${addSet} style=${sx('align-self:flex-start;margin-top:6px')}><i class="ph ph-plus"></i>Añadir serie</button>
        </div>`
        : fi >= 0 ? (() => { const fs = ce.sets[fi]; return html`<div style=${sx('display:flex;flex-direction:column;gap:16px;padding:16px;border-radius:var(--radius-lg);background:linear-gradient(170deg, var(--color-surface), var(--color-bg));box-shadow:var(--shadow-sm)')}>
            <div style=${sx('display:flex;justify-content:space-between;font-size:12px;color:var(--color-neutral-400)')}><span style=${sx('color:var(--color-accent-300)')}>Serie ${fi + 1} de ${ce.sets.length}</span><span>Anterior: ${prevTxt}</span></div>
            <div style=${sx('display:grid;grid-template-columns:56px 1fr 56px;align-items:center')}>
              ${round(() => updSet(fi, { w: Math.max(0, fs.w - step), wStr:null }), 'ph-minus')}
              <div style=${sx('text-align:center')}><div style=${sx('font-size:60px;font-weight:500;line-height:1;letter-spacing:-.04em;font-variant-numeric:tabular-nums')}>${fw(fs.w)}</div><div style=${sx('font-size:13px;color:var(--color-neutral-400);margin-top:4px')}>${units}</div></div>
              ${round(() => updSet(fi, { w: fs.w + step, wStr:null }), 'ph-plus')}
            </div>
            <div style=${sx('display:grid;grid-template-columns:56px 1fr 56px;align-items:center')}>
              ${round(() => updSet(fi, { reps: Math.max(1, fs.reps - 1) }), 'ph-minus')}
              <div style=${sx('text-align:center')}><div style=${sx('font-size:44px;font-weight:500;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums')}>${fs.reps}</div><div style=${sx('font-size:13px;color:var(--color-neutral-400);margin-top:4px')}>repeticiones</div></div>
              ${round(() => updSet(fi, { reps: fs.reps + 1 }), 'ph-plus')}
            </div>
            <button class="btn btn-primary" onClick=${() => toggleSet(fi)} style=${sx('height:54px;font-size:16px')}><i class="ph-bold ph-check"></i>Completar serie</button>
            <div style=${sx('display:flex;gap:6px;justify-content:center')}>${ce.sets.map((x, j) => html`<span key=${j} style=${sx(`width:28px;height:4px;border-radius:2px;background:${x.done ? 'var(--color-accent)' : (j === fi ? 'var(--color-accent-700)' : 'var(--color-neutral-800)')}`)}></span>`)}</div>
          </div>`; })()
        : html`<div style=${sx('display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:18px;border-radius:var(--radius-lg);background:var(--color-surface)')}>
            <i class="ph ph-check-circle" style=${sx('font-size:28px;color:var(--color-accent)')}></i>
            <span style=${sx('font-size:17px;font-weight:500')}>Ejercicio completado</span>
            <span style=${sx('font-size:13px;color:var(--color-neutral-400)')}>${ce.sets.length} series · ${fvol(ce.sets.reduce((n, x) => n + x.w * x.reps, 0))} de volumen</span>
            <div style=${sx('display:flex;gap:8px')}>
              <button class="btn btn-secondary" onClick=${addSet}>Otra serie</button>
              ${s.cur < s.ex.length - 1 && html`<button class="btn btn-primary" onClick=${() => updSes(x => ({ ...x, cur: x.cur + 1 }))}>Siguiente ejercicio<i class="ph ph-arrow-right"></i></button>`}
            </div>
          </div>`}

        <div style=${sx('display:flex;flex-direction:column;gap:8px;margin-top:6px')}>
          <div style=${sx('display:flex;align-items:center;gap:6px;font-size:14px;font-weight:500')}><i class="ph ph-note-pencil" style=${sx('color:var(--color-accent)')}></i>Notas de la sesión</div>
          <textarea class="input" value=${s.notes} onChange=${e => { const v = e.target.value; updSes(x => ({ ...x, notes: v })); }} placeholder="¿Cómo te sentiste? Molestias, ajustes para la próxima…" style=${sx('min-height:84px;font-size:14px;line-height:1.45')}></textarea>
          <div style=${sx('display:flex;flex-wrap:wrap;gap:6px')}>
            ${TAGS.map(t => { const on = s.tags.includes(t), c = chip(on); return html`<button key=${t} onClick=${() => updSes(x => ({ ...x, tags: on ? x.tags.filter(y => y !== t) : [...x.tags, t] }))} style=${sx(`height:30px;padding:0 10px;border-radius:15px;border:1px solid ${c.border};background:${c.bg};color:${c.fg};font-size:12px;cursor:pointer`)}>${t}</button>`; })}
          </div>
        </div>
        <button class="btn btn-ghost" onClick=${discardSession} style=${sx('align-self:center;color:var(--color-neutral-500);margin-top:8px')}><i class="ph ph-trash"></i>Descartar sesión</button>
      </div>
    </div>`;
  };

  // ════════ RESUMEN ════════
  const renderSummary = () => {
    const sm = data.summary; if (!sm) return null;
    const updSum = p => upd(d => ({ summary: { ...d.summary, ...p } }));
    const save = () => {
      upd(d => ({ history: [{ id: 'h' + Date.now(), name: sm.name, date: sm.start, elapsed: sm.elapsed, kcal: sm.kcal, vol: Math.round(sm.vol), notes: sm.notes, tags: sm.tags, ex: sm.ex }, ...d.history], summary: null }));
      setU({ screen:'home' }); toast('Sesión guardada');
    };
    const discard = () => { if (!confirm('¿Descartar esta sesión sin guardarla?')) return; upd({ summary: null }); setU({ screen:'home' }); };
    return html`<div class="scroll" style=${scrollCol('24px 20px', '20px')}>
      <div style=${sx('display:flex;flex-direction:column;gap:6px')}>
        <span style=${sx('font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--color-accent)')}>Sesión completada</span>
        <h2 style=${sx('margin:0')}>${sm.name}</h2>
        <span style=${sx('font-size:13px;color:var(--color-neutral-400)')}>${fmtShort(sm.start)} · ${durTxt(sm.elapsed)}</span>
      </div>
      <div style=${sx('padding:18px;border-radius:var(--radius-lg);background:linear-gradient(160deg, var(--color-accent-900), var(--color-surface) 75%);box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:6px')}>
        <span style=${sx('font-size:12px;color:var(--color-neutral-300);display:flex;gap:6px;align-items:center')}><i class="ph-fill ph-fire" style=${sx('color:var(--color-accent)')}></i>Calorías estimadas</span>
        <span style=${sx('font-size:52px;font-weight:500;line-height:1;letter-spacing:-.04em')}>${sm.kcal}<span style=${sx('font-size:18px;color:var(--color-neutral-400);letter-spacing:0')}> kcal</span></span>
        <span style=${sx('font-size:12px;line-height:1.45;color:var(--color-neutral-400)')}>Estimado con el gasto metabólico (MET ${nf(sm.met || 5)}) de tus ejercicios, tu peso (${fwu(kg)}) y la duración. Es una aproximación (±20%).</span>
      </div>
      <div style=${sx('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px')}>${Stat('Volumen', fvol(sm.vol))}${Stat('Series', sm.sets)}${Stat('Duración', durTxt(sm.elapsed))}</div>
      <div style=${sx('display:flex;flex-direction:column;gap:8px')}>
        <span style=${sx('font-size:15px;font-weight:500')}>Por ejercicio</span>
        ${!sm.rows.length && html`<span style=${sx('font-size:13px;color:var(--color-neutral-500)')}>No se completó ninguna serie.</span>`}
        ${sm.rows.map((r, i) => html`<div key=${i} style=${sx('display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid color-mix(in srgb, var(--color-text) 6%, transparent)')}>
          <span style=${sx('flex:1;font-size:14px')}>${info(r.exId).name}</span>
          ${r.pr && html`<span class="tag tag-outline" style=${sx('display:flex;gap:4px;align-items:center')}><i class="ph ph-trophy"></i>Récord</span>`}
          <span style=${sx('font-size:13px;color:var(--color-neutral-400)')}>${fwu(r.top)} × ${r.reps}</span>
        </div>`)}
      </div>
      <div class="field"><label>Notas de la sesión</label><textarea class="input" value=${sm.notes} onChange=${e => updSum({ notes: e.target.value })} placeholder="Añade una nota para recordarla la próxima vez" style=${sx('font-size:14px;line-height:1.45')}></textarea></div>
      <div style=${sx('display:flex;flex-wrap:wrap;gap:6px;margin-top:-10px')}>
        ${TAGS.map(t => { const on = sm.tags.includes(t), c = chip(on); return html`<button key=${t} onClick=${() => updSum({ tags: on ? sm.tags.filter(y => y !== t) : [...sm.tags, t] })} style=${sx(`height:30px;padding:0 10px;border-radius:15px;border:1px solid ${c.border};background:${c.bg};color:${c.fg};font-size:12px;cursor:pointer`)}>${t}</button>`; })}
      </div>
      <button class="btn btn-primary" onClick=${save} style=${sx('height:48px;font-size:15px')}>Guardar sesión</button>
      <button class="btn btn-ghost" onClick=${discard} style=${sx('align-self:center;color:var(--color-neutral-500);margin-top:-8px')}>Descartar</button>
    </div>`;
  };

  // ════════ PROGRESO ════════
  const renderProgress = () => {
    const metric = S.progMetric, ws0 = weekStart(now);
    const weeks = Array.from({ length: 9 }, (_, i) => weekStart(addDays(ws0, -7 * (8 - i))));
    const per = weeks.map(w => { const hs = hist.filter(h => h.date >= w && h.date < addDays(w, 7)); return { vol: hs.reduce((n, h) => n + h.vol, 0), kcal: hs.reduce((n, h) => n + h.kcal, 0), ses: hs.length }; });
    const arr = per.map(p => p[metric]);
    const amax = Math.max(1, ...arr);
    const fmtM = v => metric === 'vol' ? nf((units === 'kg' ? v : v*LB) / 1000) : nf(v, 0);
    const suffix = metric === 'vol' ? (units === 'kg' ? ' t' : 'k lb') : metric === 'kcal' ? ' kcal' : (arr[8] === 1 ? ' sesión' : ' sesiones');
    const cur = arr[8], prev = arr[7];
    const delta = prev > 0 ? Math.round((cur - prev) / prev * 100) : null;

    const logged = loggedIds();
    const exChoices = logged.length ? logged : ORDER;
    const pe = S.progEx && exChoices.includes(S.progEx) ? S.progEx : exChoices[0];
    const lw = weeks.slice(1);
    const pts = lw.map((w, i) => ({ i, v: weekMax(pe, w) })).filter(p => p.v != null);
    const lmin = pts.length ? Math.min(...pts.map(p => p.v)) : 0, lmax = pts.length ? Math.max(...pts.map(p => p.v)) : 0, rng = (lmax - lmin) || 1;
    const P = pts.map(p => ({ x: 16 + p.i * (308 / 7), y: pts.length > 1 ? 100 - (p.v - lmin) / rng * 80 : 60 }));
    const lDelta = pts.length > 1 ? pts[pts.length - 1].v - pts[0].v : 0;
    const prs = logged.map(id => ({ id, m: maxEver(id) })).filter(x => x.m);

    return html`<div class="scroll" style=${scrollCol('12px 20px 24px', '22px')}>
      <div style=${sx('display:flex;justify-content:space-between;align-items:center')}><h3 style=${sx('margin:0')}>Progreso</h3>${UnitSeg()}</div>

      <div style=${sx('display:flex;flex-direction:column;gap:14px')}>
        <div style=${sx('display:flex;border:1px solid var(--color-divider);border-radius:var(--radius-md);overflow:hidden;align-self:flex-start')}>
          ${[['vol','Volumen'],['kcal','Calorías'],['ses','Sesiones']].map(([m, label]) => { const c = seg(metric === m); return html`<button key=${m} onClick=${() => setU({ progMetric: m })} style=${sx(`border:0;background:${c.bg};color:${c.fg};font-size:13px;padding:7px 12px;cursor:pointer`)}>${label}</button>`; })}
        </div>
        <div style=${sx('display:flex;align-items:baseline;gap:10px;flex-wrap:wrap')}><span style=${sx('font-size:32px;font-weight:500;letter-spacing:-.03em')}>${fmtM(cur)}${suffix}</span><span style=${sx('font-size:13px;color:var(--color-accent-300)')}>${delta == null ? (prev === 0 && cur > 0 ? 'primera semana con datos' : '') : (delta >= 0 ? '+' : '') + delta + '% vs semana anterior'}</span></div>
        <span style=${sx('font-size:12px;color:var(--color-neutral-500);margin-top:-10px')}>Semana del ${fmtDM(ws0)} (en curso)</span>
        <div style=${sx('display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:6px;align-items:end;height:150px')}>
          ${arr.map((v, i) => { const curW = i === 8; return html`<div key=${i} style=${sx('display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;height:100%')}>
            <span style=${sx(`font-size:10px;color:${curW ? 'var(--color-accent-300)' : 'var(--color-neutral-500)'}`)}>${v ? fmtM(v) : ''}</span>
            <div style=${sx(`width:100%;height:${v ? Math.max(4, Math.round(v / amax * 100)) : 2}%;border-radius:4px 4px 0 0;background:${curW ? 'var(--color-accent)' : 'var(--color-neutral-800)'}`)}></div>
          </div>`; })}
        </div>
        <div style=${sx('display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:6px;margin-top:-8px')}>${weeks.map((w, i) => html`<span key=${i} style=${sx('font-size:10px;text-align:center;color:var(--color-neutral-500);white-space:nowrap;overflow:hidden')}>${fmtDM(w)}</span>`)}</div>
        ${!hist.length && html`<span style=${sx('font-size:13px;color:var(--color-neutral-500)')}>Completa y guarda sesiones para ver tu evolución semana a semana.</span>`}
      </div>

      <div style=${sx('display:flex;flex-direction:column;gap:12px')}>
        <span style=${sx('font-size:16px;font-weight:500')}>Peso máximo por ejercicio</span>
        <div class="scroll" style=${sx('display:flex;gap:6px;overflow-x:auto;margin:0 -20px;padding:0 20px')}>
          ${exChoices.map(id => { const c = chip(pe === id); return html`<button key=${id} onClick=${() => setU({ progEx: id })} style=${sx(`flex:none;height:32px;padding:0 12px;border-radius:16px;border:1px solid ${c.border};background:${c.bg};color:${c.fg};font-size:13px;cursor:pointer`)}>${info(id).short}</button>`; })}
        </div>
        <div style=${sx('padding:14px 12px 8px;border-radius:var(--radius-md);background:var(--color-surface)')}>
          ${pts.length ? html`
            <div style=${sx('display:flex;justify-content:space-between;align-items:baseline;padding:0 4px')}><span style=${sx('font-size:22px;font-weight:500')}>${fwu(pts[pts.length - 1].v)}</span><span style=${sx('font-size:12px;color:var(--color-accent-300)')}>${pts.length > 1 ? (lDelta >= 0 ? '+' : '') + fw(lDelta) + ' ' + units + ' en ' + (pts[pts.length - 1].i - pts[0].i) + ' semanas' : 'Primer registro'}</span></div>
            <svg viewBox="0 0 340 130" style=${sx('width:100%;height:auto;display:block;margin-top:6px')}>
              <line x1="12" y1="112" x2="328" y2="112" stroke="var(--color-divider)" stroke-width="1"></line>
              ${P.length > 1 && html`<path d=${'M' + P.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' L') + ' L' + P[P.length - 1].x.toFixed(1) + ' 112 L' + P[0].x.toFixed(1) + ' 112 Z'} fill="var(--color-accent-900)" opacity=".8"></path>
              <polyline points=${P.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ')} fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>`}
              ${P.map((p, i) => html`<circle key=${i} cx=${p.x.toFixed(1)} cy=${p.y.toFixed(1)} r=${i === P.length - 1 ? 5 : 3} fill="var(--color-bg)" stroke="var(--color-accent)" stroke-width="2"></circle>`)}
            </svg>
            <div style=${sx('display:flex;justify-content:space-between;padding:0 4px;font-size:10px;color:var(--color-neutral-500)')}><span>${fmtDM(lw[0])}</span><span>${fmtDM(lw[7])}</span></div>`
          : html`<div style=${sx('padding:20px 4px;font-size:13px;color:var(--color-neutral-500)')}>Sin registros de ${info(pe).name} en las últimas 8 semanas.</div>`}
        </div>
      </div>

      <div style=${sx('display:flex;flex-direction:column;gap:4px')}>
        <span style=${sx('font-size:16px;font-weight:500;margin-bottom:6px')}>Récords personales</span>
        ${!prs.length && html`<span style=${sx('font-size:13px;color:var(--color-neutral-500)')}>Tus mejores series aparecerán aquí.</span>`}
        ${prs.map(({ id, m }) => html`<button key=${id} onClick=${() => openDetail(id, 'progress')} style=${sx('display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:10px 0;border:0;border-bottom:1px solid color-mix(in srgb, var(--color-text) 6%, transparent);background:transparent;color:var(--color-text);text-align:left;cursor:pointer')}>
          <span style=${sx('font-size:14px')}>${info(id).name}</span><span style=${sx('font-size:14px;font-weight:500')}>${fwu(m.w)} × ${m.reps}</span><span style=${sx('font-size:12px;color:var(--color-neutral-500);width:84px;text-align:right')}>1RM ≈ ${fwu(e1rm(m))}</span>
        </button>`)}
      </div>

      ${hist.length > 0 && html`<div style=${sx('display:flex;flex-direction:column;gap:8px')}>
        <span style=${sx('font-size:16px;font-weight:500')}>Todas las sesiones</span>
        ${hist.map(h => html`<button key=${h.id} onClick=${() => setU({ screen:'hist', histId:h.id, histFrom:'progress' })} style=${sx('display:flex;justify-content:space-between;gap:10px;padding:10px 0;border:0;border-bottom:1px solid color-mix(in srgb, var(--color-text) 6%, transparent);background:transparent;color:var(--color-text);text-align:left;cursor:pointer;font-size:14px')}>
          <span>${h.name}</span><span style=${sx('color:var(--color-neutral-500);font-size:12px')}>${fmtShort(h.date)} · ${h.kcal} kcal</span></button>`)}
      </div>`}
    </div>`;
  };

  // ════════ PERFIL ════════
  const renderProfile = () => {
    const p = S.profile;
    const setP = patch => setU(u => ({ profile: { ...u.profile, ...patch } }));
    const save = () => {
      const w = parseW(p.kgStr), age = parseInt(p.age, 10);
      const pr = { name: (p.name || '').trim(), kg: w && w > 20 ? w : data.profile.kg, age: age > 5 ? age : data.profile.age };
      if (JSON.stringify(pr) !== JSON.stringify(data.profile)) upd({ profile: pr });
      const code = (p.code || '').trim();
      if (code !== (syncCfg().code || '')) { saveSyncCode(code); lastSynced.current = null; setTimeout(doSync, 0); }
      setU({ profile: null }); toast('Guardado');
    };
    const wipe = () => { if (!confirm('¿Borrar TODOS tus datos (rutinas, sesiones y perfil)' + (syncCfg().code ? ' en todos tus dispositivos' : '') + '? No se puede deshacer.')) return; upd({ ...DEFAULT }); setU({ profile: null, screen: 'home' }); };
    const st = sync.status === 'ok' ? 'Sincronizado ' + agoTxt(sync.at) : sync.status === 'syncing' ? 'Sincronizando…' : sync.status === 'error' ? 'No se pudo sincronizar: ' + sync.msg : 'Sin sincronizar';
    return Sheet('Tu perfil', html`<button class="btn btn-primary" onClick=${save}>Guardar</button>`, html`
      <div class="field"><label>Nombre</label><input class="input" value=${p.name} onChange=${e => setP({ name: e.target.value })} placeholder="¿Cómo te llamas?" /></div>
      <div style=${sx('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
        <div class="field"><label>Peso corporal (${units})</label><input class="input" inputmode="decimal" value=${p.kgStr} onChange=${e => setP({ kgStr: e.target.value })} /></div>
        <div class="field"><label>Edad</label><input class="input" inputmode="numeric" value=${String(p.age)} onChange=${e => setP({ age: e.target.value })} /></div>
      </div>
      <span style=${sx('font-size:12px;color:var(--color-neutral-500)')}>Tu peso se usa para estimar las calorías quemadas en cada sesión.</span>
      <div class="field"><label>Código de sincronización</label><input class="input" value=${p.code} onChange=${e => setP({ code: e.target.value })} placeholder="Pega aquí tu código" autocomplete="off" spellcheck="false" style=${sx('font-family:ui-monospace,monospace')} /></div>
      <div style=${sx('display:flex;align-items:center;gap:8px;font-size:12px;color:' + (sync.status === 'error' ? '#e5826f' : 'var(--color-neutral-400)'))}>
        <i class=${sync.status === 'error' ? 'ph ph-cloud-warning' : 'ph ph-cloud-check'}></i><span style=${sx('flex:1')}>${st}</span>
        ${syncCfg().code && html`<button class="btn btn-ghost" onClick=${doSync} style=${sx('font-size:12px')}>Sincronizar ahora</button>`}
      </div>
      <button class="btn btn-ghost" onClick=${() => setU({ profile: null })} style=${sx('align-self:flex-start')}>Cancelar</button>
      <button class="btn btn-danger" onClick=${wipe} style=${sx('height:40px')}><i class="ph ph-trash"></i>Borrar todos los datos</button>`);
  };

  // ════════ ESTRUCTURA ════════
  const scr = S.screen;
  const navActive = scr === 'detail' ? S.detailFrom : scr === 'gif' ? S.gifFrom : scr === 'editor' ? 'routines' : scr === 'hist' ? S.histFrom : scr;
  const navScreens = ['home','routines','library','progress'];
  const showNav = navScreens.includes(scr) || (scr === 'detail' && S.detailFrom !== 'session') || (scr === 'gif' && S.gifFrom !== 'session') || scr === 'hist';
  const body = scr === 'home' ? renderHome() : scr === 'routines' ? renderRoutines() : scr === 'editor' ? renderEditor() : scr === 'library' ? renderLibrary()
    : scr === 'detail' ? renderDetail() : scr === 'gif' ? renderGif() : scr === 'session' ? (renderSession() || renderHome()) : scr === 'summary' ? (renderSummary() || renderHome())
    : scr === 'progress' ? renderProgress() : scr === 'hist' ? (renderHist() || renderHome()) : renderHome();
  const t = new Date(now);

  return html`<div class="stage"><div class="phone">
    <div class="statusbar"><span>${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}</span><span style=${sx('position:absolute;left:50%;top:10px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:var(--color-neutral-900)')}></span><div style=${sx('display:flex;gap:6px;align-items:center;font-size:14px')}><i class="ph-fill ph-cell-signal-full"></i><i class="ph-fill ph-wifi-high"></i><i class="ph-fill ph-battery-high"></i></div></div>
    <div style=${sx('flex:1;min-height:0;position:relative;display:flex;flex-direction:column')}>
      <${React.Fragment} key=${scr}>${body}<//>
      ${S.profile && renderProfile()}
      ${S.toast && html`<div style=${sx('position:absolute;left:16px;right:16px;bottom:16px;z-index:40;padding:12px 14px;border-radius:var(--radius-md);background:var(--color-surface);border:1px solid var(--color-accent);box-shadow:var(--shadow-md);display:flex;gap:8px;align-items:center;font-size:14px')}><i class="ph ph-check-circle" style=${sx('color:var(--color-accent)')}></i>${S.toast}</div>`}
    </div>
    ${s && scr !== 'session' && showNav && html`<button onClick=${go('session')} style=${sx('flex:none;margin:0 12px 8px;display:flex;align-items:center;gap:10px;height:44px;padding:0 14px;border-radius:var(--radius-md);border:1px solid var(--color-accent);background:var(--color-surface);color:var(--color-text);cursor:pointer;font-size:13px')}>
      <span style=${sx('width:7px;height:7px;border-radius:50%;background:var(--color-accent);box-shadow:0 0 8px var(--color-accent)')}></span><span style=${sx('flex:1;text-align:left')}>${s.name} · ${clock(ses.elapsed)}${ses.rest > 0 ? ' · descanso ' + clock(ses.rest) : ''}</span><span style=${sx('color:var(--color-accent)')}>Volver</span>
    </button>`}
    ${showNav && html`<div style=${sx('flex:none;height:66px;display:grid;grid-template-columns:repeat(4,1fr);background:var(--color-surface);border-top:1px solid color-mix(in srgb, var(--color-text) 6%, transparent)')}>
      ${[['home','Inicio','ph-house'],['routines','Rutinas','ph-list-checks'],['library','Ejercicios','ph-barbell'],['progress','Progreso','ph-chart-line-up']].map(([k, label, ic]) => { const on = navActive === k;
        return html`<button key=${k} onClick=${go(k)} style=${sx(`border:0;background:transparent;color:${on ? 'var(--color-accent-200)' : 'var(--color-neutral-400)'};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;font-size:11px`)}>
          <span style=${sx(`width:56px;height:28px;border-radius:14px;display:grid;place-items:center;background:${on ? 'var(--color-accent-800)' : 'transparent'}`)}><i class=${(on ? 'ph-fill ' : 'ph ') + ic} style=${sx('font-size:20px')}></i></span>${label}
        </button>`; })}
    </div>`}
    <div class="gesture" style=${sx(`background:${showNav ? 'var(--color-surface)' : 'var(--color-bg)'}`)}><span style=${sx('width:110px;height:4px;border-radius:2px;background:var(--color-neutral-600)')}></span></div>
  </div></div>`;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
// Versión web: funciona sin internet una vez abierta (en el APK no hace falta)
if ('serviceWorker' in navigator && !window.Capacitor && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
