# Database Schema

## Time conventions

All `datetime` columns store UTC without a timezone suffix, including `invoices.sold_at`. Application MySQL sessions use `+00:00`; API datetimes include `Z`. Frontend timestamps and inclusive date filters use `Asia/Ho_Chi_Minh`. Date-only business fields remain calendar dates. A date range compares UTC instants from Vietnam midnight through, but excluding, midnight after the final date.

Startup migration `2026-10-11-invoice-sale-times-utc` converts legacy Vietnam-local sale times and normalizes invoice history timestamps once. `data_migrations` stores its unique key and UTC `applied_at`. `time_normalization_backups` stores the migration key, record type, record ID and original JSON values, uniquely identified by that triple, for audit and explicit recovery. Business amounts, inventory, existing codes and update timestamps remain unchanged.

## Standalone supplier payables

These tables have no relation to products, invoices or inventory. Business dates (`entry_date`, `paid_on`) use `DATE`; audit timestamps use UTC `DATETIME`. Amounts are `NUMERIC(14,2)` and quantities `NUMERIC(14,3)`. Tables are created by the existing startup `create_all` workflow.

| Table | Main fields and constraints |
| --- | --- |
| suppliers | PK `id`; unique `name` (200); nullable `phone`, `address`, `note`; `is_active`; creation/update timestamps. Deactivate instead of deleting referenced suppliers. |
| supplier_debt_entries | PK `id`; FK `supplier_id`; `kind` (`purchase`, `increase`, `decrease`); `entry_date`, `description`, `note`; positive `amount`; `revision`; nullable FK `payment_id`; nullable `cancelled_at`; FK `created_by_user_id`; timestamps. Composite index `(supplier_id, cancelled_at, payment_id, entry_date)`. |
| supplier_debt_items | PK `id`; indexed FK `entry_id`; free-text `name`; `quantity`, `unit_price`, `line_total`. No product FK. Each line is rounded half up to cents before summing the entry. |
| supplier_debt_payments | PK `id`; indexed FK `supplier_id`; `supplier_name` snapshot; `paid_on`, `method` (`cash` or `transfer`), non-negative net `amount`, `note`; FK `created_by_user_id`; `cancelled_at`, `cancel_reason`; immutable JSON `entries_snapshot`; timestamps. |
| supplier_debt_history | PK `id`; indexed FKs `supplier_id`, nullable `entry_id`, nullable `payment_id`; `action`; FK `actor_user_id`, `actor_name` snapshot; UTC `occurred_at`; JSON `details` with reason and before/after entry snapshots. |

Entry codes (`PN-000001`, `DC-000002`) and payment codes (`TTNCC-000001`) are derived from primary keys. Pending balance sums positive purchase/increase amounts and negative decrease amounts where both `payment_id` and `cancelled_at` are null. Negative balances represent supplier credit. The supplier-list API also computes period balances/counts from an inclusive optional `entry_date` range without changing the all-date current balance. Entry lists use `entry_date` and payment lists use `paid_on` for their inclusive date filters; these are DATE comparisons, not timestamp conversions. The entry-list endpoint accepts an optional supplier ID; omitting it lists all suppliers. Its aggregate count/increase/decrease/pending fields cover the complete filtered result before pagination. Entry responses include the supplier name; this field defaults to null for older immutable payment snapshots. Selection settlement links whole entries to a payment; undo clears all its entry links and increments revisions while preserving immutable payment snapshots and history. All mutations serialize on the supplier row, followed by current entry/payment locks. Stale revisions, mixed suppliers, duplicate selections, net-amount mismatches and negative-net payments are rejected before commit. Zero-net offsets are supported.

## customers

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| code | varchar(40) | Unique, indexed |
| name | varchar(200) | Indexed (`ix_customers_name`); startup repairs missing index |
| phone | varchar(30) | Indexed |
| address | varchar(500) | Nullable |
| note | text | Nullable |
| created_at | datetime | Required |
| updated_at | datetime | Required |
| deleted_at | datetime | Nullable, soft delete |

## customer_name_search

Derived search index; original customer records are unchanged. Each active customer contributes the unique suffixes of their Vietnamese-normalized name with at least two characters. A name substring becomes an indexable suffix-prefix lookup, followed by verification against the original name.

| Column | Type | Notes |
| --- | --- | --- |
| term | varchar(600) | First part of composite primary key; allows Unicode normalization expansion |
| customer_id | integer | FK customers.id, ON DELETE CASCADE; second primary-key part and separately indexed |

ORM writes and the supplied XLSX customer importer maintain this table transactionally. Startup backfills it once using the `2026-10-16-customer-name-suffixes-v1` data-migration marker. Other direct SQL customer-name writes require explicit maintenance of this derived index.

Invoice query indexes repaired at startup:

- `ix_invoices_audit_handover (audit_label, deleted_at, audited_at, id)` for internal-handover/COD date ranges.
- `ix_invoices_shipper_handover (assigned_shipper_id, audit_label, deleted_at, audited_at, id)` for a shipper's received orders.
- `ix_invoices_audit_sale (audit_label, deleted_at, sold_at, id)` for audit/reconciliation sale-date filters.

Existing standalone indexes are preserved. New installations do not create a standalone `delivered_at` index because current delivery operations locate invoices by primary key, and delivery time is otherwise displayed rather than used as a list range/order key.

## products

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| code | varchar(40) | Unique, indexed |
| name | varchar(240) | Indexed |
| category_id | integer | FK product_categories.id, nullable |
| unit | varchar(40) | Required |
| sale_price | numeric(14,2) | Required |
| cost_price | numeric(14,2) | Required |
| stock_quantity | numeric(14,3) | Required |
| status | enum(active, inactive) | Required |
| is_quick_select | boolean | Show in the sales quick-selection list |
| quick_select_order | integer | Ascending position in the quick-selection list |
| created_at | datetime | Required |
| updated_at | datetime | Required |
| deleted_at | datetime | Nullable, soft delete |

## product_categories

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| name | varchar(160) | Unique, indexed |
| note | text | Nullable |
| created_at | datetime | Required |
| updated_at | datetime | Required |
| deleted_at | datetime | Nullable, soft delete |

## invoices

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| code | varchar(60) | Unique, indexed |
| customer_id | integer | FK customers.id, nullable |
| status | enum(created, completed, cancelled) | Indexed; completed khi shipper xác nhận giao thành công |
| sold_at | datetime | Indexed |
| audit_label | enum(retail, internal_shipper, external_shipper) | Nullable; NULL means not audited |
| assigned_shipper_id | integer | FK shippers.id; only populated for Ship Ruột |
| audited_at | datetime | Nullable |
| audited_by_user_id | integer | FK users.id, nullable |
| delivered_at | datetime | Nullable; thời điểm shipper xác nhận giao thành công |
| delivered_by_user_id | integer | FK users.id, nullable; người xác nhận giao thành công |
| is_paid_by_transfer | boolean | Đã thanh toán chuyển khoản; shipper không thu tiền khách |
| external_shipper_name | varchar(160) | Tên/đơn vị Ship Ngoài nhận bàn giao, nullable |
| external_shipper_phone | varchar(30) | SĐT Ship Ngoài, nullable |
| external_advance_method | enum(transfer, cash, mixed) | Hình thức ứng tiền khi bàn giao Ship Ngoài, nullable |
| external_transfer_amount | numeric(14,2) | Số tiền chuyển khoản thực tế khi bàn giao |
| external_cash_amount | numeric(14,2) | Số tiền mặt thực tế khi bàn giao |
| external_shipping_fee | numeric(14,2) | Tiền ship thực tế phải trả cho Ship Ngoài |
| external_advance_amount | numeric(14,2) | Số tiền Ship Ngoài phải ứng cho đợt bàn giao |
| note | text | Nullable |
| subtotal | numeric(14,2) | Tổng tiền hàng |
| total_extra_charges | numeric(14,2) | Tổng phí ship/đóng hàng/phụ thu |
| total_amount | numeric(14,2) | Tổng thanh toán |
| created_at | datetime | Required |
| updated_at | datetime | Required |
| deleted_at | datetime | Nullable, soft delete |

## invoice_code_sequences

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| date_key | varchar(8) | Unique, dạng YYMMDD |
| next_value | integer | Số thứ tự hóa đơn tiếp theo trong ngày |
| created_at | datetime | Required |
| updated_at | datetime | Required |

## invoice_items

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| invoice_id | integer | FK invoices.id |
| product_id | integer | FK products.id, nullable |
| product_code | varchar(40) | Snapshot tại thời điểm bán |
| product_name | varchar(240) | Snapshot tại thời điểm bán |
| unit | varchar(40) | Snapshot tại thời điểm bán |
| quantity | numeric(14,3) | Required |
| unit_price | numeric(14,2) | Required |
| line_total | numeric(14,2) | quantity * unit_price |
| created_at | datetime | Required |
| updated_at | datetime | Required |

## invoice_extra_charges

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| invoice_id | integer | FK invoices.id |
| charge_type | enum(shipping, packing, other) | Indexed |
| name | varchar(120) | Required |
| amount | numeric(14,2) | Required |
| note | text | Nullable |
| created_at | datetime | Required |
| updated_at | datetime | Required |

## invoice_history

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| invoice_id | integer | FK invoices.id |
| action | enum(created, updated, deleted) | Required |
| changed_by_user_id | integer | FK users.id, nullable |
| changed_by_name | varchar(160) | Nullable |
| reason | text | Nullable |
| before_data | json | Snapshot trước khi sửa |
| after_data | json | Snapshot sau khi sửa |
| created_at | datetime | Thời điểm ghi audit |

## users

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| username | varchar(80) | Unique |
| display_name | varchar(160) | Required |
| is_active | boolean | Required |
| created_at | datetime | Required |
| updated_at | datetime | Required |

## shippers

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| user_id | integer | Unique FK users.id; one login per shipper |
| phone | varchar(30) | Nullable |
| note | text | Nullable |
| is_active | boolean | Required; synchronized with the linked user |
| created_at | datetime | Required |
| updated_at | datetime | Required |

## internal_cod_collection_sessions

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| code | varchar(40) | Unique; dạng `TT-YYMMDD-NNNN` |
| shipper_id | integer | FK shippers.id |
| invoice_count | integer | Snapshot số đơn COD trong phiên |
| total_amount | numeric(14,2) | Snapshot tổng COD đã thu |
| collected_at | datetime | Thời điểm xác nhận thu đủ tiền |
| collected_by_user_id | integer | FK users.id, nullable |
| note | text | Nullable |
| created_at | datetime | Required |
| updated_at | datetime | Required |

## internal_cod_collection_items

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| session_id | integer | FK internal_cod_collection_sessions.id |
| invoice_id | integer | Unique FK invoices.id; ngăn thu COD trùng đơn |
| invoice_code | varchar(60) | Snapshot mã hóa đơn |
| customer_name | varchar(200) | Snapshot tên khách hàng, nullable |
| cod_amount | numeric(14,2) | Snapshot COD đã thu |
| handed_over_at | datetime | Snapshot thời điểm bàn giao cho shipper nội bộ, nullable |
| delivered_at | datetime | Snapshot thời điểm giao thành công, nullable |

## retail_invoice_collections

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| invoice_id | integer | Unique FK invoices.id; ngăn xác nhận thu trùng đơn Khách lẻ |
| invoice_code | varchar(60) | Snapshot mã hóa đơn |
| customer_name | varchar(200) | Snapshot tên khách hàng, nullable |
| collected_amount | numeric(14,2) | Snapshot số tiền kiểm kê |
| is_paid_by_transfer | boolean | Snapshot phương thức thanh toán của đơn |
| collected_at | datetime | Thời điểm xác nhận đã thu tiền |
| collected_by_user_id | integer | FK users.id, nullable |
| note | text | Nullable |
| created_at | datetime | Required |
| updated_at | datetime | Required |

## external_handover_batch_reconciliations

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| batch_id | integer | Unique FK external_handover_batches.id; ngăn kiểm kê trùng phiên |
| batch_code | varchar(40) | Snapshot mã phiên bàn giao |
| invoice_count | integer | Snapshot số đơn đang hoạt động trong phiên |
| expected_amount | numeric(14,2) | Snapshot tiền shipper phải ứng/nộp |
| received_amount | numeric(14,2) | Snapshot tiền thực tế đã nhận |
| advance_method | enum(transfer, cash, mixed) | Snapshot phương thức nhận tiền |
| reconciled_at | datetime | Thời điểm xác nhận kiểm kê |
| reconciled_by_user_id | integer | FK users.id, nullable |
| note | text | Nullable |
| created_at | datetime | Required |
| updated_at | datetime | Required |
