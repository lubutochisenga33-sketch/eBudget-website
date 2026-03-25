const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// SUPABASE CLIENT
// Set SUPABASE_URL and SUPABASE_KEY in Render environment vars
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
console.log('Supabase configured:', process.env.SUPABASE_URL ? 'YES' : 'NO');

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.options('*', cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// ============================================================
// STATIC FILES
// Website → /        CMS → /cms
// ============================================================
const ROOT = path.resolve(__dirname);
app.use('/',    express.static(path.join(ROOT, 'public/website')));
app.use('/cms', express.static(path.join(ROOT, 'public/cms')));

app.get('/', (req, res) =>
  res.sendFile(path.join(ROOT, 'public/website/index.html'))
);
app.get('/cms', (req, res) =>
  res.sendFile(path.join(ROOT, 'public/cms/index.html'))
);

// ============================================================
// SUPABASE HELPERS
// All data lives in the `cms` table as key/value rows:
//   key: 'cmsData'  → value: { ...all text fields }
//   key: 'slides'   → value: [ ...slide array ]
// ============================================================
async function dbGet(key) {
  const { data, error } = await supabase
    .from('cms')
    .select('value')
    .eq('key', key)
    .single();
  if (error) return null;
  return data?.value ?? null;
}

async function dbSet(key, value) {
  const { error } = await supabase
    .from('cms')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', async (req, res) => {
  const apkUrl = process.env.APK_URL || null;
  res.json({
    status:   'ok',
    message:  'eBudget website server is running',
    supabase: process.env.SUPABASE_URL ? 'configured' : 'missing',
    apk:      apkUrl ? 'configured' : 'none'
  });
});

// ============================================================
// CMS CONTENT — LOAD  (website reads on page load)
// ============================================================
app.get('/cms/load', async (req, res) => {
  try {
    const data = await dbGet('cmsData');
    res.json(data || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// CMS CONTENT — SAVE  (CMS posts all text fields)
// ============================================================
app.post('/cms/save', async (req, res) => {
  try {
    const existing = await dbGet('cmsData') || {};
    const updated  = { ...existing, ...req.body, _saved: new Date().toISOString() };
    await dbSet('cmsData', updated);
    res.json({ ok: true, message: 'Content saved.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// PROMO SLIDES — LOAD
// ============================================================
app.get('/cms/slides', async (req, res) => {
  try {
    const data = await dbGet('slides');
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// PROMO SLIDES — SAVE
// ============================================================
app.post('/cms/slides', async (req, res) => {
  try {
    if (!Array.isArray(req.body))
      return res.status(400).json({ error: 'Body must be an array.' });
    await dbSet('slides', req.body);
    res.json({ ok: true, count: req.body.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// APK — GET INFO
// APK is hosted on GitHub Releases.
// Set APK_URL in Render environment variables:
// https://github.com/lubutochisenga33-sketch/eBudget-website/releases/download/v1.0/eBudget.1.apk
// ============================================================
app.get('/cms/apk', (req, res) => {
  const url = process.env.APK_URL || null;
  if (url) {
    res.json({ available: true, name: 'eBudget.apk', url });
  } else {
    res.json({ available: false });
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║   eBudget Website Server                           ║
║                                                    ║
║   ✅ Running on port ${PORT}                         ║
║   🌐 Website  →  /                                 ║
║   🛠  CMS      →  /cms                             ║
║   💾 Storage  →  Supabase                          ║
║   📱 APK       →  GitHub Releases (via APK_URL)    ║
╚════════════════════════════════════════════════════╝`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  process.exit(0);
});
