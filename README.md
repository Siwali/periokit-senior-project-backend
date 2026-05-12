# PerioKit Backend

Backend API for the PerioKit periodontal management system.
This service provides authentication, user management, and API endpoints for clinical data handling.

---

## Tech Stack

* Node.js (Express)
* TypeScript
* Prisma ORM
* Supabase (PostgreSQL + Auth)
* Apollo Server / GraphQL
* dotenv

---

## Project Structure

```
src/
├─ config/         # Database & external service config
├─ controllers/    # Request handlers
├─ routes/         # API routes
├─ services/       # Business logic
├─ middlewares/    # Express middlewares
├─ app.ts
└─ server.ts

prisma/
└─ schema.prisma
```

---

## Installation

```bash
# Clone repository
git clone <your-backend-repo-url>

# Navigate to project
cd periokit-senior-project-backend

# Install dependencies
npm install
```

---

## Environment Variables

Create `.env` file based on `.env.example`

```env
PORT=3000

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

DATABASE_URL=your_database_url
ALLOWED_ORIGINS=http://localhost:5173
```

---

## API Boundary

The backend is the main boundary between the frontend and Supabase.

* REST handles authentication and upload-oriented commands such as `POST /auth/register`, `POST /auth/login`, and `POST /auth/logout`.
* GraphQL handles application data through `POST /graphql`.
* Supabase Auth, Storage, and PostgreSQL access should stay on the backend unless a frontend feature has an explicit, reviewed reason to call Supabase directly.
* GraphQL `me` is the preferred current-user source of truth. REST `GET /auth/me` is kept temporarily for compatibility and should not be expanded.

---

##  Run Development Server

```bash
npm run dev
```

Server will run at:

```
http://localhost:3000
```

---

## Health Check API

### GET /health

**Response**

```json
{
  "success": true,
  "message": "PerioKit Backend API is running"
}
```

---

## Prisma

### Generate Prisma Client

```bash
npx prisma generate
```

### Pull Schema from Database

```bash
npx prisma db pull
```

---

## Notes

* Supabase is used for authentication and database
* Prisma is used as ORM for database access
* This project follows a modular architecture for scalability

---

## Developers

* Siwali Saenyakiadtikhun
* Aphichaya Suppakitkumjorn

---

## License

This project is for educational purposes (Senior Project).
