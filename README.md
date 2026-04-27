# DealiFy - Product Listing, Details & Price Comparison Platform

DealiFy is a full-stack product aggregation project that fetches listings from multiple platforms, stores normalized product data in MongoDB, and provides a clean UI for:
- Product listing
- Product details
- Cross-platform price comparison

---

## 1. Objective

Build a product discovery and comparison system that helps users:
- Search products across platforms
- View detailed product info in a clean format
- Compare price/platform links in one place
- Save products to cart after login

---

## 2. Project Aim

- Provide near real-time product search and comparison
- Store scraped/API data in a structured MongoDB schema
- Keep UI simple, user-friendly, and interactive
- Handle fallback flows when one platform fails

---

## 3. Core Features

- Multi-source product fetching:
  - Amazon (SerpAPI)
  - Flipkart (scraper + Puppeteer fallback)
  - eBay (Developer API)
  - Snapdeal (scraper)
- MongoDB persistence with per-platform embedded price data
- Product detail page with:
  - price comparison table
  - cross-platform specs snapshot
  - similar products
- JWT authentication (Sign up / Sign in)
- Cart support (add / view / remove)
- Redis cache + BullMQ queue/worker support

---

## 4. Tech Stack

### Backend
- Node.js
- Express.js
- MongoDB + Mongoose
- Redis + BullMQ
- Axios + Cheerio + Puppeteer
- JWT + bcrypt

### Frontend
- HTML, CSS, JavaScript (vanilla)

---

## 5. Suggested Frameworks & Libraries (Installation Guidance)

Already used in this project:
- `express`, `mongoose`, `cors`, `dotenv`
- `axios`, `cheerio`, `puppeteer`
- `ioredis`, `bullmq`
- `jsonwebtoken`, `bcrypt`

Optional but recommended for scaling:
- `nodemon` (dev auto-restart)
- `helmet` (security headers)
- `morgan` (request logging)
- `express-rate-limit` (basic abuse protection)

---

## 6. Folder Structure

```text
DealiFy/
├─ backend/
│  ├─ config/
│  ├─ controllers/
│  ├─ middleware/
│  ├─ models/
│  │  └─ mongo/
│  ├─ queues/
│  ├─ routes/
│  ├─ scrapers/
│  ├─ services/
│  ├─ workers/
│  ├─ server.js
│  └─ package.json
└─ frontend/
   ├─ css/
   ├─ modules/
   └─ index.html
```

---

## 7. How the Project Works (Complete Workflow)

1. User opens frontend (`index/main/product/auth` pages).
2. Search request goes to `GET /api/search?q=...`.
3. Backend tries live source fetch (`scrapingService.fetchLiveListings`).
4. Normalized data is persisted to MongoDB (`persistListings`).
5. DB search runs (`searchModel.searchProducts`) and returns grouped product results.
6. Product details page calls:
   - `GET /api/products/:id`
   - `GET /api/products/:id/comparison`
7. Comparison endpoint refreshes candidates, filters relevance, and returns platform-wise prices.
8. Frontend renders:
   - cards
   - details/specs
   - comparison table
   - cheapest platform highlight

---

## 8. MongoDB Schemas Used

Collections:
- `Product`
- `User`
- `Cart`
- `SearchLog`

Main product structure:
- `normalized_key`
- `product_name`, `brand`, `category`, `specs`
- `search_terms`
- `platforms[]`:
  - `platform_name`
  - `price`
  - `product_url`
  - `image_url`
  - `rating`
  - `last_updated`
  - `price_history[]`

---

## 9. API Endpoints

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Search & Product
- `GET /api/search?q=<query>`
- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/products/:id/comparison`

### Cart
- `POST /api/cart/add`
- `GET /api/cart`
- `DELETE /api/cart/remove/:id`

---

## 10. Setup Instructions

## Prerequisites
- Node.js 18+ (recommended 20+)
- MongoDB Atlas cluster URI
- Redis running locally (or remote)

### A. Clone & install backend

```bash
git clone <your-repo-url>
cd DealiFy/backend
npm install
```

### B. Configure `.env`

Create `backend/.env`:

```env
PORT=5000
CLIENT_URL=http://localhost:5173

MONGODB_URI=your_mongodb_cluster_uri
JWT_SECRET=your_jwt_secret

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

REQUEST_TIMEOUT_MS=12000
SOURCE_TIMEOUT_MS=9000
MAX_RESULTS_PER_SOURCE=6
ENABLE_INLINE_WORKER=true

ENABLE_AMAZON_SOURCE=true
AMAZON_SERPAPI_KEY=your_serpapi_key
AMAZON_SERPAPI_DOMAIN=amazon.in
AMAZON_SERPAPI_LANGUAGE=en_IN
AMAZON_SERPAPI_BASE_URL=https://serpapi.com/search.json

ENABLE_FLIPKART_SOURCE=true
FLIPKART_TIMEOUT_MS=18000

ENABLE_EBAY_SOURCE=true
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_ENVIRONMENT=production
EBAY_MARKETPLACE_ID=EBAY_IN

ENABLE_SNAPDEAL_SOURCE=true
SNAPDEAL_TIMEOUT_MS=9000
```

Note:
- Do **not** commit real keys/secrets.
- Rotate leaked keys before publishing.

### C. Start Redis

If Redis is installed locally:

```bash
redis-server
```

Or Docker:

```bash
docker run --name dealify-redis -p 6379:6379 -d redis
```

### D. Run backend

```bash
cd backend
npm run dev
```

Backend URL:
- `http://localhost:5000`

### E. Run frontend

Use any static server (VS Code Live Server or http-server):

```bash
# from project root
npx http-server . -p 8080
```

Open:
- `http://localhost:8080/frontend/index.html`

---

## 11. Screenshots

Add your images in `/docs` folder and reference like this:

```md
![Landing Page](docs/landing-page.png)
![Search Result](docs/search-result.png)
![Product Details](docs/product-details.png)
![Comparison Table](docs/comparison-table.png)
```

Example:

![Landing Page](docs/landing-page.png)

---

## 12. Common Issues

- Mongo transient error (`ECONNRESET`):
  - Usually temporary network issue
  - Retry search after a few seconds
- Source fetched but not shown:
  - Relevance filtering may remove unrelated products
  - Product table shows `Not available` for missing/irrelevant platform
- Redis not connected:
  - Verify `REDIS_HOST/REDIS_PORT`
  - Run `redis-cli ping` (should return `PONG`)

---

## 13. Future Improvements

- Better product entity matching across platforms
- Better image quality normalization
- More platform adapters
- User wishlist + order tracking
- Analytics dashboard for trending products

---

## 14. Author / Team

Built as an academic/project product comparison system using Node.js, MongoDB, Redis, and scraper/API integrations.

