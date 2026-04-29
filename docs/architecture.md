## architecture flow
## System Architecture Flow

```mermaid
flowchart TD

%% Frontend
A[User / Browser] --> B[Frontend UI<br/>HTML + JS]

%% API Layer
B --> C[Express API Server]

%% Routes
C --> D[Routes Layer]
D --> E[Controllers]

%% Services Layer
E --> F[Service Layer]

%% External Sources
F --> G1[Amazon API<br/>SerpAPI]
F --> G2[Flipkart Scraper<br/>Puppeteer]
F --> G3[eBay API]
F --> G4[Snapdeal Scraper]

%% Data Processing
G1 --> H[Data Normalization]
G2 --> H
G3 --> H
G4 --> H

%% Database
H --> I[(MongoDB)]

%% Cache + Queue
F --> J[(Redis Cache)]
F --> K[BullMQ Queue]
K --> L[Worker Service]

%% Back to API
I --> E
J --> E

%% Response
E --> C
C --> B
B --> A



---

##  What this shows (for interviewer / PR reviewer)
- Full **data flow (end-to-end)**  
- Separation of:
  - UI  
  - API  
  - Services  
  - External sources  
  - DB + Cache + Queue  
- Shows **real-world architecture maturity** 

---

## Optional (Add this below diagram)
```md
### Key Highlights
- Multi-source aggregation (Amazon, Flipkart, eBay, Snapdeal)
- Redis caching for fast responses
- BullMQ queue for background processing
- MongoDB for normalized product storage
- Service layer handles scraping + API logic