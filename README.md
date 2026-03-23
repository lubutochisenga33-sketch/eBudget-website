# eBudget — Marketing Website & CMS

Zambia's grocery budget tracker. This repo serves the marketing website
and content management system on Render, following the same architecture
as the eBudget backend app.

---

## Project Structure

```
ebudget-website/
├── index.js                     # Express server
├── package.json
├── .env.example                 # Copy to .env for local dev
├── .gitignore
├── .hintrc
└── public/
    ├── website/
    │   ├── index.html           # Public-facing marketing site
    │   ├── manifest.json        # PWA manifest
    │   ├── sw.js                # Service worker
    │   └── icon.png             # App icon
    └── cms/
        ├── index.html           # Content management system
        ├── manifest.json        # PWA manifest
        ├── sw.js                # Service worker
        └── icon.png             # App icon
```

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Server health check |
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login |
| GET | `/entries/:userId` | Get user entries & budgets |
| PUT | `/entries/:userId` | Save user entries & budgets |
| GET | `/admin/users` | List all users (admin) |
| PATCH | `/admin/approve/:id` | Approve user (admin) |
| PATCH | `/admin/reject/:id` | Reject user (admin) |
| DELETE | `/admin/user/:id` | Delete user (admin) |

Admin routes require `admin-username` and `admin-password` headers.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Fill in your Cloudinary credentials and admin password in .env

# 3. Start server
npm start

# Website → http://localhost:3000
# CMS     → http://localhost:3000/cms
# Health  → http://localhost:3000/health
```

---

## Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect your GitHub repo
4. Set these build/start commands:
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
5. Add your environment variables in the Render dashboard:
   ```
   CLOUDINARY_CLOUD_NAME
   CLOUDINARY_API_KEY
   CLOUDINARY_API_SECRET
   ADMIN_USERNAME
   ADMIN_PASSWORD
   ```
6. Deploy — your site will be live at `https://your-app.onrender.com`

---

## Integrating the API URL

Once your Render service is live, paste your URL into both HTML files.

**In** `public/website/index.html` and `public/cms/index.html`, find:
```html
<!-- API_URL: will be set when Render service is live -->
<!-- <script>window.API_URL = "https://your-app.onrender.com";</script> -->
```

Uncomment and replace with your actual Render URL:
```html
<script>window.API_URL = "https://ebudget-website.onrender.com";</script>
```

Then use `window.API_URL` anywhere in the frontend JS to make API calls.

---

## Storage

User data (registrations, entries, budgets) is persisted to **Cloudinary**
as a raw JSON file (`ebudget-data/database`). Auto-saves every 10 seconds
and on server shutdown. No database setup required.

## Author

Lubuto Chisenga
