const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const https      = require('https');
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
// Website -> /        CMS -> /cms
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
//   key: 'cmsData'  -> value: { ...all text fields }
//   key: 'slides'   -> value: [ ...slide array ]
// ============================================================
async function dbGet(key) {
  const { data, error } = await supabase
    .from('cms')
    .select('value')
    .eq('key', key)
    .single();
  if (error) return null;
  return data ? data.value : null;
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
app.get('/health', (req, res) => {
  const apkUrl = process.env.APK_URL || null;
  res.json({
    status:   'ok',
    message:  'eBudget website server is running',
    supabase: process.env.SUPABASE_URL ? 'configured' : 'missing',
    apk:      apkUrl ? 'configured' : 'none'
  });
});

// ============================================================
// CMS CONTENT - LOAD  (website reads on page load)
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
// CMS CONTENT - SAVE  (CMS posts all text fields)
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
// PROMO SLIDES - LOAD
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
// PROMO SLIDES - SAVE
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
// APK - INFO  (CMS dashboard status check)
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
// APK - DIRECT DOWNLOAD
// Proxies the file from GitHub Releases so users get a native
// download prompt directly on their phone — no GitHub page.
// The website's Download APK button should call /download/apk
// ============================================================
app.get('/download/apk', (req, res) => {
  const url = process.env.APK_URL || null;
  if (!url) return res.status(404).send('APK not available yet.');

  res.setHeader('Content-Disposition', 'attachment; filename="eBudget.apk"');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');

  // Follow redirects — GitHub Releases uses them
  const follow = (href) => {
    https.get(href, (upstream) => {
      if (upstream.statusCode === 301 || upstream.statusCode === 302) {
        return follow(upstream.headers.location);
      }
      if (upstream.statusCode !== 200) {
        return res.status(502).send('Failed to fetch APK from source.');
      }
      upstream.pipe(res);
    }).on('error', (e) => {
      res.status(502).send('Download error: ' + e.message);
    });
  };

  follow(url);
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║   eBudget Website Server                           ║
║                                                    ║
║   Running on port ${PORT}                            ║
║   Website  ->  /                                   ║
║   CMS      ->  /cms                                ║
║   Storage  ->  Supabase                            ║
║   APK      ->  /download/apk (proxied)             ║
╚════════════════════════════════════════════════════╝`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  process.exit(0);
});
