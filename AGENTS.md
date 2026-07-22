# AGENTS.md

## Project overview

Hana POS is a Vietnamese-language point-of-sale web application. The repository is a small monorepo:

- `frontend/`: React 19, TypeScript, React Router, and Vite.
- `backend/`: FastAPI, SQLAlchemy 2, Pydantic, and PyMySQL.
- `docs/`: architecture and database notes.
- `docker-compose.yml`: local frontend, API, and MySQL 8.4 stack.

Read `docs/CODEX_HANDOFF.md` before starting substantial work. Update it when a change affects architecture, delivered scope, important technical decisions, known risks, or the next-work list.

## Working conventions

- Preserve the existing layered backend flow: router -> service -> SQLAlchemy model, with Pydantic schemas at the API boundary.
- Keep business rules and transaction handling in `backend/app/services`, not in routers.
- Enforce backend permissions even when the frontend already hides or protects a route.
- Keep API paths under `/api`; `/health` is the unauthenticated system health endpoint.
- Preserve soft-delete behavior for customers, products, product categories, and invoices unless a task explicitly changes it.
- Preserve invoice item snapshots (`product_code`, `product_name`, `unit`, and price) so historical invoices do not change when products are edited.
- Any invoice change that affects items must keep stock changes, totals, and invoice history consistent in one database transaction.
- Do not change the invoice code format (`HD-YYMMDD-NNN`) without checking sequence locking, print/barcode rendering, and existing data compatibility.
- UI text and user-facing API errors should be Vietnamese. Source identifiers may remain English.
- Never commit `.env`, credentials, access tokens, database dumps, `node_modules`, build output, or virtual environments.
- Do not edit generated TypeScript artifacts (`vite.config.js`, `vite.config.d.ts`, `*.tsbuildinfo`) unless the build workflow intentionally regenerates them and the change is required.

## Setup and run

Preferred full-stack development command from the repository root:

```powershell
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- MySQL: `localhost:3306`

Local backend (requires a reachable MySQL compatible with `backend/.env`):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Local frontend:

```powershell
cd frontend
npm ci
npm run dev
```

## Verification

Run the checks relevant to the files changed. The minimum checks currently available are:

```powershell
cd frontend
npm run build
```

```powershell
python -m compileall -q backend/app
docker compose config --quiet
```

There is currently no automated backend or frontend test suite and no configured lint script. For business-rule changes, add focused tests when practical and manually exercise the affected API/UI flow against MySQL. At minimum, verify login, permission denial, create/update/cancel invoice behavior, stock restoration, totals, and history when those areas are touched.

## Database and security cautions

- Schema creation and a few compatibility ALTER statements currently run during FastAPI startup; there is no Alembic migration history yet.
- First startup creates an `admin` user with password `admin` and grants the system administrator role. Treat this as development-only and change the password immediately in any persistent environment.
- Authentication uses opaque Bearer tokens. Only token hashes are stored server-side; browser tokens are stored under `hana-access-token` in `localStorage`.
- Do not copy or commit Codex's user-level `~/.codex` directory. Shared Codex context belongs in this file and `docs/CODEX_HANDOFF.md`.

