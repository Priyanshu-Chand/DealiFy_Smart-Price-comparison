##  Search Flow (Sequence Diagram)

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant API as Backend API
    participant S as Service Layer
    participant EXT as External Sources
    participant DB as MongoDB
    participant R as Redis Cache

    U->>F: Enter search query
    F->>API: GET /api/search?q=...
    
    API->>R: Check cache
    alt Cache hit
        R-->>API: Return cached data
    else Cache miss
        API->>S: Fetch listings
        S->>EXT: Call APIs / Scrapers
        EXT-->>S: Raw data
        S->>S: Normalize data
        S->>DB: Save data
        DB-->>S: Stored data
        S-->>API: Processed results
        API->>R: Store in cache
    end
    
    API-->>F: Send results
    F-->>U: Display products


    
---

#  2.  Component Diagram (Clean Layered View)
This shows **clean architecture understanding**

```md
##  Component Architecture

```mermaid
flowchart LR
    UI[Frontend UI] --> API[API Layer]
    API --> CTRL[Controllers]
    CTRL --> SRV[Services]
    SRV --> SCRAPERS[Scrapers / APIs]
    SRV --> CACHE[Redis]
    SRV --> QUEUE[BullMQ]
    QUEUE --> WORKER[Workers]
    SRV --> DB[(MongoDB)]


    
---

#  3.  Small Improvements (High Impact)

Add this section 

```md
##  Architecture Decisions

- Used **Service Layer** to separate business logic from controllers
- Implemented **Redis caching** to reduce repeated API calls
- Used **BullMQ queue** for handling async background jobs
- Applied **data normalization** to unify multi-platform product data
- Designed system to support **fault tolerance** (fallback when source fails)


##  Scalability Considerations

- Horizontal scaling of API servers
- Independent worker scaling for scraping jobs
- Cache-first strategy for high traffic
- Modular scraper design for adding new platforms