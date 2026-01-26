# Pool Operations API v2

A comprehensive backend API for commercial pool operations mobile app.

## Tech Stack

- **Fastify** - High-performance web framework
- **TypeScript** - Type-safe JavaScript
- **PostgreSQL** - Database (via Replit's built-in PostgreSQL)
- **Prisma** - ORM for database operations
- **JWT** - Authentication via Bearer tokens
- **Zod** - Request validation
- **bcrypt** - Password hashing

## Project Structure

```
├── prisma/
│   ├── schema.prisma     # Database schema with all models
│   ├── seed.ts           # Seed script for test users/data
│   └── migrations/       # Database migrations
├── src/
│   ├── index.ts          # Server entry point
│   ├── app.ts            # Fastify app configuration
│   ├── plugins/          # Fastify plugins
│   │   ├── prisma.ts     # Database connection
│   │   ├── jwt.ts        # JWT authentication
│   │   └── rbac.ts       # Role-based access control
│   ├── routes/           # API route handlers
│   │   ├── auth.ts       # Login, register, logout
│   │   ├── properties.ts # Property management
│   │   ├── assignments.ts
│   │   ├── emergencies.ts
│   │   ├── locations.ts  # GPS tracking
│   │   ├── messages.ts   # Chat
│   │   └── ...           # All other endpoints
│   └── utils/            # Utility functions
│       ├── env.ts        # Environment validation
│       ├── password.ts   # Password hashing
│       └── errors.ts     # Error response helpers
├── server/
│   └── index.ts          # Delegates to Fastify app
└── README.md             # Full documentation
```

## Running the App

The app runs on port 5000 via the "Start application" workflow.

### Environment Variables

Set via Replit Secrets:
- `DATABASE_URL` - Auto-set by Replit PostgreSQL
- `JWT_SECRET` - Secret for JWT signing
- `CORS_ORIGIN` - CORS allowed origins (default: *)
- `PORT` - Server port (default: 5000)
- `HOST` - Server host (default: 0.0.0.0)

## API Endpoints

All endpoints are under `/api` prefix.

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login (returns JWT token)
- `POST /api/auth/logout` - Logout

### Core Business
- `GET /api/properties` - List properties
- `POST /api/properties/:id/complete` - Complete property service
- `GET /api/assignments` - List assignments
- `PATCH /api/assignments/:id` - Update assignment
- `GET /api/route-stops` - Route optimization

### Team Tracking
- `POST /api/locations` - Post GPS update
- `GET /api/technicians/locations` - Get all tech locations (supervisor)
- `GET /api/technicians/status` - Get clock-in status

### Emergency & Messaging
- `POST /api/emergencies` - Report emergency
- `GET /api/messages` - Get messages (cursor pagination)
- `POST /api/messages` - Send message

### Operations
- `GET /api/truck-inventory` - Truck inventory
- `GET /api/inspections` - QC inspections
- `GET /api/metrics` - Dashboard metrics
- `GET /api/alerts` - System alerts
- `POST /api/repairs` - Repair requests
- `GET /api/jobs` - Repair jobs

## Roles

- `tech` - Field technician (sees only own assignments)
- `supervisor` - Can manage their team's resources (isolated by supervisorId)
- `repair` - Repair technician
- `admin` - Full access across all regions

## Regions

The system supports multi-supervisor isolation with 3 regions:
- `north` - North region properties and technicians
- `mid` - Mid region properties and technicians
- `south` - South region properties and technicians

Supervisors are assigned a region and can only:
- View/manage technicians with `supervisorId` matching their user ID
- View properties matching their region OR assigned to their team
- Create assignments only for their own team members

## Test Users (Development)

| Email | Password | Role | Region |
|-------|----------|------|--------|
| admin@breakpoint.local | password123 | admin | - |
| supervisor.north@breakpoint.local | password123 | supervisor | north |
| supervisor.mid@breakpoint.local | password123 | supervisor | mid |
| supervisor.south@breakpoint.local | password123 | supervisor | south |
| tech.north1@breakpoint.local | password123 | tech | north |
| tech.north2@breakpoint.local | password123 | tech | north |
| tech.mid1@breakpoint.local | password123 | tech | mid |
| tech.mid2@breakpoint.local | password123 | tech | mid |
| tech.south1@breakpoint.local | password123 | tech | south |
| tech.south2@breakpoint.local | password123 | tech | south |

## Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed database
npx tsx prisma/seed.ts
```

## Recent Changes

- **2026-01-26**: Multi-supervisor isolation with regional teams
  - Added `Region` enum (north, mid, south) to Prisma schema
  - Added `TechnicianProfile.supervisorId` for team membership
  - Added `TechnicianProfile.region` and `Property.region` for regional organization
  - Supervisors can only view/manage their own team's data
  - Cross-team assignment attempts blocked with 403 Forbidden
  - Updated seed script with 3 supervisors, 6 technicians, 6 properties

- **2026-01-26**: Assignment priority & enhanced RBAC
  - Added Assignment.priority field (low|med|high, default: med)
  - Supervisor/admin can create assignments and edit all fields
  - Technicians can only view their own assignments and PATCH status + notes
  - GET /api/properties now filters for techs (only assigned properties)
  - GET /api/technicians returns id, name, email for supervisor selection

- **2026-01-26**: Initial API v2 implementation
  - Complete Fastify + Prisma setup
  - All endpoints implemented
  - JWT authentication with RBAC
  - Seed script with test users
