const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const cloudinary = require('cloudinary').v2;
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({
  origin: [
    'https://ebudget-website.onrender.com',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// ============================================================
// STATIC FILES
// Website → /        CMS → /cms
// ============================================================
app.use('/',    express.static(path.join(__dirname, 'public/website')));
app.use('/cms', express.static(path.join(__dirname, 'public/cms')));

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public/website/index.html'))
);
app.get('/cms', (req, res) =>
  res.sendFile(path.join(__dirname, 'public/cms/index.html'))
);

// ============================================================
// CLOUDINARY CONFIGURATION
// ============================================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
console.log('Cloudinary configured:', process.env.CLOUDINARY_CLOUD_NAME ? 'YES' : 'NO');

// ============================================================
// IN-MEMORY STATE
// ============================================================
let cmsData = {};    // all website text content
let slides  = [];    // promo slider images + captions
let apkMeta = null;  // { name, size, url } — APK stored in Cloudinary

// ============================================================
// CLOUDINARY PERSISTENCE
// ============================================================
async function loadFromCloudinary() {
  try {
    const result = await cloudinary.api.resource('ebudget-site/database', { resource_type: 'raw' });
    const https  = require('https');
    const raw    = await new Promise((resolve, reject) => {
      https.get(result.secure_url + '?t=' + Date.now(), res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
      }).on('error', reject);
    });
    const data = JSON.parse(raw);
    cmsData = data.cmsData || {};
    slides  = data.slides  || [];
    apkMeta = data.apkMeta || null;
    console.log(`✅ Loaded — APK: ${apkMeta ? apkMeta.name : 'none'}, slides: ${slides.length}`);
  } catch (e) {
    console.log('ℹ️  No existing data, starting fresh');
  }
}

async function saveToCloudinary() {
  try {
    const payload = JSON.stringify(
      { cmsData, slides, apkMeta, updatedAt: new Date().toISOString() },
      null, 2
    );
    await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id:     'ebudget-site/database',
          overwrite:      true,
          invalidate:     true
        },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(Buffer.from(payload));
    });
    console.log('✅ Saved at', new Date().toLocaleTimeString());
  } catch (e) {
    console.error('❌ Save error:', e.message);
  }
}

// Auto-save every 10 seconds
setInterval(saveToCloudinary, 10000);

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status:     'ok',
    message:    'eBudget website server is running',
    cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'missing',
    slides:     slides.length,
    apk:        apkMeta ? apkMeta.name : 'none'
  });
});

// ============================================================
// CMS CONTENT — LOAD  (website reads on page load)
// ============================================================
app.get('/cms/load', (req, res) => {
  res.json(cmsData);
});

// ============================================================
// CMS CONTENT — SAVE  (CMS posts all text fields)
// ============================================================
app.post('/cms/save', async (req, res) => {
  try {
    cmsData = { ...cmsData, ...req.body, _saved: new Date().toISOString() };
    await saveToCloudinary();
    res.json({ ok: true, message: 'Content saved.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// PROMO SLIDES — LOAD  (website reads on page load)
// ============================================================
app.get('/cms/slides', (req, res) => {
  res.json(slides);
});

// ============================================================
// PROMO SLIDES — SAVE  (CMS posts full slides array)
// ============================================================
app.post('/cms/slides', async (req, res) => {
  try {
    if (!Array.isArray(req.body))
      return res.status(400).json({ error: 'Body must be an array.' });
    slides = req.body;
    await saveToCloudinary();
    res.json({ ok: true, count: slides.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// APK — UPLOAD to Cloudinary  (CMS sends base64 data URI)
// ============================================================
app.post('/cms/apk', async (req, res) => {
  try {
    const { name, data } = req.body;
    if (!data || !data.startsWith('data:'))
      return res.status(400).json({ error: 'Invalid APK data.' });

    // Strip data URI prefix and upload raw bytes to Cloudinary
    const buffer = Buffer.from(data.split(',')[1], 'base64');

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id:     'ebudget-site/eBudget.apk',
          overwrite:      true,
          invalidate:     true
        },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(buffer);
    });

    apkMeta = { name: name || 'eBudget.apk', size: buffer.length, url: result.secure_url };
    await saveToCloudinary();

    res.json({ ok: true, name: apkMeta.name, size: apkMeta.size, url: apkMeta.url });
  } catch (e) {
    console.error('APK upload error:', e.message);
    res.status(500).json({ error: 'APK upload failed: ' + e.message });
  }
});

// ============================================================
// APK — GET INFO  (website checks availability + gets URL)
// ============================================================
app.get('/cms/apk', (req, res) => {
  if (apkMeta) {
    res.json({ available: true, name: apkMeta.name, size: apkMeta.size, url: apkMeta.url });
  } else {
    res.json({ available: false });
  }
});

// ============================================================
// APK — DELETE
// ============================================================
app.delete('/cms/apk', async (req, res) => {
  try {
    await cloudinary.uploader.destroy('ebudget-site/eBudget.apk', { resource_type: 'raw' });
    apkMeta = null;
    await saveToCloudinary();
    res.json({ ok: true, message: 'APK removed from Cloudinary.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// START SERVER
// ============================================================
loadFromCloudinary().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║   eBudget Website Server                           ║
║                                                    ║
║   ✅ Running on port ${PORT}                         ║
║   🌐 Website  →  /                                 ║
║   🛠  CMS      →  /cms                             ║
║   ☁️  Storage  →  Cloudinary                       ║
║   📱 APK       →  ${apkMeta ? apkMeta.name : 'not uploaded yet'}
╚════════════════════════════════════════════════════╝`);
  });
});

// Save on graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down — saving data...');
  await saveToCloudinary();
  process.exit(0);
});
