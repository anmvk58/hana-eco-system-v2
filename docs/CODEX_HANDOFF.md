# Codex Project Handoff

Last reviewed: 2026-08-01
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
- `backend/app/api/routers/`: HTTP endpoints grouped by access control, customers, product categories, products, invoices, shippers, shipping claims, extra-charge settings, and reports.
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
- `frontend/index.html`: mobile viewport starts at 115% scale to make touch controls and dense POS content easier to operate on iPhone-sized screens while preserving user zoom.

### Main data model

- Customers, products, product categories, and invoices use soft deletion.
- A product belongs optionally to a category and carries sale price, cost price, unit, status, and current stock quantity.
- An invoice belongs optionally to a customer and owns items, extra charges, and history entries.
- Invoice items retain product snapshots so later catalog edits do not rewrite historical sales data.
- Invoice codes use `HD-YYMMDD-NNN`; `invoice_code_sequences` coordinates the daily sequence and row locking is used while reserving codes.
- Users can have multiple roles; roles can have multiple permissions. Login sessions are stored as hashed opaque tokens with expiry.
- Internal shippers have a one-to-one login account/profile. Invoice delivery audit is represented separately from invoice lifecycle status by the nullable label `retail`, `internal_shipper`, or `external_shipper`; `NULL` means not audited yet.

## 3. Important technical decisions and invariants

1. **Layered backend:** routers remain thin; services own domain behavior and commits/rollbacks.
2. **MySQL is the supported database:** configuration defaults to a PyMySQL MySQL URL and startup compatibility SQL uses MySQL syntax.
3. **Invoice lifecycle is `created`, `completed`, or `cancelled`:** a newly created invoice immediately reduces stock; internal delivery confirmation moves it to `completed`. Created and completed invoices remain included in sales/dashboard totals. Completed and cancelled invoices cannot be edited; cancelling or soft-deleting a stock-affecting invoice restores stock.
4. **Invoice customer and sale time are immutable during edit:** the service rejects changes to those values.
5. **Auditability:** create, update, cancel, and delete-related invoice changes write before/after snapshots to `invoice_history`, including actor and reason when supplied.
6. **Soft deletion:** operational lists normally exclude deleted records while preserving relational and historical data.
7. **Permission enforcement is server-side:** frontend route protection is only a UX layer; FastAPI dependencies remain authoritative.
8. **Authentication:** passwords use PBKDF2-SHA256 with per-password salt. Random session tokens are returned once, SHA-256 hashed in the database, valid for 24 hours, and revocable on logout.
9. **Bootstrap behavior:** startup synchronizes the permission catalog, creates the full-access system role, creates/repairs the `admin` account, and seeds extra-charge settings.
10. **Schema evolution is currently startup-driven:** `create_all()` plus explicit compatibility ALTER/UPDATE statements handle known older schemas. This is a temporary MVP approach, not a complete migration strategy.
11. **Delivery audit:** an invoice becomes audited only after receiving exactly one delivery label. `Ship Ruột` is assigned atomically when an active internal shipper claims an eligible invoice; staff can assign `Khách lẻ` or `Ship Ngoài`.
12. **Daily shipping queue:** eligibility is fixed to non-deleted, non-cancelled, unaudited invoices whose `created_at` falls within the current Vietnam calendar day. Row locking prevents two shippers from claiming the same invoice.
13. **Claimed-shipment history:** a shipper can only query invoices assigned to their own active shipper profile. The inclusive date-range filter is based on `audited_at` in the Vietnam timezone, defaults both endpoints to today in the UI, includes cancelled invoices for operational visibility, and excludes soft-deleted invoices.
14. **Delivery confirmation:** delivery completion stores `delivered_at` and `delivered_by_user_id` and atomically transitions invoice status from `created` to `completed`. Only the active internal shipper assigned to a non-cancelled invoice may confirm delivery; the update uses a row lock, rejects repeat confirmation, and writes invoice history in the same transaction.

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
- Sales invoices can be marked as paid by bank transfer during creation or edit. The flag is included in invoice history and receipts; internal shippers see a prominent “Đã thanh toán – không thu tiền khách” state instead of a collection amount, and prepaid invoices are excluded from the received-orders “Tổng COD” summary.
- Invoice list filtering (status, sale-date range, invoice code, and customer phone) and backend pagination are persisted in the URL, including page-size selection and return navigation from invoice detail. The API returns page metadata, orders invoices by creation time descending, and derives an edited/not-edited indicator from invoice history without treating cancellation alone as an edit.
- Daily sequential invoice code generation and uniqueness handling.
- Product snapshot fields on invoice lines.
- Totals for subtotal, configurable shipping/packing/other charges, and final amount.
- Stock deduction on sale, reconciliation on edit, and restoration on cancellation/deletion.
- Invoice receipt UI with Hana logo and barcode rendering.
- Invoice state is `created`, `completed`, or `cancelled`; shipper delivery confirmation is the only workflow that moves an invoice to `completed`.
- Invoice audit labels are visible in the invoice list/detail. Staff with `invoices.audit` can mark an unaudited invoice as `Khách lẻ` or `Ship Ngoài`.
- Staff with `shipping.manage` have a dedicated “Quản lý đơn ship” screen listing valid unaudited invoices by creation-date range in the Vietnam timezone; both dates default to today. Its desktop workspace is split between available invoices and the handover queue (stacked on mobile); selecting an invoice moves it between the two lists, and typing/scanning an invoice code followed by Enter queues it directly. Staff can atomically mark queued invoices as `Khách lẻ`, or hand them to an external shipper with advance method (`transfer`, `cash`, or `mixed`), actual transfer/cash amounts, and the actual shipping fee. The external shipper advance is calculated as selected COD total minus the shipping fee; transferred invoices are excluded from that COD total, and a negative result is allowed. The handover is written to every invoice snapshot/history, and concurrent changes reject the entire selected batch.
- Internal shipper profiles and login accounts can be created, updated, activated, and deactivated from the Shipper management page.
- The system-managed `Shipper nội bộ` role grants only `shipping.claim`. After login, a shipper is routed directly to “Nhận đơn ship”, where they can select one or more currently eligible invoices and claim them atomically as `Ship Ruột`.
- Shippers have a responsive “Đơn đã nhận” screen with an invoice-list-style date-range filter (today by default), own-account data isolation, received-time/status visibility, and order/payment summaries for the selected range.
- On “Đơn đã nhận”, the assigned shipper can quickly filter received orders with full-width, color-coded controls for all, in-delivery, delivered, or cancelled states. Mobile card backgrounds also reflect state: pale yellow for in-delivery, pale green for delivered, and muted red for cancelled. Cards keep customer, phone, code, and address prominent while combining the compact payment/COD state and delivery/call actions into a single footer row. The call action opens the device dialer and is disabled when no number exists. Delivery completion requires a confirmation modal showing the invoice code, customer, delivery address, and payment total; successful confirmation has immediate animation and toast feedback.

### Dashboard and reports

- Dashboard summary API performs database-side counts, sums, product rankings, revenue time buckets, and recent-invoice lookup for today, 7-day, 30-day, and 12-month periods; the Dashboard UI renders this compact aggregate response.
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
- Add pagination and stable limits to the remaining non-invoice list endpoints before datasets grow.
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
- Frontend API setting: `VITE_API_BASE_URL`. When it is not set, the browser preserves the current hostname and calls port `8000` (for example, a page opened at `http://192.168.1.12:5173` calls `http://192.168.1.12:8000/api`). Development Compose allows frontend origins on `192.168.x.x:5173` through a scoped CORS regex, so ordinary DHCP address changes do not require another config edit.
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

