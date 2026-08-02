# Database Schema

## customers

| Column | Type | Notes |
| --- | --- | --- |
| id | integer | Primary key |
| code | varchar(40) | Unique, indexed |
| name | varchar(200) | Indexed |
| phone | varchar(30) | Indexed |
| address | varchar(500) | Nullable |
| note | text | Nullable |
| created_at | datetime | Required |
| updated_at | datetime | Required |
| deleted_at | datetime | Nullable, soft delete |

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
