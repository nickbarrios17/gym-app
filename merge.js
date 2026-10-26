/* Combina dos copias de los datos de la app (este dispositivo y la nube).
   Se usa igual en la app y en el servidor de Apps Script (build.js lo copia como Merge.gs).
   - Campos simples (perfil, unidades, sesión en curso…): gana el cambio más reciente (meta[campo]).
   - Rutinas e historial: se combinan por id; gana la versión con `u` (fecha de cambio) más reciente.
   - Lo borrado queda en `deleted[id]` para que se borre también en el otro dispositivo. */
var GYM_LWW = ['profile', 'units', 'logMode', 'session', 'summary'];

function gymMerge(a, b) {
  if (!b) return a;
  if (!a) return b;
  var ma = a.meta || {}, mb = b.meta || {};
  var out = {};
  Object.keys(b).forEach(function (k) { out[k] = b[k]; });
  Object.keys(a).forEach(function (k) { out[k] = a[k]; });
  out.meta = {};
  GYM_LWW.forEach(function (k) {
    var ta = ma[k] || 0, tb = mb[k] || 0;
    out[k] = tb > ta ? b[k] : a[k];
    out.meta[k] = Math.max(ta, tb);
  });
  out.names = {};
  [b.names || {}, a.names || {}].forEach(function (n) { Object.keys(n).forEach(function (k) { out.names[k] = n[k]; }); });
  var del = {};
  [b.deleted || {}, a.deleted || {}].forEach(function (d) { Object.keys(d).forEach(function (k) { if (!(del[k] >= d[k])) del[k] = d[k]; }); });
  out.deleted = del;
  var list = function (k) {
    var order = [], m = {};
    (a[k] || []).concat(b[k] || []).forEach(function (x) {
      var c = m[x.id];
      if (!c) order.push(x.id);
      if (!c || (x.u || 0) > (c.u || 0)) m[x.id] = x;
    });
    return order.map(function (id) { return m[id]; }).filter(function (x) { return !(del[x.id] >= (x.u || 0)); });
  };
  out.routines = list('routines');
  out.history = list('history').sort(function (x, y) { return y.date - x.date; });
  return out;
}
