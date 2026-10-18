# Codex Project Handoff

Last reviewed: 2026-09-13
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
- `frontend/src/styles.css`: application and print styling. Shared input-focus tokens match the sales product search (`#68afa6` border, 3px teal halo, 150ms transition); global rules cover editable inputs, textareas, selects, composite search/filter shells, and custom date/chart pickers. Borderless controls use their outer shell for a single ring; disabled/read-only controls are excluded and selected-customer styling is preserved.
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
8. **Authentication:** passwords use PBKDF2-SHA256 with per-password salt. Random session tokens are returned once, SHA-256 hashed in the database, valid for 30 days, and revocable on logout.
9. **Bootstrap behavior:** startup synchronizes the permission catalog, creates the full-access system role, creates/repairs the `admin` account, and seeds extra-charge settings.
10. **Schema evolution is currently startup-driven:** `create_all()` plus explicit compatibility ALTER/UPDATE statements handle known older schemas. This is a temporary MVP approach, not a complete migration strategy.
11. **Delivery audit:** an invoice becomes audited only after receiving exactly one delivery label. `Ship Ruột` is assigned atomically when an active internal shipper claims an eligible invoice; staff can assign `Khách lẻ` or `Ship Ngoài`.
12. **Daily shipping queue:** eligibility is fixed to non-deleted, non-cancelled, unaudited invoices whose `created_at` falls within the current Vietnam calendar day. Row locking prevents two shippers from claiming the same invoice.
13. **Claimed-shipment history:** a shipper can only query invoices assigned to their own active shipper profile. The inclusive date-range filter is based on `audited_at` in the Vietnam timezone, defaults both endpoints to today in the UI, includes cancelled invoices for operational visibility, and excludes soft-deleted invoices.
14. **Delivery confirmation:** delivery completion stores `delivered_at` and `delivered_by_user_id` and atomically transitions invoice status from `created` to `completed`. Only the active internal shipper assigned to a non-cancelled invoice may confirm delivery; the update uses a row lock, rejects repeat confirmation, and writes invoice history in the same transaction.

## 4. Implemented and completed

### Invoice list entry and filters (2026-10-18)

- Searching (button or Enter) clears all three text inputs after capturing the submitted criteria. Applied criteria remain in state and the URL for pagination, refresh, and date/status filtering; changing those filters does not refill the cleared inputs.

- The invoice navigation link opens a new browser context with `target="_blank"`. The invoice list autofocuses its phone filter on mount; customer-name and phone filters share equal flex widths, including a paired row on mobile beneath the invoice-code filter.

### Internal and external collection invoice extra charges (2026-10-18)

- External batch reconciliation modals also show each invoice's `total_extra_charges` in a separate column and mobile detail, using the existing invoice payload.

- Internal COD summary invoice payloads expose the stored `total_extra_charges`. The collection modal shows this value in a separate “Thu khác” column and in mobile invoice cards, including transferred/already-collected orders. This is an informational breakdown of invoice totals; collection amounts and transactions are unchanged.

### Collection confirmation keyboard shortcut (2026-10-18)

- Retail/transfer invoice collection, external batch reconciliation, and internal COD collection modals opt into `Modal.submitOnEnter`. Enter submits the existing form through its enabled explicit submit button, including before an input has focus. Textareas retain newlines, focused buttons/links keep native keyboard behavior, note-settings editing is excluded, held/composing/modified Enter is ignored, and an overlaid transfer dialog blocks the underlying collection shortcut.

### COD collection history presentation (2026-10-16)

- Invoice, customer, product, general-report and sold-product-report lists now share the same table-column header treatment through `standard-list-table`. Their list toolbars and report panel headings also share padded white styling; report headers retain wrapping and invoice code/revision spacing is preserved.

- External handover batch lists also use the shared pale-teal table headers and padded white toolbar, with a labeled action column.

- The same white padded section headings and pale-teal table column headers are shared with internal COD collection and all three order-reconciliation tables. Reconciliation search counts use the matching teal badge; mobile toolbars keep compact padding.

- Collection history now has padded list headings and table cells, distinct summary icon colors, a highlighted COD total, and explicit session-detail buttons. Narrow screens use two-column summary cards and horizontally scrollable history tables. These styles are scoped to history; collection calculations and permissions are unchanged. Frontend production build passes; desktop and 390px layouts were checked in the local browser. The current local database has no collection sessions, so populated rows and the detail dialog still need visual verification with existing session data.

### Customer lookup, SQL reports, and settled-invoice protection (2026-10-16)

- General reports now call `GET /api/reports/summary` with `reports.view`, rather than fetching all invoice pages. Four SQL queries return invoice totals, shipping charges, product revenue/quantity, and Vietnam-calendar daily revenue. Products retain historical code grouping and the latest invoice's name snapshot. Created/completed, soft-delete, date-boundary, Decimal, discount, and charge semantics are preserved; item/charge joins do not multiply invoice totals. The frontend preserves preset filters, instant product-name filtering, and links tied to the last successfully loaded date range.
- Invoice update, cancellation, and soft deletion lock the invoice and reject orders already in retail/transfer collections or internal COD collections with HTTP 409 before changing stock, totals, or history. Direct content mutations also reject active/legacy external handovers: remove an order through an unreconciled batch's handover workflow before editing/cancelling/deleting it, so batch finances cannot become stale. Reconciled batches remain immutable under existing checks. Soft deletion now rolls back failures and uses the same invoice row lock as update/cancel. New sales, uncollected retail edits/cancellation, and ordinary soft deletion preserve their prior behavior.
- Customer substring search retains phone-prefix OR arbitrary name-substring semantics. `customer_name_search` stores normalized suffixes (at least two characters), indexed by `(term, customer_id)` with a separate customer-ID index. A materialized UNION combines indexed phone-prefix and suffix-prefix candidates; the final original LIKE condition verifies exact results under the database collation. MySQL uses `STRAIGHT_JOIN` to drive from candidate IDs rather than scanning all active customers. One-character and include-deleted administrative searches retain the original scan fallback. ORM create/rename/soft-delete updates the suffixes in the same transaction; the standalone XLSX importer also maintains the index. Direct SQL name imports/updates outside that importer must maintain/rebuild this derived index explicitly.
- Startup `ensure_search_indexes` uses a MySQL advisory lock, keyset batches, row locks and a transaction to populate name suffixes once, marked by `2026-10-16-customer-name-suffixes-v1`. It also repairs missing invoice query indexes by column sequence, without duplicating equivalent indexes: `ix_invoices_audit_handover (audit_label, deleted_at, audited_at, id)`, `ix_invoices_shipper_handover (assigned_shipper_id, audit_label, deleted_at, audited_at, id)`, and `ix_invoices_audit_sale (audit_label, deleted_at, sold_at, id)`. The model uses these composites instead of standalone audit/date/delivery indexes; existing standalone indexes are preserved. `delivered_at` has no standalone index because current queries display it or check it after locating an invoice by ID, rather than filtering/sorting large lists by delivery timestamp.
- Deploy API and frontend together. First API startup creates the derived table, populates existing names and creates missing indexes automatically; no manual indexing is needed. This adds name-index storage/write work and can lengthen the first startup. Business records are not rewritten by the backfill. Local MySQL EXPLAIN confirms indexed suffix/phone ranges and PK customer lookups. The new report was compared with the old calculations across all 56 local active invoices; MySQL name CRUD and settled-invoice guard checks used rolled-back fixture data.
- Verification: 63 backend tests, 9 frontend tests, frontend production build, backend/importer compilation, and both Compose configurations passed. Live MySQL comparisons covered 13 customer queries at two page offsets (items and totals), report equivalence, and indexed shipper/COD/audit date-range plans. If rolling back to code that does not maintain suffixes, rebuild the derived name index before re-enabling indexed lookup after redeployment.

### External reconciliation calendar filter (2026-10-11)

- External-shipper reconciliation now filters and orders by `handed_over_at`, converting inclusive Vietnam calendar dates to UTC bounds with an exclusive next-day upper bound. Desktop/mobile display the handover timestamp, and the table labels it “Ngày bàn giao”. This matches the external handover list and prevents early-morning Vietnam handovers from being incorrectly assigned to the previous day by raw UTC comparisons.
- Confirmed the reported batch `BG-261010-0003` was handed over at 2026-10-10 18:34:23 UTC / 2026-10-11 01:34:23 Vietnam time. Existing batch codes and stored timestamps are preserved. Regression coverage includes both midnight boundaries, different creation/handover dates, open ranges, cancelled batches and invalid ranges in `backend/tests/test_external_reconciliation_dates.py`.

### Consistent time storage and calendar filters (2026-10-11)

- All database datetime fields, including `invoices.sold_at`, now store naive UTC. MySQL application sessions explicitly use `+00:00`. API datetime fields and invoice history snapshots serialize as ISO timestamps ending in `Z`. Frontend display, receipts, report grouping, calendar controls and preset dates use `Asia/Ho_Chi_Minh`, independent of browser timezone. New sales submit an explicit UTC instant; legacy API inputs without an offset remain interpreted as Vietnam local time.
- Inclusive Vietnam dates share UTC bounds from `time_service.vietnam_date_conditions`: local midnight is included, the midnight following the final selected day is excluded. Sales, invoice lists, reports, dashboard rankings/charts and invoice reconciliation use `sold_at`; available handover invoices use `created_at`; internal assignments/claimed orders and daily COD debt use `audited_at`; external batches/reconciliation use `handed_over_at`; collection history uses `collected_at`. Clearing historical date ranges removes date restrictions. Dashboard bounded summaries and the daily shipping/COD queues retain their documented business defaults.
- Startup applies `2026-10-11-invoice-sale-times-utc` exactly once under a MySQL advisory lock and one transaction. Original sale times and modified history snapshots are retained in `time_normalization_backups`; `data_migrations` records completion. Existing invoice codes, amounts, stock, revisions and update timestamps are preserved. Deploy API and frontend together; do not run old application code against the converted database. Any rollback must account for new UTC records as well as the backups; do not simply delete the migration marker.
- Verification: 41 backend tests passed; frontend timezone tests cover UTC, Los Angeles, Vietnam and Auckland; frontend production build passed. Live checks covered 15 API list/report endpoints and all 29 migrated invoice sale times. MySQL create/edit/cancel checks verified explicit timestamp round trips, Vietnam invoice date keys, midnight revenue buckets, stock and history, with all fixture data rolled back.

### Quick transfer confirmation (2026-10-09)

- The shared transfer-confirmation action uses an icon-only button sized to the surrounding actions. Invoice lists reuse the same 40px-high, minimum-58px-wide action class and edit styling as View/Edit. Reconciliation and COD collection reuse the compact action class; reconciliation mobile footers match the adjacent 38px-high actions. Its tooltip and accessible label identify the action; confirmation still opens the existing modal.

- `POST /api/invoices/{id}/payment/transfer` confirms full customer transfer independently of item editing, including completed/delivered invoices. It requires `invoices.update` or `order_reconciliation.manage`, locks the invoice, checks expected amount/revision, and writes actor, optional transaction note, and before/after history in one transaction. It preserves stock, items, totals, delivery and audit labels. Repeated confirmation is idempotent.
- General quick confirmation and ordinary invoice edits block external-shipper handovers and settled payments. Inside a pending external reconciliation modal, staff with `order_reconciliation.manage` can use `POST /api/order-reconciliation/external-handover-batches/{batch_id}/invoices/{invoice_id}/payment/transfer`. It locks the active unreconciled batch then its active invoices, checks membership and expected invoice amount/revision, blocks collected/cancelled/deleted orders, records transfer and recalculates the batch advance plus all active invoice advance fields atomically with history. Actual transfer/cash receipts and shipping fee are preserved; negative advance is supported. Repeated transfer confirmation is idempotent. Desktop/mobile refresh the open modal and listing after conversion. Parent reconciliation is disabled while transfer confirmation is open; submitted expected/received amounts guard against concurrent financial changes. Reconciled/cancelled batches remain immutable.
- The redundant “Chuyển khoản đơn đã lưu” lookup was removed from the sales workspace on 2026-10-15, together with its unused component. Invoice rows and reconciliation rows still expose transfer confirmation. Internal COD collection desktop/mobile rows provide the action and reload both shipper totals and the open collection; the last converted COD order disables collection submission. Payment confirmation does not automatically audit or reconcile receipt of money.
- Verification: frontend production build, backend compilation, ten isolated SQLite business-rule tests (`backend/tests/test_transfer_payment.py`), MySQL transaction checks with all fixture data rolled back, and browser inspection of sales lookup/confirmation on a mobile-sized viewport. Existing business orders were not changed during browser verification.

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
- Sales-form customer lookup accepts a phone prefix (at least 5 digits) or a name fragment (at least 2 characters), debounces requests by 300ms, and requests `skip=0, limit=20` from `/customers`. Both customer list endpoints filter by phone prefix OR name substring before pagination, escape literal LIKE metacharacters, preserve name spaces, and exclude deleted customers by default. The frontend uses backend results without phone-only filtering and hides results belonging to a different query. Name searches prefill the new-customer name rather than the phone/code. MySQL's `utf8mb4_0900_ai_ci` name collation supports case/accent-insensitive matching. Keep both pagination arguments explicit: passing `20` as the second client argument skips the first 20 matching customers.
- `Customer.name` declares `index=True`; startup repairs a missing single-column name index without duplication. Arbitrary name-substring lookup now uses the derived suffix index described above because a direct `%name%` B-tree search is not a range scan. Regression checks cover name/phone search, wildcard escaping, soft deletion, pagination, permissions, transactional index synchronization, bulk import, and repeat-safe backfill/index creation.
- `backend/init_data/import_customers.py` provides a transaction-safe `.xlsx` customer importer for the `code`, `name`, `phone`, and `address` columns. Its `main()` is intentionally an editable configuration block containing the file `Path`, direct MySQL connection fields, reflected target-table name, sheet, and dry-run switch; it does not depend on application database settings. It validates required values, lengths, and duplicate codes/phones both within the workbook and against the target table. Code and phone values have all whitespace removed and must begin with `0` (phone may be null). It explicitly fills UTC `created_at`/`updated_at` timestamps before insert.
- `backend/init_data/import_products_via_api.py` imports a small `.xlsx` product dataset through the authenticated product API instead of direct SQL. Its editable `main()` holds the file path, API URL/account, sheet, and dry-run switch. Required columns are `code`, `name`, and `unit`; optional category ID/name, prices, stock, and status are validated and normalized. Dry-run preflights authentication, category references, and duplicate product codes; real runs create one API transaction per product and report partial progress if an unexpected later request fails.
- Product category create/read/update/soft-delete.
- Product create/read/update/soft-delete and search. The product management table paginates its fully loaded product list with 25 rows per page by default and selectable 25/50/100 rows. The customer management table uses backend pagination and fetches only the selected page, with 25 rows per page by default, selectable 25/50/100 rows, and total-count metadata for navigation.
- `ProductModal` is the shared create/edit product form for catalog management and quick creation from sales. It includes category selection, permission-gated quick category creation, status, unit, prices, and stock, with shared responsive styling and in-modal errors. Editing preserves quick-selection settings; saving/category creation prevents duplicate submits and closing during a request. Reset restores the original product values or the prefilled new-product form.
- Quick creation from sales pre-fills an editable product code from the searched name: remove Vietnamese diacritics (including `đ`), trim/collapse whitespace into underscores, and uppercase. The sale-price input receives focus with its initial value selected. Catalog create/edit retains its existing initial code and name focus.
- On the sales and invoice-edit form, an empty product search offers `Thêm mới sản phẩm` to users with `products.create`. Its modal pre-fills the searched name and accepts a code, unit, category, prices, and initial stock through the existing permission-protected product API. Successful creation adds the returned active product to the local catalog and focuses its search result for selection; invoice drafts and lines are preserved. Saving blocks duplicate submits/closing, and duplicate-code errors remain inside the modal.
- Product consumers that need a complete catalog now paginate the `/products` endpoint in 200-row chunks until exhausted. The sales form and product-management page use this full-list client method, preventing their local product search from being limited to the backend endpoint's default first 50 rows.
- The sales form is gated while its complete paginated product catalog and extra-charge settings load: form controls are not rendered until both requests succeed. A failed preload remains on a blocking error state with an explicit retry action, preventing invoice interaction against a partial or empty catalog.
- After a customer is selected on the sales form, users with `customers.update` see a `Sửa nhanh` action beside the selected value. It opens a padded responsive modal for updating the customer's name, address, and note without leaving the invoice draft. The phone number is displayed as a disabled reference field and is deliberately omitted from the update payload; the saved customer is refreshed immediately in the current invoice form and local search results.
- Product unit, pricing, cost, status, category, and stock fields. Quick-product placement is configured directly from empty slots on the sales form by users with `products.update`.

### Sales and inventory

- On the new-sale route, the desktop workspace fits within the viewport. The selected-product list and quick-product grid scroll independently, keeping the order note, customer search, and payment button visible at Full HD height. Narrow layouts retain the existing page flow.
- Invoice edits and new sales share the same tabbed, viewport-fitted 65/35 workspace. Edit tabs show `Sửa · <invoice-code>` in amber and retain their invoice snapshot and unsaved fields in account-scoped draft storage. Staff with invoice-create permission can switch to or add independent sales tabs before finishing an edit. Opening an edit validates its current server status and reuses an existing draft instead of overwriting unsaved changes. Saving an edit updates that invoice, closes only its tab, and stays in the sales workspace; printing uses the saved invoice and two copies independently of the next tab's print setting. Customer and sale date remain immutable, and cancelling/completing an invoice on the server still prevents saving its edit.

- The new-invoice sales screen supports up to 20 independent local draft tabs. Drafts retain the selected customer snapshot, product lines, note, discount, checkout flags, and charges in account-scoped browser storage (`hana-sale-drafts:v1:<user-id>`), restore after route changes/reloads, and synchronize through browser storage events across tabs in the same browser profile. Closing a non-empty draft requires confirmation; a successful invoice creation removes only the submitted draft and always leaves another draft available. Edit tabs share this draft flow with explicit original-invoice metadata; switching tabs persists a current-field snapshot before route changes. Drafts do not alter stock before create/update succeeds.
- The sales form uses a 65/35 desktop layout: customer/product entry and invoice lines on the left, and a 15-slot quick-product grid arranged in three columns and five rows on the right. Compact product tiles show only a 16px regular-weight product name and a bold 17px violet secondary-color numeric price without a currency suffix. The remove control sits at the bottom right, with the price reserving its space, so long names can use the full tile width. Empty slots use muted gray regular text without slot numbers. Users with `products.update` can click an empty slot to assign an active product or remove an assignment directly on this screen; the complete slot layout is saved atomically. The grid is memoized so typing in the main product search does not render it again. A compact section below the selected lines provides a 48px invoice-note textarea on the left and a 20px product subtotal with the count of distinct product types on the right. Increasing the quantity of an existing product does not increase this count. The note is no longer duplicated in checkout. Only the Thanh toán button sits at the bottom right below the quick-product grid; it opens the checkout dialog while preserving the payment draft. Screens below 900px stack the two areas. Packing and other-charge inputs are hidden in the form; existing charge data remains preserved.
- The sales form uses a 65/35 desktop layout: customer/product entry and invoice lines on the left, and a 15-slot quick-product grid arranged in three columns and five rows on the right. Compact product tiles show only a 16px regular-weight product name and a bold 17px violet secondary-color numeric price without a currency suffix. The remove control sits at the bottom right, with the price reserving its space, so long names can use the full tile width. Empty slots use muted gray regular text without slot numbers. Users with `products.update` can click an empty slot to assign an active product or remove an assignment directly on this screen; the complete slot layout is saved atomically. The grid is memoized so typing in the main product search does not render it again. A compact section below the selected lines provides a 48px invoice-note textarea on the left and a 20px product subtotal with the count of distinct product types on the right. Increasing the quantity of an existing product does not increase this count. The note is no longer duplicated in checkout. Only the Thanh toán button sits at the bottom right below the quick-product grid; it opens the checkout dialog while preserving the payment draft. Screens below 900px stack the two areas. Packing and other-charge inputs are hidden in the form; existing charge data remains preserved.
- Product-search suggestions display only the product name in the primary teal color and a regular-weight violet secondary-color numeric price without a currency suffix. Product codes remain searchable but are hidden in the dropdown. Users with `products.update` can replace a suggestion's displayed price with an inline editor, press Enter to save or Escape to cancel; a successful update refreshes the local sales catalog and quick-selection prices immediately.
- While the product-search dropdown is open with non-empty input, users with `products.create` always see “Thêm mới sản phẩm” in a fixed footer below a separately scrollable results area, including when matching products exist. The dropdown retains its height limit and customer suggestions are unchanged. The empty-result message still appears only when there are no matches; the existing creation modal and search-name prefill are preserved.
- The quick-product assignment modal uses the shared 12px modal corners, tinted padded header, and a responsive padded body. Search stays above a separately scrollable list, with spaced product rows, wrapping names, distinct codes/prices, keyboard focus styling, and a padded empty state.
- Quantity and unit-price inputs select their full value on focus and use the same rounded teal focus ring as the main product search.

- Checkout now accepts a non-negative invoice discount amount. The API stores it on invoices, subtracts it after product subtotal and extra charges, rejects discounts above the pre-discount total, and includes it in invoice history snapshots and printed receipts. Startup adds the discount_amount column with a zero default to existing MySQL invoices.
- Invoice list, creation, detail, edit, cancel, soft delete, print payload, and history retrieval. Editable `created` invoices expose a direct edit action in the invoice list for users with `invoices.update`, avoiding the extra detail-page step.
- Invoices have a persisted zero-based content `revision`. Each successful invoice-content edit increments it once in the same locked database transaction, while audit, delivery, and COD operations do not. Original receipts print the unchanged invoice code; edited receipts append a minimum two-digit revision (`<code>.01`, `<code>.02`, ...) without an additional revision banner. Startup adds the column and backfills legacy revisions from content-changing invoice history.
- Cancelling an invoice from the invoice list uses the shared application modal instead of a browser prompt, keeps the prefilled cancellation-reason field, and presents the actions in `Hủy` then `OK` order.
- Sales invoices can be marked as paid by bank transfer during creation or edit. The flag is included in invoice history and receipts; internal shippers see a prominent “Đã thanh toán – không thu tiền khách” state instead of a collection amount, and prepaid invoices are excluded from the received-orders “Tổng COD” summary.
- Invoice list filtering (status, sale-date range, invoice code, and customer phone) and backend pagination are persisted in the URL, including page-size selection and return navigation from invoice detail. The default status filter is `Đang hiệu lực`, which includes created/completed invoices while excluding cancelled ones through the API's `exclude_cancelled` flag; `Tất cả trạng thái` remains available and is explicitly persisted as `status=all`. A live result-count line immediately below the filter toolbar displays the backend total for the current filter rather than only the current page size. The API returns page metadata and orders invoices by creation time descending. The list shows a content-width `Rev` column immediately after the invoice code; original invoices leave it blank, while edited invoices show a bold red two-digit revision (`.01`, `.02`, ...), replacing the former edited/not-edited icon column.
- Daily sequential invoice code generation and uniqueness handling.
- Invoice codes derive their `YYMMDD` date key by converting the stored UTC sale instant to Vietnam time. Missing API sale times default to the current UTC instant, and offset-free legacy input means Vietnam local time.
- All database datetime values use UTC and API datetime values carry an explicit `Z`. Both frontend `dateTime` and the compatibility alias `utcDateTime` display Vietnam time. See the consistent-time section above for filter fields and migration details.
- Product snapshot fields on invoice lines.
- Totals for subtotal, configurable shipping/packing/other charges, and final amount.
- Stock deduction on sale, reconciliation on edit, and restoration on cancellation/deletion.
- Invoice receipt UI with Hana logo and barcode rendering. Printing from invoice detail hides management-only UI such as the detail header, Audit panel, history, alerts, modals, and toast notifications so only the 80mm receipt is sent to print.
- In the shipper's “Đơn đã nhận” screen, invoice codes are buttons on desktop and mobile that open a scrollable receipt modal using the shared `InvoiceReceipt` component (including item snapshots, charges, note formatting, payment state, and barcode). The modal uses the full invoice data already returned by `/shipping/claimed-invoices`, which requires `shipping.claim` and scopes results to the current active shipper's non-deleted internal assignments. No general invoice-view permission or unscoped invoice lookup is added. Close with the header button or Escape.
- The 80mm receipt pins its two customer-care note paragraphs to 11px so mobile typography rules cannot enlarge them in print. Customer name/address lines render at 13px, the customer phone line at 15px, and the invoice note line at 18px bold (700) consistently in preview and print. Invoice note content is rendered in Vietnamese-aware uppercase without changing the stored note.
- Invoice state is `created`, `completed`, or `cancelled`; shipper delivery confirmation is the only workflow that moves an invoice to `completed`.
- Invoice audit labels are visible in the invoice list/detail. Staff with `invoices.audit` can mark an unaudited invoice as `Khách lẻ` or `Ship Ngoài`.
- Staff with `invoices.audit` can undo an accidental `Khách lẻ` or direct `Ship Ngoài` label from the invoice-detail Audit panel through a confirmation modal with a required reason. The backend locks the invoice, clears Audit/external handover fields, and records a before/after invoice-history snapshot. Rollback is rejected for cancelled invoices, internal-shipper assignments, invoices already collected/reconciled, or invoices still belonging to an active external handover batch; those shipper assignments must use their dedicated recall/batch-management workflows.
- Staff with `shipping.manage` have a dedicated “Quản lý đơn ship” menu with “Bàn giao đơn” and “Bảng kê Ship Ngoài” submenus. The handover workspace lists valid unaudited invoices by creation-date range in the Vietnam timezone; both dates default to today. Its desktop workspace is split between available invoices and the handover queue (stacked on mobile); selecting an invoice moves it between the two lists, and typing/scanning an invoice code followed by Enter queues it directly. Staff can atomically mark queued invoices as `Khách lẻ`, or hand them to an external shipper with advance method (`transfer`, `cash`, or `mixed`), actual transfer/cash amounts, and the actual shipping fee. The external shipper advance is calculated as selected COD total minus the shipping fee; transferred invoices are excluded from that COD total, and a negative result is allowed. The handover modal defaults to bank transfer and pre-fills the actual transfer amount from the calculated shipper advance, updating it as the shipping fee changes. Each external handover creates a persistent batch; the batch list supports an optional Vietnam-date range (default today, clearing the range returns all batches), detail viewing, adding/removing eligible invoices, changing advance method/actual amounts, and cancelling a whole handover. The batch update modal lists only current member invoices; another eligible unaudited invoice is added by entering/scanning its code and pressing Enter, with a 1–4 digit sequence expanded by the frontend to the current-day `HDYYMMDDNNNN` code. Batch edits and cancellation update invoice audit state and invoice history in one transaction, while membership rows retain removed/cancelled entries. Legacy external handovers are grouped into batches during startup. Concurrent eligibility changes reject the entire edit.
- All payment collection/reconciliation note inputs (internal COD collection, retail collection, external-batch reconciliation) share configurable quick-fill buttons. Defaults are “VPB hộ kd”, “Techcombank”, and “VCB An”; clicking fills the note for review without confirming payment. The inline “Cấu hình” editor supports adding/removing any number of distinct, trimmed entries (1–100 characters each), including an empty list to turn off shortcuts, and saves them in the singleton `payment_note_settings` table, created and seeded at startup without overwriting existing settings. GET/PUT `/api/payment-note-settings` require either `shipping.manage` or `order_reconciliation.manage`; staff with either permission can change this shared configuration for all users. Collection notes remain free text and existing collected records do not change when presets are edited. Focused API tests cover permissions, validation, persistence, and startup preservation (requires `httpx` for FastAPI TestClient).
- Invoice-list search now includes a separate customer-name field via the optional `customer_name` API query. The service performs a trimmed, case-insensitive partial match with literal wildcard escaping and combines it with code, phone, status, product/date, and pagination filters. The name filter is persisted in the URL and reused across pagination/refresh. Filter order is invoice code, customer name, then phone. Code and phone retain the compact width; customer name retains the wider width and becomes full-width on mobile.
- Retail handover supports an optional 500-character note applied to every selected invoice. The nullable `invoices.handover_note` column is added by the existing startup compatibility checks and is independent of sale/reconciliation notes. Notes are trimmed, included in invoice API responses and before/after history snapshots, and cleared on audit rollback. The “Khách lẻ & chuyển khoản” reconciliation tab replaces audit time with the handover note and displays it on mobile cards as well. Handovers and their notes/history remain atomic; focused isolated SQLite tests cover persistence, validation, rollback, conflicts, and transaction failure. MySQL/UI end-to-end verification remains outstanding.
- The “Quản lý đơn ship” menu now also has a dedicated “Bàn giao Ship Nội Bộ” screen for staff with `shipping.manage`. It reuses the unaudited-invoice date range, scan/code entry, selection queue, and responsive handover workspace, but only allows choosing an active internal shipper. The batch assignment locks and validates all selected invoices, applies the `internal_shipper` audit label and shipper assignment atomically, and records the managing staff member plus selected shipper in invoice history. Assigned invoices immediately appear in that shipper's “Đơn đã nhận” flow. A sibling tab lists all internal-shipper assignments in the selected handover-date range with search, a current-shipper filter derived from the assignments (including inactive shippers that still hold orders), customer delivery addresses, and delivery/payment states. Managers can recall an unsettled assignment: the transaction clears the audit/shipper/delivery fields, restores a delivered invoice from `completed` to `created`, and records the actor and optional reason in invoice history, after which the invoice is unaudited and can be handed over again or labeled retail. Recall is blocked for cancelled invoices and invoices already present in an immutable internal COD collection or retail/transfer reconciliation record.
- Staff with `shipping.manage` have a separate top-level “Quản lý tiền COD” menu. Its “Thu tiền Ship Nội Bộ” screen filters by exactly one Vietnam handover date and focuses only on outstanding daily debt; the shipper debt area uses a dense comparison table on desktop for scanning 10–15 debtors and switches to action-friendly cards on mobile, while deliberately omitting last-collection metadata. Collection history is separated into the sibling “Lịch sử thu tiền COD” screen with date-range filtering, keyword search, aggregate cards, and session detail viewing. COD debt is created immediately when an invoice is handed to an internal shipper; delivery confirmation is not required. Debt rows/cards show only shippers with uncollected COD and distinguish total handed-over orders, total COD orders, transferred orders excluded from COD, pending COD orders, and the amount still due. The collection modal summarizes total handed-over orders, pending COD orders, and amount due, and lists every invoice handed to that shipper on the selected day with code, customer name/phone, address, handover time, and explicit `Thu COD`, `Đã chuyển khoản`, or already-collected COD status. Invoice codes open details in a new tab and clicking a phone copies it; transferred invoices remain visible for reconciliation but are not submitted into the collection session. Staff can create an immutable full-payment collection session for the outstanding daily debt. Eligible invoices are non-cancelled, non-deleted `internal_shipper` invoices handed over on the selected day and not paid by transfer. Session items snapshot invoice code, customer, handover time, optional delivery time, and COD amount; a global unique constraint on invoice ID prevents duplicate collection under concurrent requests, and the submitted invoice set must still match the current daily debt. Inactive shippers remain visible when they still owe COD so outstanding money can be settled.
- The “Quản lý tiền COD” menu also includes “Kiểm kê đơn”. Access to its route, menu item, reads, and mutations is isolated behind `order_reconciliation.manage`, independently of `shipping.manage`; when this permission was introduced, existing roles with ship-management access received it once for backward compatibility and can subsequently have it removed. All three tabs share an invoice-style date-range control, defaulting from/to to the current Vietnam date; clearing it returns all dates and the selected range is persisted in the URL. Invoice tabs filter by sale date (`sold_at`). The external-batch tab filters active batches by handover date (`handed_over_at`). Its first tab lists every active, non-cancelled invoice without an audit label in that range, supports instant search across invoice code/customer/phone/address, lets staff assign `Khách lẻ`, and links directly to the internal or general shipper handover workspaces. Its second tab is the union of active `Khách lẻ` invoices and active bank-transfer invoices that have already been audited as `Khách lẻ`, `Ship nội bộ`, or `Ship ngoài`; unaudited transfer invoices remain only in the first tab. The table and mobile cards show customer addresses, and clicking a customer phone copies it to the clipboard. It provides pending/collected/all filters and per-invoice collection confirmation. The retail-collection confirmation modal has its own responsive padded content and action layout instead of inheriting the unpadded base modal body. Collection records are immutable snapshots of invoice code, customer, amount, payment method, collector, collection time, and note; a unique invoice constraint and row locking prevent duplicate confirmation. Transfer invoices are reconciled as money already received by the shop and remain excluded from internal shipper COD debt. Desktop uses dense tables and mobile uses action-oriented cards.
- A third “Kiểm kê Ship ngoài” tab uses the selected Vietnam handover-date range and lists active external handover batches with pending/reconciled/all filters. Each row/card compares the expected shipper advance with the actual transfer-plus-cash amount and shows batch method, active invoice count, handover actor, and time. The confirmation modal shows total actual receipts plus an explicit transfer/cash breakdown for pre-confirmation checking. It also lists active invoices in the batch with invoice code, customer name/phone, address, payment method, and invoice total. The wide modal uses a scrollable table on desktop with a roomy address column; invoice codes open invoice details in a new tab and clicking a customer phone copies it. Mobile uses cards with the same actions. Confirmation creates an immutable batch-level reconciliation snapshot with batch code, active invoice count, expected and received amounts, method, actor, time, and note. Row locking plus a unique batch constraint prevents duplicate reconciliation; cancelled batches cannot be reconciled and are omitted from this tab. Once reconciliation exists, the external batch is immutable: backend update/cancel transactions reject it under the batch lock, and the batch-list UI shows `Đã kiểm kê` while removing edit/cancel actions.
- Internal shipper profiles and login accounts can be created, updated, activated, and deactivated from the Shipper management page.
- The system-managed `Shipper nội bộ` role grants only `shipping.claim`. After login, a shipper is routed directly to “Nhận đơn ship”, where they can select one or more currently eligible invoices and claim them atomically as `Ship Ruột`. Claiming is a two-step action: the primary button opens a responsive confirmation modal summarizing selected order count, COD count/amount, transferred-order count, and each order's customer/address/payment state; only the modal confirmation calls the claim API. The claim list has an instant, accent-insensitive text filter across invoice code, customer name, phone, and address; select-all applies only to visible matches while selections made under other searches are preserved.
- Shippers have a responsive “Đơn đã nhận” screen with an invoice-list-style date-range filter (today by default), own-account data isolation, received-time/status visibility, and order/payment summaries for the selected range.
- On “Đơn đã nhận”, the assigned shipper can quickly filter received orders with full-width, color-coded controls for all, in-delivery, delivered, or cancelled states. Mobile card backgrounds also reflect state: pale yellow for in-delivery, pale green for delivered, and muted red for cancelled. Cards keep customer, phone, code, and address prominent while combining the compact payment/COD state and delivery/call actions into a single footer row. The call action opens the device dialer and is disabled when no number exists. Delivery completion requires a confirmation modal showing the invoice code, customer, delivery address, and payment total; successful confirmation has immediate animation and toast feedback.

### Dashboard and reports

- Dashboard quick ranges replace the rolling seven-day option with the complete previous calendar month, shared by summary, product/customer rankings and order-status charts. General Reports retains its existing presets.

- Clicking the `Tổng quan` navigation link while already on the Dashboard refreshes all four data requests (summary, products, customers, and order-status charts) through the router location key. Current filters remain selected, and each effect's cleanup ignores stale responses.

- Dashboard summary API accepts an inclusive sale-date range (defaulting to the current Vietnam date) and now returns only invoice counts, revenue sums, and adaptive revenue buckets. Product rankings are isolated in `/dashboard/top-products`, which accepts an independent date range and a `quantity` or `revenue` metric; customer rankings are provided by `/dashboard/top-customers` and sum active invoice totals for identified customers. Audit totals, top-10 internal-shipper order counts, and invoice reconciliation totals are isolated in `/dashboard/order-status-charts`; the three donut charts share one independent preset filter inside a single status card. The summary response deliberately omits customer-creation counting, recent invoice records, customer relationships, product rankings, and order-status charts. Audit and reconciliation charts exclude cancelled/deleted invoices; an invoice is reconciled when it belongs to an immutable retail/transfer collection, internal COD collection, or active reconciled external-handover batch. The Dashboard UI offers `Hôm nay`, `Hôm qua`, `7 ngày qua`, `Tháng này`, and a custom date-range picker for the general reports. The Top 10 product, customer, and order-status cards have independent preset selectors; the product card can switch between net revenue and quantity, and each selection refreshes only its own card. Its summary area uses two balanced cards: product revenue includes the created-invoice count, while other receipts remain separate. The status card uses three equal-width donut regions on desktop and stacks them without horizontal overflow on smaller screens.
- General reports page includes both created and completed invoices while excluding cancelled invoices, matching the Dashboard's active-invoice scope.
- General reports automatically refresh after selecting today, yesterday, the last seven days (including today), month-to-date, or a complete custom date range. The preset controls reuse Dashboard styling; partial calendar selections wait for the end date, clearing both dates loads an unbounded report, and stale requests cannot replace newer data or the applied range used by invoice links.
- The general report's product-revenue panel has an instant name filter that ignores Vietnamese accents and letter case. Filtering affects only visible product rows, preserving revenue ordering, invoice drill-down links, summary metrics, and the daily-revenue table.
- Product names in the general report open the invoice list in a new tab for users with `invoices.view`, reusing the sold-products report's historical product-code filter and active-invoice scope. Links preserve the last successfully loaded date range, including unbounded endpoints, while a newly selected range is loading or incomplete, or if loading fails.
- General reports summary shows revenue, product subtotal, shipping fees, and total invoice discounts for the selected range. Its product-revenue table displays only product name, quantity sold, and revenue, with right-aligned numeric columns and a 50/20/30 width split; product-code snapshots remain the grouping key.
- Sold-products report with optional date range, excluding cancelled/deleted invoices.
- Sold-product names open the paginated invoice list in a new tab for users with `invoices.view`. Links retain the last successfully loaded report date range, including unbounded dates, and pass the historical product-code snapshot used by the report grouping. The invoice API applies an exact `product_code` relationship EXISTS filter before counting/pagination, avoiding duplicate invoices when several lines match. The product filter remains active through invoice searches and pagination; the initial list excludes cancelled/deleted invoices like the report. Invoice permissions are unchanged.

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
- Persisted invoice-edit drafts can outlive another staff member's content changes. Opening an edit validates server status, and update still uses backend transaction/status checks, but the invoice API currently has no optimistic revision precondition to reject a stale content draft.
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

There are currently no `test` or `lint` scripts in `frontend/package.json`, and no backend test framework configuration is tracked. Run focused handover-note tests with `python -m unittest discover -s tests -v` from `backend` (an isolated SQLite database is used). Focused draft-storage tests can be run with `node --test tests/salesDraftStorage.test.mjs` from `frontend`. The edit/new-tab flow has also been exercised in a temporary browser harness with fixture API responses; this does not replace transaction verification against MySQL.

## 7. Environment and operational notes

- PyMySQL is installed with its `rsa` extra to include `cryptography`, required for MySQL 8.4 `caching_sha2_password` authentication on connections that need a full authentication exchange. Without it, API startup can fail even when the image builds successfully.
- Existing MySQL volumes retain their database account passwords; changing `MYSQL_PASSWORD` or `MYSQL_ROOT_PASSWORD` in `.env` does not change those accounts. When reusing a volume, align connection settings with its existing credentials or explicitly rotate the database accounts. Local recovery on 2026-10-09 restored the application connection settings and verified login through the frontend; root account authentication with the current `.env` remains unverified.

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
