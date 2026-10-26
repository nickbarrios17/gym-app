/* Arma la app:
   node build.js          → copia librerías a vendor/ y genera www/ (versión web, sin código de sincronización)
   node build.js --apk    → igual, pero www/ incluye el código de sincronización (para el APK)
   La URL del servidor y el código se leen de sync.local.json (no se publica). */
const fs = require('fs'), path = require('path');
const root = __dirname, nm = p => path.join(root, 'node_modules', p);
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

// 1. Librerías locales
cp(nm('react/umd/react.production.min.js'), path.join(root, 'vendor/react.production.min.js'));
cp(nm('react-dom/umd/react-dom.production.min.js'), path.join(root, 'vendor/react-dom.production.min.js'));
cp(nm('htm/dist/htm.umd.js'), path.join(root, 'vendor/htm.umd.js'));
cp(nm('three/build/three.min.js'), path.join(root, 'vendor/three.min.js'));
['regular', 'fill', 'bold'].forEach(w => {
  const dir = nm('@phosphor-icons/web/src/' + w);
  fs.readdirSync(dir).filter(f => /\.(css|woff2?|ttf)$/.test(f)).forEach(f => cp(path.join(dir, f), path.join(root, 'vendor/phosphor', w, f)));
});

// 2. Configuración de sincronización
let sync = {};
try { sync = JSON.parse(fs.readFileSync(path.join(root, 'sync.local.json'), 'utf8')); } catch (e) {}
const apk = process.argv.includes('--apk');
const cfg = (withCode) => `window.GYM_SYNC = ${JSON.stringify({ url: sync.url || '', ...(withCode && sync.code ? { code: sync.code } : {}) })};\n`;
fs.writeFileSync(path.join(root, 'config.js'), cfg(true)); // uso local en esta PC

// 3. www/ (lo que se publica en la web o se mete en el APK)
const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true });
['index.html', 'app.js', 'app.css', 'nocturne.css', 'merge.js', 'mannequin.js', 'manifest.webmanifest', 'icon.svg', 'sw.js'].forEach(f => cp(path.join(root, f), path.join(www, f)));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : cp(p, path.join(www, path.relative(root, p))); });
walk(path.join(root, 'vendor'));
fs.writeFileSync(path.join(www, 'config.js'), cfg(apk));

// 4. Servidor: copia la función de combinación como Merge.gs
cp(path.join(root, 'merge.js'), path.join(root, 'sync-backend/Merge.gs'));

console.log('Listo: www/ generado' + (apk ? ' (con código, para APK)' : ' (web)'));
