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

**Required:**
- `DATABASE_URL` - Auto-set by Replit PostgreSQL
- `JWT_SECRET` - **REQUIRED** - Secret for JWT signing (minimum 32 characters)
  - In Replit: Add via Secrets tab
  - In Render: Add as environment variable

**Optional:**
- `JWT_EXPIRES_IN` - Token expiration time (default: "7d")
- `CORS_ORIGIN` - CORS allowed origins (default: *)
- `PORT` - Server port (default: 5000)
- `HOST` - Server host (default: 0.0.0.0)

**Important:** The server will fail to start if `JWT_SECRET` is not set. Generate a secure secret:
```bash
openssl rand -hex 32
```

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
| tech.unassigned@breakpoint.local | password123 | tech | - |

## Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed database
npx tsx prisma/seed.ts
```

## Curl Test Commands

```bash
# Login as supervisor (save token)
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "supervisor.north@breakpoint.local", "password": "password123"}' \
  | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"$//')

# GET /api/technicians (supervisor sees only their team)
curl -s http://localhost:5000/api/technicians \
  -H "Authorization: Bearer $TOKEN"

# GET /api/technicians?includeInactive=true
curl -s "http://localhost:5000/api/technicians?includeInactive=true" \
  -H "Authorization: Bearer $TOKEN"

# PATCH to deactivate a tech (replace TECH_ID with actual ID)
curl -s -X PATCH http://localhost:5000/api/technicians/TECH_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"active": false}'

# PATCH to claim an unassigned tech (replace UNASSIGNED_TECH_ID)
curl -s -X PATCH http://localhost:5000/api/technicians/UNASSIGNED_TECH_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"supervisorId": "SUPERVISOR_USER_ID"}'

# POST /api/assignments (success for own tech)
curl -s -X POST http://localhost:5000/api/assignments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "propertyId": "PROPERTY_ID",
    "technicianId": "OWN_TECH_ID",
    "scheduledDate": "2026-02-01T09:00:00Z",
    "priority": "med"
  }'

# POST /api/assignments (403 for tech from another team)
curl -s -X POST http://localhost:5000/api/assignments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "propertyId": "PROPERTY_ID",
    "technicianId": "OTHER_TEAM_TECH_ID",
    "scheduledDate": "2026-02-01T09:00:00Z"
  }'
# Expected: {"error":"FORBIDDEN","message":"You can only create assignments for your team members"}

# Tech trying to create assignment (403)
TECH_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "tech.north1@breakpoint.local", "password": "password123"}' \
  | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"$//')

curl -s -X POST http://localhost:5000/api/assignments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -d '{"propertyId": "X", "technicianId": "Y", "scheduledDate": "2026-02-01T09:00:00Z"}'
# Expected: {"error":"FORBIDDEN","message":"Insufficient permissions"}
```

### Assignment Lifecycle Tests

```bash
# Get an assignment ID first
ASSIGNMENT_ID=$(curl -s http://localhost:5000/api/assignments \
  -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"$//')

# Tech updates status: pending -> in_progress (success)
curl -s -X PATCH "http://localhost:5000/api/assignments/$ASSIGNMENT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -d '{"status": "in_progress"}'
# Expected: status becomes "in_progress"

# Tech updates status: in_progress -> completed (success)
curl -s -X PATCH "http://localhost:5000/api/assignments/$ASSIGNMENT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -d '{"status": "completed"}'
# Expected: status becomes "completed", completedAt auto-set

# Tech tries to cancel (403 Forbidden)
curl -s -X PATCH "http://localhost:5000/api/assignments/$ASSIGNMENT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -d '{"status": "cancelled"}'
# Expected: {"error":"FORBIDDEN","message":"Technicians cannot cancel assignments"}

# Supervisor cancels assignment for own tech (success)
curl -s -X PATCH "http://localhost:5000/api/assignments/$ASSIGNMENT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "cancelled", "canceledReason": "Customer requested reschedule"}'
# Expected: status becomes "cancelled", canceledAt set, canceledReason set

# Supervisor tries to cancel other team's assignment (403)
# First get an assignment from mid region
MID_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "supervisor.mid@breakpoint.local", "password": "password123"}' \
  | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"$//')

# Try to cancel north team's assignment with mid supervisor token
curl -s -X PATCH "http://localhost:5000/api/assignments/$ASSIGNMENT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MID_TOKEN" \
  -d '{"status": "cancelled"}'
# Expected: {"error":"FORBIDDEN","message":"You can only update your team's assignments"}

# GET /api/assignments excludes canceled by default
curl -s http://localhost:5000/api/assignments \
  -H "Authorization: Bearer $TOKEN"
# Canceled assignments not shown

# GET /api/assignments?includeCanceled=true includes canceled
curl -s "http://localhost:5000/api/assignments?includeCanceled=true" \
  -H "Authorization: Bearer $TOKEN"
# Canceled assignments included
```

## Recent Changes

- **2026-01-26**: Assignment lifecycle with cancel/status RBAC
  - Added Assignment.canceledAt and Assignment.canceledReason fields
  - PATCH /api/assignments/:id:
    - Tech: can update status (pending -> in_progress -> completed) and notes; cannot cancel
    - Supervisor: can update scheduledDate, priority, notes; can cancel own team's assignments
    - Admin/Repair: can update/cancel any assignment
  - GET /api/assignments: excludes canceled by default; use ?includeCanceled=true to include
  - Cancel is idempotent (canceling already-canceled returns current record)

- **2026-01-26**: JWT stability improvements
  - JWT_SECRET is now REQUIRED (server fails fast if missing)
  - JWT_EXPIRES_IN env var support (default: "7d")
  - Updated env documentation with Replit/Render instructions

- **2026-01-26**: Supervisor-Technician roster management
  - GET /api/technicians: supervisor sees only their team, repair sees all, tech sees self
  - Added ?includeInactive=true query param to include inactive technicians
  - PATCH /api/technicians/:id: supervisor can update own techs or claim unassigned
  - POST /api/assignments: repair role can create for anyone, tech gets 403
  - Added unassigned tech for testing claim functionality

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
