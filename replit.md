# Pool Operations API v2

## Overview
This project is a high-performance backend API for a commercial pool operations mobile application. It aims to streamline operations, improve team coordination, and provide robust management capabilities for pool service companies. The API supports core business functions like property management, assignment scheduling, emergency reporting, and team tracking, with a strong focus on role-based access control and regional isolation.

## User Preferences
I prefer clear and concise communication. When making changes, prioritize core functionality and architectural integrity. Please ask before implementing major changes or new features. I appreciate iterative development and detailed explanations for complex solutions.

## System Architecture
The API is built using **Fastify** for high performance, **TypeScript** for type safety, and **PostgreSQL** as the database, accessed via **Prisma ORM**. Authentication is handled with **JWT** bearer tokens, and request validation uses **Zod**. Passwords are secured with **bcrypt**.

**Key Architectural Decisions:**
- **Modular Structure**: Organized into `plugins`, `routes`, and `utils` for maintainability and scalability.
- **Role-Based Access Control (RBAC)**: Implemented with distinct roles (`tech`, `supervisor`, `repair`, `admin`) to restrict access to specific endpoints and data.
- **Multi-Supervisor & Regional Isolation**: The system supports multiple supervisors, each potentially managing a team within a specific geographic `region` (north, mid, south). Supervisors can only manage their assigned team's technicians and properties within their region.
- **Assignment Lifecycle Management**: Assignments have statuses (pending, in_progress, completed, cancelled) with specific roles allowed to transition states.
- **Environment Variable Configuration**: Critical settings like `JWT_SECRET`, database URL, and CORS origins are managed via environment variables for flexible deployment.
- **API Endpoints**: All API endpoints are prefixed with `/api` and cover authentication, core business logic, team tracking, emergency services, messaging, and operational metrics.

## External Dependencies
- **PostgreSQL**: Primary database for all application data, integrated via Replit's built-in PostgreSQL.
- **Prisma**: ORM for interacting with the PostgreSQL database.
- **Fastify**: Web framework for building the API.
- **jsonwebtoken (JWT)**: For token-based authentication.
- **bcrypt**: For secure password hashing.
- **Zod**: For schema validation of API requests.