// ============================================================
//  SERVIDOR DE PANTALLAS (señalización digital)
//  - Guarda imágenes/videos que subes desde el panel
//  - Cada TV abre /player.html?pantalla=NOMBRE y se queda conectada
//  - Cuando cambias algo en el panel, las TVs se actualizan al instante
// ============================================================
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD || 'cambiar123'; // ¡cámbiala!
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

// ---------- "Base de datos" sencilla en un archivo JSON ----------
let db = { media: [], screens: {} };
if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

function getScreen(id) {
  if (!db.screens[id]) {
    db.screens[id] = { id, name: id, playlist: [], override: null, lastSeen: null };
    save();
  }
  return db.screens[id];
}

// ---------- App ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));

// Seguridad mínima: el panel manda la contraseña en la cabecera x-password
function auth(req, res, next) {
  if (req.get('x-password') === PASSWORD) return next();
  res.status(401).json({ error: 'Contraseña incorrecta' });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) =>
      cb(null, Date.now() + '-' + crypto.randomBytes(3).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB por archivo
  fileFilter: (req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype)),
});

// Qué ve cada pantalla (playlist con las URLs ya resueltas)
function screenPayload(id) {
  const s = getScreen(id);
  const find = (mid) => db.media.find((m) => m.id === mid);
  return {
    name: s.name,
    playlist: s.playlist.map((p) => ({ ...find(p.mediaId), duration: p.duration })).filter((x) => x.url),
    override: s.override ? { ...find(s.override.mediaId), until: s.override.until } : null,
  };
}
function pushTo(id) { io.to('screen:' + id).emit('update', screenPayload(id)); }
function pushAll() { Object.keys(db.screens).forEach(pushTo); }
function panelRefresh() { io.to('admins').emit('refresh'); }

// ---------- API del panel ----------
app.post('/api/login', (req, res) => res.json({ ok: req.body.password === PASSWORD }));

app.get('/api/state', auth, (req, res) => {
  const online = new Set();
  for (const [, sock] of io.of('/').sockets) if (sock.data.screenId) online.add(sock.data.screenId);
  res.json({
    media: db.media,
    screens: Object.values(db.screens).map((s) => ({ ...s, online: online.has(s.id) })),
  });
});

app.post('/api/media', auth, upload.array('files', 20), (req, res) => {
  for (const f of req.files || []) {
    db.media.push({
      id: crypto.randomUUID(),
      name: f.originalname,
      type: f.mimetype.startsWith('video') ? 'video' : 'image',
      url: '/uploads/' + f.filename,
      file: f.filename,
    });
  }
  save(); panelRefresh();
  res.json({ ok: true, count: (req.files || []).length });
});

app.delete('/api/media/:id', auth, (req, res) => {
  const m = db.media.find((x) => x.id === req.params.id);
  if (m) {
    fs.rmSync(path.join(UPLOADS, m.file), { force: true });
    db.media = db.media.filter((x) => x.id !== m.id);
    for (const s of Object.values(db.screens)) {
      s.playlist = s.playlist.filter((p) => p.mediaId !== m.id);
      if (s.override?.mediaId === m.id) s.override = null;
    }
    save(); pushAll(); panelRefresh();
  }
  res.json({ ok: true });
});

// Crear / renombrar pantalla
app.post('/api/screens', auth, (req, res) => {
  const id = String(req.body.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!id) return res.status(400).json({ error: 'Falta el código' });
  const s = getScreen(id);
  if (req.body.name) s.name = req.body.name;
  save(); panelRefresh();
  res.json(s);
});

app.delete('/api/screens/:id', auth, (req, res) => {
  delete db.screens[req.params.id];
  save(); panelRefresh();
  res.json({ ok: true });
});

// Guardar playlist: [{mediaId, duration}]
app.put('/api/screens/:id/playlist', auth, (req, res) => {
  const ids = req.params.id === '*' ? Object.keys(db.screens) : [req.params.id];
  for (const id of ids) getScreen(id).playlist = (req.body.playlist || []).map((p) => ({
    mediaId: p.mediaId, duration: Math.max(3, Number(p.duration) || 10),
  }));
  save(); ids.forEach(pushTo); panelRefresh();
  res.json({ ok: true });
});

// "Mostrar YA": un contenido encima de todo durante X minutos (0 = quitar)
app.post('/api/screens/:id/override', auth, (req, res) => {
  const ids = req.params.id === '*' ? Object.keys(db.screens) : [req.params.id];
  const minutes = Number(req.body.minutes) || 0;
  for (const id of ids) {
    getScreen(id).override = req.body.mediaId && minutes > 0
      ? { mediaId: req.body.mediaId, until: Date.now() + minutes * 60000 } : null;
  }
  save(); ids.forEach(pushTo); panelRefresh();
  res.json({ ok: true });
});

app.post('/api/screens/:id/reload', auth, (req, res) => {
  const target = req.params.id === '*' ? io : io.to('screen:' + req.params.id);
  target.emit('reload');
  res.json({ ok: true });
});

// ---------- Tiempo real (WebSocket) ----------
io.on('connection', (socket) => {
  socket.on('register', (id) => {
    id = String(id || 'pantalla-1').toLowerCase();
    socket.data.screenId = id;
    socket.join('screen:' + id);
    getScreen(id).lastSeen = Date.now(); save();
    socket.emit('update', screenPayload(id));
    panelRefresh();
  });
  socket.on('admin', (pw) => { if (pw === PASSWORD) socket.join('admins'); });
  socket.on('disconnect', () => {
    if (socket.data.screenId) { getScreen(socket.data.screenId).lastSeen = Date.now(); save(); panelRefresh(); }
  });
});

// Limpia los "Mostrar YA" vencidos cada 30 s
setInterval(() => {
  for (const s of Object.values(db.screens)) {
    if (s.override && s.override.until < Date.now()) { s.override = null; save(); pushTo(s.id); panelRefresh(); }
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`\n✅ Servidor listo en http://localhost:${PORT}`);
  console.log(`   Panel:      http://localhost:${PORT}/`);
  console.log(`   Pantalla:   http://localhost:${PORT}/player.html?pantalla=local1`);
  if (PASSWORD === 'cambiar123') console.log('   ⚠️  Usa ADMIN_PASSWORD para poner tu propia contraseña');
});
