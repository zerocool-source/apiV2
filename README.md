# Pool Operations API v2

A comprehensive backend API for commercial pool operations mobile app built with Fastify, TypeScript, PostgreSQL, and Prisma.

## Tech Stack

- **Fastify** - Fast and low overhead web framework
- **TypeScript** - Type-safe JavaScript
- **PostgreSQL** - Relational database
- **Prisma** - Modern ORM for Node.js
- **JWT** - JSON Web Token authentication
- **Zod** - Schema validation

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Environment Variables

Set the following environment variables:

```bash
DATABASE_URL="postgresql://user:password@host:port/database"
JWT_SECRET="your-super-secret-jwt-key"
PORT=5000
HOST=0.0.0.0
CORS_ORIGIN="*"
NODE_ENV="development"
```

### Running in Replit

1. The PostgreSQL database is automatically provisioned
2. Environment variables are set automatically
3. Run the development server:

```bash
npm run dev
```

4. Access the API at: `http://0.0.0.0:5000/api/health`

### Running Locally

1. Install dependencies:
```bash
npm install
```

2. Generate Prisma client:
```bash
npx prisma generate
```

3. Run database migrations:
```bash
npx prisma migrate deploy
```

4. Seed the database (development only):
```bash
npm run seed
```

5. Start the development server:
```bash
npm run dev
```

## Deployment to Render

### Environment Variables for Render

Set these in the Render dashboard:

- `DATABASE_URL` - Your PostgreSQL connection string
- `JWT_SECRET` - A secure random string
- `NODE_ENV` - Set to `production`
- `CORS_ORIGIN` - Comma-separated allowed origins

### Build & Start Commands

- **Build Command**: `npm run build`
- **Start Command**: `npm run start`

### Database Migrations

Run migrations as part of your deploy:

```bash
npm run prisma:migrate
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and get JWT token |
| POST | `/api/auth/logout` | Logout (client-side token discard) |

### Properties

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/properties` | List all properties |
| GET | `/api/properties/:id` | Get property details |
| POST | `/api/properties` | Create a property |
| POST | `/api/properties/:id/complete` | Complete property service |

### Assignments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assignments` | List assignments |
| GET | `/api/assignments/created` | List all created assignments |
| GET | `/api/assignments/:id` | Get assignment details |
| POST | `/api/assignments` | Create assignment |
| PATCH | `/api/assignments/:id` | Update assignment |

### Team Tracker

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/locations` | Post GPS location update |
| GET | `/api/technicians/locations` | Get all technician locations |
| GET | `/api/technicians/status` | Get technician status |

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/messages` | Get messages (with cursor pagination) |
| POST | `/api/messages` | Send a message |

### Emergencies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/emergencies` | List emergency reports |
| POST | `/api/emergencies` | Create emergency report |

### And more...

See the source code for complete endpoint documentation including:
- Route Stops
- Technicians
- Roster
- Property Channels
- Truck Inventory
- Inspections
- Metrics
- Alerts
- Repairs
- Jobs
- Estimates
- Products
- Time Entries
- Uploads
- Sync

## Example cURL Commands

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "tech@breakpoint.local", "password": "password123"}'
```

Response:
```json
{
  "user": {
    "id": "uuid",
    "email": "tech@breakpoint.local",
    "role": "tech"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Post Location Ping

```bash
curl -X POST http://localhost:5000/api/locations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"latitude": 34.0522, "longitude": -118.2437}'
```

### Get Properties

```bash
curl -X GET http://localhost:5000/api/properties \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Create Emergency Report

```bash
curl -X POST http://localhost:5000/api/emergencies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "propertyId": "property-uuid",
    "severity": "high",
    "category": "equipment",
    "description": "Pump malfunction - loud grinding noise"
  }'
```

## Roles & Permissions

- **tech** - Field technician, can view/update own assignments
- **supervisor** - Can manage all assignments, view all data
- **repair** - Repair technician, focused on repair jobs
- **admin** - Full access to all endpoints

## Test Users (Development)

| Email | Password | Role |
|-------|----------|------|
| admin@breakpoint.local | password123 | admin |
| supervisor@breakpoint.local | password123 | supervisor |
| tech@breakpoint.local | password123 | tech |
| repair@breakpoint.local | password123 | repair |

## License

MIT
