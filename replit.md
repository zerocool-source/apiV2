# Pool Operations API v2

## Overview
This project is a high-performance backend REST API for a commercial pool operations mobile application. It aims to streamline operations, improve team coordination, and provide robust management capabilities for pool service companies. The API supports core business functions like property management, assignment scheduling, emergency reporting, and team tracking, with a strong focus on role-based access control and regional isolation.

## User Preferences
I prefer clear and concise communication. When making changes, prioritize core functionality and architectural integrity. Please ask before implementing major changes or new features. I appreciate iterative development and detailed explanations for complex solutions.

## System Architecture
The API is built using **Fastify** for high performance, **TypeScript** for type safety, and **PostgreSQL** as the database, accessed via **Prisma ORM**. Authentication is handled with **JWT** bearer tokens, and request validation uses **Zod**. Passwords are secured with **bcrypt**.

**Key Architectural Decisions:**
- **Pure REST API**: No frontend - this is a headless API for mobile app consumption.
- **Modular Structure**: Organized into `plugins`, `routes`, and `utils` within the `src/` directory for maintainability and scalability.
- **Role-Based Access Control (RBAC)**: Implemented with distinct roles (`tech`, `supervisor`, `repair`, `admin`) to restrict access to specific endpoints and data.
- **Multi-Supervisor & Regional Isolation**: The system supports multiple supervisors, each potentially managing a team within a specific geographic `region` (north, mid, south). Supervisors can only manage their assigned team's technicians and properties within their region.
- **Assignment Lifecycle Management**: Assignments have statuses (pending, in_progress, completed, cancelled) with specific roles allowed to transition states.
- **Environment Variable Configuration**: Critical settings like `JWT_SECRET`, database URL, and CORS origins are managed via environment variables for flexible deployment.
- **API Endpoints**: All API endpoints are prefixed with `/api` and cover authentication, core business logic, team tracking, emergency services, messaging, and operational metrics.

## Project Structure
```
src/
├── index.ts          # Main entry point
├── app.ts            # Fastify app configuration
├── plugins/          # Fastify plugins (auth, swagger, etc.)
├── routes/           # API route handlers
└── utils/            # Utility functions
prisma/
├── schema.prisma     # Database schema
└── seed.ts           # Database seeding
script/
└── build.ts          # Production build script
```

## Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run db:push` - Push schema changes to database

## API Documentation
The API includes interactive OpenAPI/Swagger documentation:
- **Swagger UI**: `/docs` - Interactive documentation with "Try it out" functionality
- **OpenAPI Spec**: `/docs/json` - Raw OpenAPI 3.0 JSON specification

The documentation covers 40+ endpoints organized by tags: Auth, Technicians, Assignments, Properties, Jobs, Metrics, Emergencies, Messages, Locations, Inspections, Inventory, Uploads, Sync, and Health.

## Pagination & Incremental Sync

The core GET endpoints (`/api/properties`, `/api/technicians`, `/api/assignments`) support cursor-based pagination and incremental sync:

### Query Parameters
- `updatedSince` - ISO timestamp to filter records updated after this time
- `limit` - Number of items per page (default: 50, max: 200)
- `cursor` - ID-based cursor for pagination (from previous response's `nextCursor`)

**Note:** Pagination ordering is by `id` (stable ordering). The `updatedSince` filter is applied separately and returns only records updated after the specified timestamp.

### Response Format
All paginated endpoints return:
```json
{
  "items": [...],
  "nextCursor": "<id>" | null
}
```

### Example Curl Commands

**Get first page of properties:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/properties?limit=10"
```

**Get next page using cursor:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/properties?limit=10&cursor=<nextCursor-from-previous-response>"
```

**Incremental sync (get only updated records):**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/properties?updatedSince=2026-01-01T00:00:00.000Z"
```

## AI-Powered Estimate Generation

The API integrates OpenAI (via Replit AI Integrations) for intelligent estimate generation.

### POST /api/estimates/generate

Generates a structured repair estimate from natural language job descriptions.

**Request:**
```json
{
  "jobText": "Jandy JXI heater not igniting. Likely needs igniter kit.",
  "laborRateCents": 14500  // optional, defaults to $145/hr
}
```

**Response:**
```json
{
  "summary": "Replace igniter kit on Jandy JXI heater due to ignition failure.",
  "lines": [
    {
      "type": "part",
      "sku": "R0457502",
      "description": "Igniter Kit Jandy JXI",
      "quantity": 1,
      "unitPriceCents": 9923,
      "totalCents": 9923,
      "matchConfidence": "high"
    },
    {
      "type": "labor",
      "sku": null,
      "description": "Labor (2 hours @ $145.00/hr)",
      "quantity": 2,
      "unitPriceCents": 14500,
      "totalCents": 29000
    }
  ],
  "subtotalCents": 38923,
  "taxCents": 3211,
  "totalCents": 42134,
  "assumptions": [
    "Gas supply is confirmed and functioning.",
    "Matched \"igniter kit\" to Igniter Kit Jandy JXI (high confidence)",
    "AI estimated 2 labor hours"
  ]
}
```

**Match Confidence Levels:**
- `high`: Exact product match found in catalog
- `medium`: Partial match, may need verification
- `low`: No match found, needs manual lookup

### Product Catalog & Learning

- **2101 products** imported from CSV with SKU, name, category, price
- **TechSelection model** tracks tech's product choices for learning
- **POST /api/estimates/selection** logs product selections by queryHash
- **GET /api/products/search** boosts previously selected products

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **Prisma**: ORM for interacting with the PostgreSQL database.
- **Fastify**: Web framework for building the API.
- **@fastify/swagger & @fastify/swagger-ui**: OpenAPI documentation generation.
- **@fastify/jwt**: For JWT token-based authentication.
- **bcrypt**: For secure password hashing.
- **Zod**: For schema validation of API requests.
- **OpenAI** (via Replit AI Integrations): For intelligent estimate generation.
