/* Servidor de sincronización de Gym App.
   Guarda los datos comprimidos en las propiedades del propio script (no necesita permisos de Drive).
   Solo responde a quien envía el código de sincronización correcto. */
var CHUNK = 8000;          // las propiedades admiten ~9 KB por valor
var MAX_B64 = 450000;      // el total de propiedades es 500 KB

function doGet() {
  return ContentService.createTextOutput('Servidor de sincronización de Gym App activo.');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var req = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var code = props.getProperty('SYNC_CODE');
    if (!code) {
      // El primer código válido que llega queda como el código de esta instalación
      if (!req.code || String(req.code).length < 16) return out_({ ok: false, error: 'Código inválido' });
      props.setProperty('SYNC_CODE', String(req.code));
      code = String(req.code);
    }
    if (req.code !== code) return out_({ ok: false, error: 'Código de sincronización incorrecto' });
    var stored = load_(props);
    var merged = req.data ? gymMerge(stored, req.data) : stored;
    if (req.data) save_(props, merged);
    return out_({ ok: true, data: merged });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function load_(props) {
  var p = props.getProperties(), n = parseInt(p.N || '0', 10);
  if (!n) return null;
  var s = '';
  for (var i = 0; i < n; i++) s += p['D' + i] || '';
  var blob = Utilities.newBlob(Utilities.base64Decode(s), 'application/x-gzip');
  return JSON.parse(Utilities.ungzip(blob).getDataAsString('UTF-8'));
}

function save_(props, obj) {
  var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), 'application/json')).getBytes());
  if (b64.length > MAX_B64) throw new Error('El almacenamiento de sincronización está lleno');
  var old = parseInt(props.getProperty('N') || '0', 10), vals = {}, n = Math.ceil(b64.length / CHUNK);
  for (var i = 0; i < n; i++) vals['D' + i] = b64.slice(i * CHUNK, (i + 1) * CHUNK);
  vals.N = String(n);
  props.setProperties(vals);
  for (var j = n; j < old; j++) props.deleteProperty('D' + j);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
