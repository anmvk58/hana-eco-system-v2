# Codex Project Handoff

Last reviewed: 2026-08-25
Baseline commit when reviewed: `1b0e36f` (`master`)  
Project: Hana POS MVP

## 1. Current objective and product scope

Hana POS is a browser-based POS and lightweight management system inspired by a reduced KiotViet-style workflow. The implemented scope covers authentication and authorization, customers, product categories, products and inventory, sales invoices, configurable extra charges, invoice printing, dashboards, and sold-product reporting.

The tracked Docker Compose stack is oriented toward a single-host production deployment through Cloudflare Tunnel. Operational hardening such as secure bootstrap credentials, backups, migrations, and log retention is still required before relying on it for critical production data.

## 2. Architecture

### Runtime topology

```text
Browser
   |
   | HTTPS on the public hostname
   v
Cloudflare edge -> outbound-only cloudflared connector
   |
   v
Nginx (:80, static React bundle)
   |
   | /api and /health
   v
FastAPI (:8000) -> MySQL 8.4 (:3306)
```

Only the Cloudflare Tunnel connector is public-facing. Frontend and API ports are available only on the Compose network. MySQL is additionally bound to the configurable host loopback port `127.0.0.1:${MYSQL_EXPOSED_PORT:-3306}` for host-side administration; it is not reachable through LAN or public interfaces.

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
- `frontend/index.html`: mobile viewport uses the standard 100% initial scale (`initial-scale=1.0`) while preserving user zoom. Mobile readability is handled with a dedicated typography media query instead of viewport scaling: common content/table text is at least 14px, controls use 14–16px (inputs remain 16px to avoid iOS focus zoom), and secondary labels use 11–12px.

### Main data model

- Customers, products, product categories, and invoices use soft deletion.
- A product belongs optionally to a category and carries sale price, cost price, unit, status, current stock quantity, and quick-selection display/order settings.
- An invoice belongs optionally to a customer and owns items, extra charges, and history entries.
- External-shipper handovers are grouped into persistent batch records with finance details and membership rows that retain add/remove history.
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

- FastAPI API, React/Vite SPA, MySQL database, and a production-oriented Docker Compose stack. The frontend image uses a Node build stage and serves the resulting static bundle through Nginx; Nginx handles SPA fallback and proxies same-origin `/api` calls. A remotely managed Cloudflare Tunnel publishes the frontend without inbound host ports or a public origin IP.
- `docker-compose.local.yml` provides a development stack without Cloudflare or Nginx: Vite is published at `127.0.0.1:5173`, FastAPI at `127.0.0.1:8000`, and MySQL at `127.0.0.1:3306`. Frontend/backend sources are bind-mounted for hot reload. It deliberately reuses the production Compose MySQL volume `hanaecosystemv2_mysql_data` and the root `.env` database credentials, so the production and local MySQL containers must never run concurrently.
- Login, logout, current-user lookup, token expiry handling, and inactive-user rejection.
- Permission catalog; role CRUD; user CRUD/deactivation; multi-role assignment.
- Protection against editing the system role, removing the last active administrator, and self-deactivation.
- Frontend route/menu permission handling and a forbidden page.
- Browser tab titles follow the navigation labels using `Tên mục | Hana POS`, with dedicated titles for login, invoice detail/edit, and forbidden screens. `Layout` derives titles from the existing navigation items and a shared `usePageTitle` hook updates the document title on navigation and resets it on unmount.
- “Người dùng & Role” is a collapsible menu group. Every authenticated user can open “Đổi mật khẩu”, which requires the current password, rejects reuse of the existing password, keeps the active session, and revokes that user's other sessions. Administrators can reset another user's forgotten password from the user table through the dedicated `users.reset_password` permission; reset revokes every session belonging to the target user. General `users.update` no longer changes passwords, keeping profile/role editing separate from credential administration. Existing roles with `users.update` receive the new reset permission once during the upgrade because they previously had equivalent password-reset capability through the general edit form; it can be removed independently afterward.

### Catalog and customers

- Customer create/read/update/soft-delete and search.
- `backend/init_data/import_customers.py` provides a transaction-safe `.xlsx` customer importer for the `code`, `name`, `phone`, and `address` columns. Its `main()` is intentionally an editable configuration block containing the file `Path`, direct MySQL connection fields, reflected target-table name, sheet, and dry-run switch; it does not depend on application database settings. It validates required values, lengths, and duplicate codes/phones both within the workbook and against the target table. Code and phone values have all whitespace removed and must begin with `0` (phone may be null). It explicitly fills UTC `created_at`/`updated_at` timestamps before insert.
- `backend/init_data/import_products_via_api.py` imports a small `.xlsx` product dataset through the authenticated product API instead of direct SQL. Its editable `main()` holds the file path, API URL/account, sheet, and dry-run switch. Required columns are `code`, `name`, and `unit`; optional category ID/name, prices, stock, and status are validated and normalized. Dry-run preflights authentication, category references, and duplicate product codes; real runs create one API transaction per product and report partial progress if an unexpected later request fails.
- Product category create/read/update/soft-delete.
- Product create/read/update/soft-delete and search.
- Product consumers that need a complete catalog now paginate the `/products` endpoint in 200-row chunks until exhausted. The sales form and product-management page use this full-list client method, preventing their local product search from being limited to the backend endpoint's default first 50 rows.
- The sales form is gated while its complete paginated product catalog and extra-charge settings load: form controls are not rendered until both requests succeed. A failed preload remains on a blocking error state with an explicit retry action, preventing invoice interaction against a partial or empty catalog.
- After a customer is selected on the sales form, users with `customers.update` see a `Sửa nhanh` action beside the selected value. It opens a padded responsive modal for updating the customer's name, address, and note without leaving the invoice draft. The phone number is displayed as a disabled reference field and is deliberately omitted from the update payload; the saved customer is refreshed immediately in the current invoice form and local search results.
- Product unit, pricing, cost, status, category, and stock fields. Quick-product placement is configured directly from empty slots on the sales form by users with `products.update`.

### Sales and inventory

- The sales form uses a 65/35 desktop layout: customer/product entry and invoice lines on the left, and a 20-slot quick-product grid arranged in four columns and five rows on the right. Compact product tiles show only a 16px regular-weight product name and a bold 17px violet secondary-color numeric price without a currency suffix. The remove control sits at the bottom right, with the price reserving its space, so long names can use the full tile width. Empty slots use muted gray regular text without slot numbers. Users with `products.update` can click an empty slot to assign an active product or remove an assignment directly on this screen; the complete slot layout is saved atomically. The grid is memoized so typing in the main product search does not render it again. A compact section below the selected lines provides a 48px invoice-note textarea on the left and a 20px product subtotal with the count of distinct product types on the right. Increasing the quantity of an existing product does not increase this count. The note is no longer duplicated in checkout. Only the Thanh toán button sits at the bottom right below the quick-product grid; it opens the checkout dialog while preserving the payment draft. Screens below 900px stack the two areas. Packing and other-charge inputs are hidden in the form; existing charge data remains preserved.
- The sales form uses a 65/35 desktop layout: customer/product entry and invoice lines on the left, and a 20-slot quick-product grid arranged in four columns and five rows on the right. Compact product tiles show only a 16px regular-weight product name and a bold 17px violet secondary-color numeric price without a currency suffix. The remove control sits at the bottom right, with the price reserving its space, so long names can use the full tile width. Empty slots use muted gray regular text without slot numbers. Users with `products.update` can click an empty slot to assign an active product or remove an assignment directly on this screen; the complete slot layout is saved atomically. The grid is memoized so typing in the main product search does not render it again. A compact section below the selected lines provides a 48px invoice-note textarea on the left and a 20px product subtotal with the count of distinct product types on the right. Increasing the quantity of an existing product does not increase this count. The note is no longer duplicated in checkout. Only the Thanh toán button sits at the bottom right below the quick-product grid; it opens the checkout dialog while preserving the payment draft. Screens below 900px stack the two areas. Packing and other-charge inputs are hidden in the form; existing charge data remains preserved.
- Product-search suggestions display the product code in regular text, the product name in the primary teal color, and a bold violet secondary-color numeric price without a currency suffix.
- Quantity and unit-price inputs select their full value on focus and use the same rounded teal focus ring as the main product search.

- Invoice list, creation, detail, edit, cancel, soft delete, print payload, and history retrieval.
- Sales invoices can be marked as paid by bank transfer during creation or edit. The flag is included in invoice history and receipts; internal shippers see a prominent “Đã thanh toán – không thu tiền khách” state instead of a collection amount, and prepaid invoices are excluded from the received-orders “Tổng COD” summary.
- Invoice list filtering (status, sale-date range, invoice code, and customer phone) and backend pagination are persisted in the URL, including page-size selection and return navigation from invoice detail. The default status filter is `Đang hiệu lực`, which includes created/completed invoices while excluding cancelled ones through the API's `exclude_cancelled` flag; `Tất cả trạng thái` remains available and is explicitly persisted as `status=all`. A live result-count line immediately below the filter toolbar displays the backend total for the current filter rather than only the current page size. The API returns page metadata, orders invoices by creation time descending, and derives an edited/not-edited indicator from invoice history without treating cancellation alone as an edit.
- Daily sequential invoice code generation and uniqueness handling.
- Invoice codes derive their `YYMMDD` date key from Vietnam local time. Naive `sold_at` values are treated as Vietnam-local (matching the sales form), timezone-aware values are converted to `Asia/Ho_Chi_Minh`, and missing values default to the current Vietnam-local time; this prevents invoices created between midnight and 07:00 Vietnam time from receiving the previous UTC date.
- Time storage has two explicit semantics: business wall-clock fields such as `invoices.sold_at` are stored as naive Vietnam-local datetimes, while system event timestamps (`created_at`, `updated_at`, `audited_at`, `delivered_at`, handover/collection timestamps, and auth expiry) remain naive UTC. Date filters over UTC event fields must convert Vietnam-local boundaries with `time_service`; dashboard creation counts follow this rule. The frontend uses `dateTime` for Vietnam-local business fields and `utcDateTime` for UTC event fields, with both formatters pinned to `Asia/Ho_Chi_Minh` so client-machine timezone does not alter display.
- Product snapshot fields on invoice lines.
- Totals for subtotal, configurable shipping/packing/other charges, and final amount.
- Stock deduction on sale, reconciliation on edit, and restoration on cancellation/deletion.
- Invoice receipt UI with Hana logo and barcode rendering. Printing from invoice detail hides management-only UI such as the detail header, Audit panel, history, alerts, modals, and toast notifications so only the 80mm receipt is sent to print.
- The 80mm receipt pins its two customer-care note paragraphs to 11px so mobile typography rules cannot enlarge them in print. Customer name/phone/address lines render at 13px, while the invoice note line renders at 14px consistently in preview and print.
- Invoice state is `created`, `completed`, or `cancelled`; shipper delivery confirmation is the only workflow that moves an invoice to `completed`.
- Invoice audit labels are visible in the invoice list/detail. Staff with `invoices.audit` can mark an unaudited invoice as `Khách lẻ` or `Ship Ngoài`.
- Staff with `invoices.audit` can undo an accidental `Khách lẻ` or direct `Ship Ngoài` label from the invoice-detail Audit panel through a confirmation modal with a required reason. The backend locks the invoice, clears Audit/external handover fields, and records a before/after invoice-history snapshot. Rollback is rejected for cancelled invoices, internal-shipper assignments, invoices already collected/reconciled, or invoices still belonging to an active external handover batch; those shipper assignments must use their dedicated recall/batch-management workflows.
- Staff with `shipping.manage` have a dedicated “Quản lý đơn ship” menu with “Bàn giao đơn” and “Bảng kê Ship Ngoài” submenus. The handover workspace lists valid unaudited invoices by creation-date range in the Vietnam timezone; both dates default to today. Its desktop workspace is split between available invoices and the handover queue (stacked on mobile); selecting an invoice moves it between the two lists, and typing/scanning an invoice code followed by Enter queues it directly. Staff can atomically mark queued invoices as `Khách lẻ`, or hand them to an external shipper with advance method (`transfer`, `cash`, or `mixed`), actual transfer/cash amounts, and the actual shipping fee. The external shipper advance is calculated as selected COD total minus the shipping fee; transferred invoices are excluded from that COD total, and a negative result is allowed. The handover modal defaults to bank transfer and pre-fills the actual transfer amount from the calculated shipper advance, updating it as the shipping fee changes. Each external handover creates a persistent batch; the batch list supports an optional Vietnam-date range (default today, clearing the range returns all batches), detail viewing, adding/removing eligible invoices, changing advance method/actual amounts, and cancelling a whole handover. The batch update modal lists only current member invoices; another eligible unaudited invoice is added by entering/scanning its code and pressing Enter, with a 1–4 digit sequence expanded by the frontend to the current-day `HDYYMMDDNNNN` code. Batch edits and cancellation update invoice audit state and invoice history in one transaction, while membership rows retain removed/cancelled entries. Legacy external handovers are grouped into batches during startup. Concurrent eligibility changes reject the entire edit.
- The “Quản lý đơn ship” menu now also has a dedicated “Bàn giao Ship Nội Bộ” screen for staff with `shipping.manage`. It reuses the unaudited-invoice date range, scan/code entry, selection queue, and responsive handover workspace, but only allows choosing an active internal shipper. The batch assignment locks and validates all selected invoices, applies the `internal_shipper` audit label and shipper assignment atomically, and records the managing staff member plus selected shipper in invoice history. Assigned invoices immediately appear in that shipper's “Đơn đã nhận” flow. A sibling tab lists all internal-shipper assignments in the selected handover-date range with search, a current-shipper filter derived from the assignments (including inactive shippers that still hold orders), customer delivery addresses, and delivery/payment states. Managers can recall an unsettled assignment: the transaction clears the audit/shipper/delivery fields, restores a delivered invoice from `completed` to `created`, and records the actor and optional reason in invoice history, after which the invoice is unaudited and can be handed over again or labeled retail. Recall is blocked for cancelled invoices and invoices already present in an immutable internal COD collection or retail/transfer reconciliation record.
- Staff with `shipping.manage` have a separate top-level “Quản lý tiền COD” menu. Its “Thu tiền Ship Nội Bộ” screen filters by exactly one Vietnam handover date and focuses only on outstanding daily debt; the shipper debt area uses a dense comparison table on desktop for scanning 10–15 debtors and switches to action-friendly cards on mobile, while deliberately omitting last-collection metadata. Collection history is separated into the sibling “Lịch sử thu tiền COD” screen with date-range filtering, keyword search, aggregate cards, and session detail viewing. COD debt is created immediately when an invoice is handed to an internal shipper; delivery confirmation is not required. Debt rows/cards show only shippers with uncollected COD and distinguish total handed-over orders, total COD orders, transferred orders excluded from COD, pending COD orders, and the amount still due. The collection modal summarizes total handed-over orders, pending COD orders, and amount due, and lists every invoice handed to that shipper on the selected day with explicit `Thu COD`, `Đã chuyển khoản`, or already-collected COD status; transferred invoices remain visible for reconciliation but are not submitted into the collection session. Staff can create an immutable full-payment collection session for the outstanding daily debt. Eligible invoices are non-cancelled, non-deleted `internal_shipper` invoices handed over on the selected day and not paid by transfer. Session items snapshot invoice code, customer, handover time, optional delivery time, and COD amount; a global unique constraint on invoice ID prevents duplicate collection under concurrent requests, and the submitted invoice set must still match the current daily debt. Inactive shippers remain visible when they still owe COD so outstanding money can be settled.
- The “Quản lý tiền COD” menu also includes “Kiểm kê đơn”. Access to its route, menu item, reads, and mutations is isolated behind `order_reconciliation.manage`, independently of `shipping.manage`; when this permission was introduced, existing roles with ship-management access received it once for backward compatibility and can subsequently have it removed. All three tabs share an invoice-style date-range control, defaulting from/to to the current Vietnam date; clearing it returns all dates and the selected range is persisted in the URL. Invoice tabs filter by sale date, while the external-batch tab filters by handover date. Its first tab lists every active, non-cancelled invoice without an audit label in that range, supports instant search across invoice code/customer/phone/address, lets staff assign `Khách lẻ`, and links directly to the internal or general shipper handover workspaces. Its second tab is the union of active `Khách lẻ` invoices and active bank-transfer invoices that have already been audited as `Khách lẻ`, `Ship nội bộ`, or `Ship ngoài`; unaudited transfer invoices remain only in the first tab. It provides pending/collected/all filters and per-invoice collection confirmation. The retail-collection confirmation modal has its own responsive padded content and action layout instead of inheriting the unpadded base modal body. Collection records are immutable snapshots of invoice code, customer, amount, payment method, collector, collection time, and note; a unique invoice constraint and row locking prevent duplicate confirmation. Transfer invoices are reconciled as money already received by the shop and remain excluded from internal shipper COD debt. Desktop uses dense tables and mobile uses action-oriented cards.
- A third “Kiểm kê Ship ngoài” tab uses the same handover-date range and lists active external handover batches with pending/reconciled/all filters. Each row/card compares the expected shipper advance with the actual transfer-plus-cash amount and shows batch method, active invoice count, handover actor, and time. The confirmation modal shows total actual receipts plus an explicit transfer/cash breakdown for pre-confirmation checking. Confirmation creates an immutable batch-level reconciliation snapshot with batch code, active invoice count, expected and received amounts, method, actor, time, and note. Row locking plus a unique batch constraint prevents duplicate reconciliation; cancelled batches cannot be reconciled and are omitted from this tab. Once reconciliation exists, the external batch is immutable: backend update/cancel transactions reject it under the batch lock, and the batch-list UI shows `Đã kiểm kê` while removing edit/cancel actions.
- Internal shipper profiles and login accounts can be created, updated, activated, and deactivated from the Shipper management page.
- The system-managed `Shipper nội bộ` role grants only `shipping.claim`. After login, a shipper is routed directly to “Nhận đơn ship”, where they can select one or more currently eligible invoices and claim them atomically as `Ship Ruột`. Claiming is a two-step action: the primary button opens a responsive confirmation modal summarizing selected order count, COD count/amount, transferred-order count, and each order's customer/address/payment state; only the modal confirmation calls the claim API. The claim list has an instant, accent-insensitive text filter across invoice code, customer name, phone, and address; select-all applies only to visible matches while selections made under other searches are preserved.
- Shippers have a responsive “Đơn đã nhận” screen with an invoice-list-style date-range filter (today by default), own-account data isolation, received-time/status visibility, and order/payment summaries for the selected range.
- On “Đơn đã nhận”, the assigned shipper can quickly filter received orders with full-width, color-coded controls for all, in-delivery, delivered, or cancelled states. Mobile card backgrounds also reflect state: pale yellow for in-delivery, pale green for delivered, and muted red for cancelled. Cards keep customer, phone, code, and address prominent while combining the compact payment/COD state and delivery/call actions into a single footer row. The call action opens the device dialer and is disabled when no number exists. Delivery completion requires a confirmation modal showing the invoice code, customer, delivery address, and payment total; successful confirmation has immediate animation and toast feedback.

### Dashboard and reports

- Dashboard summary API accepts an inclusive sale-date range (defaulting to the current Vietnam date) and now returns only invoice counts, revenue sums, and adaptive revenue buckets. Product rankings are isolated in `/dashboard/top-products`, which accepts an independent date range and a `quantity` or `revenue` metric; customer rankings are provided by `/dashboard/top-customers` and sum active invoice totals for identified customers. Audit totals, top-10 internal-shipper order counts, and invoice reconciliation totals are isolated in `/dashboard/order-status-charts`; the three donut charts share one independent preset filter inside a single status card. The summary response deliberately omits customer-creation counting, recent invoice records, customer relationships, product rankings, and order-status charts. Audit and reconciliation charts exclude cancelled/deleted invoices; an invoice is reconciled when it belongs to an immutable retail/transfer collection, internal COD collection, or active reconciled external-handover batch. The Dashboard UI offers `Hôm nay`, `Hôm qua`, `7 ngày qua`, `Tháng này`, and a custom date-range picker for the general reports. The Top 10 product, customer, and order-status cards have independent preset selectors; the product card can switch between net revenue and quantity, and each selection refreshes only its own card. Its summary area uses two balanced cards: product revenue includes the created-invoice count, while other receipts remain separate. The status card uses three equal-width donut regions on desktop and stacks them without horizontal overflow on smaller screens.
- General reports page includes both created and completed invoices while excluding cancelled invoices, matching the Dashboard's active-invoice scope.
- Sold-products report with optional date range, excluding cancelled/deleted invoices.

## 5. Known gaps, risks, and recommended next work

Priority is an engineering recommendation inferred from the current repository, not a committed roadmap.

### P0 — before real production use

- Replace the default `admin/admin` bootstrap credential with a secure first-run or environment-secret flow; rotate any existing persistent deployment immediately.
- Introduce Alembic (or an equivalent controlled migration system). Move startup `ALTER TABLE` and data conversions into versioned, repeatable migrations with backup/rollback instructions.
- Add automated tests for authentication/RBAC and invoice transaction invariants, especially concurrent invoice-code allocation, insufficient/negative stock policy, edit reconciliation, cancellation, deletion, totals, and audit history.
- Define secret storage beyond the host `.env` file, database backup/restore, centralized log retention, monitoring, and a documented Cloudflare Tunnel token-rotation procedure. Compose limits each service's local `json-file` logs to five 10 MB files, but this is not a durable audit-log solution.

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

Copy `.env.example` to `.env`, set the production hostname, remotely managed Cloudflare Tunnel token, and unique database credentials. In the Cloudflare Tunnel dashboard, configure the Published Application service URL as `http://frontend:80`, then run:

```powershell
docker compose up -d --build
```

Useful checks:

```powershell
docker compose config --quiet
docker compose ps
docker compose logs api
docker compose logs frontend
docker compose logs cloudflared
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

When running the backend directly, health and API documentation remain available at:

- `GET http://localhost:8000/health`
- `http://localhost:8000/docs`

### Full local stack with Docker

First stop the production stack so its MySQL container releases the shared data volume, then run the development stack. A populated root `.env` is required for the shared database credentials, but no Cloudflare Tunnel container is started:

```powershell
docker compose down
docker compose -f docker-compose.local.yml up --build
```

Open `http://localhost:5173`; FastAPI Swagger is available at `http://localhost:8000/docs`. Stop it without deleting local database data using:

```powershell
docker compose -f docker-compose.local.yml down
```

The optional `LOCAL_FRONTEND_PORT`, `LOCAL_API_PORT`, and `LOCAL_MYSQL_PORT` variables override the local host ports. `MYSQL_VOLUME_NAME` can override the shared volume name when the production stack was created with a non-default Compose project name. Do not run two MySQL containers against the same data volume concurrently.

The Compose deployment exposes `/health` through the public application hostname but deliberately does not route FastAPI Swagger paths through Nginx.

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
- Frontend API setting: `VITE_API_BASE_URL`. When it is not set, the browser calls same-origin `/api`; Vite proxies it during local development, while production Nginx proxies it to the Compose API service.
- The root `.env` must define `DOMAIN`, `CLOUDFLARE_TUNNEL_TOKEN`, database credentials, and optionally `MYSQL_EXPOSED_PORT` (default `3306`). `.env.example` contains placeholders only; the tunnel token and real credentials must never be committed. The Cloudflare Published Application must target `http://frontend:80`. Application and root database passwords must be different strong secrets. MySQL is published only on host loopback for local administration, never on all interfaces. Because previously committed credentials must be treated as exposed, rotate them for any existing persistent database rather than only moving their old values into `.env`.
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

