# Codex Project Handoff

Last reviewed: 2026-07-22  
Baseline commit when reviewed: `1b0e36f` (`master`)  
Project: Hana POS MVP

## 1. Current objective and product scope

Hana POS is a browser-based POS and lightweight management system inspired by a reduced KiotViet-style workflow. The implemented scope covers authentication and authorization, customers, product categories, products and inventory, sales invoices, configurable extra charges, invoice printing, dashboards, and sold-product reporting.

The application is currently oriented toward local/development deployment with Docker Compose. It is not yet production-hardened.

## 2. Architecture

### Runtime topology

```text
Browser (React/Vite :5173)
        |
        | JSON REST + Bearer token
        v
FastAPI (:8000, /api)
        |
        | SQLAlchemy + PyMySQL
        v
MySQL 8.4 (:3306, database hana_pos)
```

### Backend

- `backend/app/main.py`: application factory, CORS, router registration, health endpoint, startup schema/default-data initialization, and compatibility DDL.
- `backend/app/api/routers/`: HTTP endpoints grouped by access control, customers, product categories, products, invoices, extra-charge settings, and reports.
- `backend/app/api/deps.py`: Bearer-token authentication and permission dependencies.
- `backend/app/schemas/`: Pydantic request/response contracts.
- `backend/app/services/`: business rules, transactions, validation, inventory changes, audit snapshots, and reporting queries.
- `backend/app/models/`: SQLAlchemy tables and enums.
- `backend/app/database.py`: engine, session factory, declarative base, and request-scoped DB dependency.
- `backend/app/core/`: environment settings, permission catalog, password hashing, and token helpers.

### Frontend

- `frontend/src/App.tsx`: authenticated route map and route-level permission guards.
- `frontend/src/auth/AuthContext.tsx`: login lifecycle, current user, expiry handling, and permission lookup.
- `frontend/src/api/client.ts`: typed REST client, Bearer-token injection, 12-second timeout, and 401 expiry event.
- `frontend/src/pages/`: dashboard, customers, products/categories, invoice list/form/detail, reports, sold-products report, login, forbidden page, and access control.
- `frontend/src/components/`: layout, modal, receipt, status, date range, toast, empty state, and protected-route building blocks.
- `frontend/src/types.ts`: shared frontend domain/API types.
- `frontend/src/styles.css`: application and print styling.

### Main data model

- Customers, products, product categories, and invoices use soft deletion.
- A product belongs optionally to a category and carries sale price, cost price, unit, status, and current stock quantity.
- An invoice belongs optionally to a customer and owns items, extra charges, and history entries.
- Invoice items retain product snapshots so later catalog edits do not rewrite historical sales data.
- Invoice codes use `HD-YYMMDD-NNN`; `invoice_code_sequences` coordinates the daily sequence and row locking is used while reserving codes.
- Users can have multiple roles; roles can have multiple permissions. Login sessions are stored as hashed opaque tokens with expiry.

## 3. Important technical decisions and invariants

1. **Layered backend:** routers remain thin; services own domain behavior and commits/rollbacks.
2. **MySQL is the supported database:** configuration defaults to a PyMySQL MySQL URL and startup compatibility SQL uses MySQL syntax.
3. **Invoice lifecycle is `created` or `cancelled`:** a newly created invoice immediately reduces stock. Cancelling or soft-deleting an active invoice restores stock. Cancelled invoices cannot be edited and are excluded from sales reports.
4. **Invoice customer and sale time are immutable during edit:** the service rejects changes to those values.
5. **Auditability:** create, update, cancel, and delete-related invoice changes write before/after snapshots to `invoice_history`, including actor and reason when supplied.
6. **Soft deletion:** operational lists normally exclude deleted records while preserving relational and historical data.
7. **Permission enforcement is server-side:** frontend route protection is only a UX layer; FastAPI dependencies remain authoritative.
8. **Authentication:** passwords use PBKDF2-SHA256 with per-password salt. Random session tokens are returned once, SHA-256 hashed in the database, valid for 24 hours, and revocable on logout.
9. **Bootstrap behavior:** startup synchronizes the permission catalog, creates the full-access system role, creates/repairs the `admin` account, and seeds extra-charge settings.
10. **Schema evolution is currently startup-driven:** `create_all()` plus explicit compatibility ALTER/UPDATE statements handle known older schemas. This is a temporary MVP approach, not a complete migration strategy.

## 4. Implemented and completed

### Platform and access control

- FastAPI API, React/Vite SPA, MySQL database, and Docker Compose development stack.
- Login, logout, current-user lookup, token expiry handling, and inactive-user rejection.
- Permission catalog; role CRUD; user CRUD/deactivation; multi-role assignment.
- Protection against editing the system role, removing the last active administrator, and self-deactivation.
- Frontend route/menu permission handling and a forbidden page.

### Catalog and customers

- Customer create/read/update/soft-delete and search.
- Product category create/read/update/soft-delete.
- Product create/read/update/soft-delete and search.
- Product unit, pricing, cost, status, category, and stock fields.

### Sales and inventory

- Invoice list, creation, detail, edit, cancel, soft delete, print payload, and history retrieval.
- Daily sequential invoice code generation and uniqueness handling.
- Product snapshot fields on invoice lines.
- Totals for subtotal, configurable shipping/packing/other charges, and final amount.
- Stock deduction on sale, reconciliation on edit, and restoration on cancellation/deletion.
- Invoice receipt UI with Hana logo and barcode rendering.
- Current invoice state simplified to `created` and `cancelled`.

### Dashboard and reports

- Dashboard UI based on current customers, products, and invoices.
- General reports page.
- Sold-products report with optional date range, excluding cancelled/deleted invoices.

## 5. Known gaps, risks, and recommended next work

Priority is an engineering recommendation inferred from the current repository, not a committed roadmap.

### P0 — before real production use

- Replace the default `admin/admin` bootstrap credential with a secure first-run or environment-secret flow; rotate any existing persistent deployment immediately.
- Introduce Alembic (or an equivalent controlled migration system). Move startup `ALTER TABLE` and data conversions into versioned, repeatable migrations with backup/rollback instructions.
- Add automated tests for authentication/RBAC and invoice transaction invariants, especially concurrent invoice-code allocation, insufficient/negative stock policy, edit reconciliation, cancellation, deletion, totals, and audit history.
- Define production secrets, allowed CORS origins, HTTPS/reverse proxy, database backup/restore, log retention, and a non-development frontend/API deployment strategy.

### P1 — correctness and maintainability

- Add CI that installs locked dependencies, builds the frontend, compiles/tests the backend, and validates Docker Compose.
- Add lint/format/type-check tooling with repository scripts (for example Ruff for Python and ESLint/Prettier for TypeScript).
- Reconcile `docs/database_schema.md` with the current code. It still documents legacy invoice statuses and omits newer authentication/RBAC/session fields.
- Review inventory concurrency. Invoice code reservation uses row locking, but product stock updates should also have explicit concurrency tests and, if required, product-row locking or atomic guarded updates.
- Define and enforce the business policy for selling beyond available stock; the current service adjusts quantities but no explicit non-negative-stock rule is documented.
- Add pagination and stable limits to list endpoints before datasets grow.
- Standardize Vietnamese/English API error messages and verify all tracked text files remain UTF-8.

### P2 — product follow-up

- Clarify whether reports require export, tax/payment fields, returns/refunds, cash shifts, supplier/purchase flows, or multi-store inventory.
- Add browser-level smoke tests for login, permissions, sales flow, printing, and mobile/responsive layouts.
- Review accessibility and keyboard-only behavior in dense POS and multi-select role forms.

## 6. Build, run, and verification commands

### Full stack with Docker

```powershell
docker compose up --build
```

Useful checks:

```powershell
docker compose config --quiet
docker compose ps
docker compose logs api
docker compose logs frontend
```

Stop containers without deleting the MySQL volume:

```powershell
docker compose down
```

Do not add `-v` unless intentionally deleting local database data.

### Backend locally

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Syntax/import compilation check from the repository root:

```powershell
python -m compileall -q backend/app
```

Health and API documentation:

- `GET http://localhost:8000/health`
- `http://localhost:8000/docs`

### Frontend locally

```powershell
cd frontend
npm ci
npm run dev
```

Production build/type check:

```powershell
cd frontend
npm run build
```

There are currently no `test` or `lint` scripts in `frontend/package.json`, and no backend test configuration is tracked.

## 7. Environment and operational notes

- Backend settings: `APP_NAME`, `API_PREFIX`, `DATABASE_URL`, and `CORS_ORIGINS`; see `backend/.env.example`.
- Frontend API setting: `VITE_API_BASE_URL`; Compose sets it to `http://localhost:8000/api`.
- Compose credentials are development defaults (`hana` / `hana_password`, root password `root_password`). Do not reuse them in production.
- The MySQL data volume is named `mysql_data` by Compose and persists across ordinary `docker compose down/up` cycles.
- The browser token key is `hana-access-token`.
- Default development login after first initialization is `admin` / `admin`; change it immediately.

## 8. Handoff maintenance

When handing work to another Codex session or machine:

1. Commit and push code plus any updates to this document.
2. Record the new baseline commit and review date at the top.
3. Move completed items into the implemented section and add newly discovered risks with evidence.
4. Do not copy `~/.codex`, auth files, tokens, `.env`, or database contents into Git.
5. In the next session, ask Codex to read `AGENTS.md` and this file before changing code.

