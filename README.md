# Hana POS MVP Backend

MVP cho phần mềm bán hàng web app đơn giản, lấy cảm hứng từ luồng KiotViet nhưng giữ phạm vi gọn: khách hàng, sản phẩm, hóa đơn, phí phát sinh, lịch sử chỉnh sửa hóa đơn và frontend React cơ bản.

## Kiến trúc

- `backend/app/models`: SQLAlchemy models, định nghĩa schema database.
- `backend/app/schemas`: Pydantic request/response schemas.
- `backend/app/services`: business logic, tính tiền invoice, snapshot audit, điều chỉnh tồn kho.
- `backend/app/api/routers`: REST API theo từng module.
- `frontend/src`: React UI với sidebar, bảng quản lý, tạo hóa đơn, chi tiết hóa đơn, báo cáo.
- Database mặc định là MySQL qua `backend/.env`.
- Docker Compose chạy frontend, API và MySQL.

## Quan hệ database

- `customers` có nhiều `invoices`.
- `products` có nhiều `invoice_items`; mỗi item lưu snapshot `product_code`, `product_name`, `unit`, `unit_price` để hóa đơn cũ không bị đổi khi sửa sản phẩm.
- `invoices` có nhiều `invoice_items`, nhiều `invoice_extra_charges`, nhiều `invoice_history`.
- `invoice_extra_charges` lưu các khoản `shipping`, `packing`, `other`.
- `invoice_history` lưu `before_data` và `after_data` dạng JSON, kèm người sửa, thời gian sửa và lý do.
- `users` hiện chỉ dùng nhẹ cho audit. Chưa có authentication; API nhận `X-User-Id` hoặc `X-User-Name` nếu client muốn ghi người sửa.

## API chính

- `GET /api/customers?search=...`
- `POST /api/customers`
- `GET /api/customers/{id}`
- `PUT /api/customers/{id}`
- `DELETE /api/customers/{id}`
- `GET /api/products?search=...`
- `POST /api/products`
- `GET /api/products/{id}`
- `PUT /api/products/{id}`
- `DELETE /api/products/{id}`
- `GET /api/product-categories`
- `POST /api/product-categories`
- `GET /api/product-categories/{id}`
- `PUT /api/product-categories/{id}`
- `DELETE /api/product-categories/{id}`
- `GET /api/invoices?status=completed&from_date=2026-06-01&to_date=2026-06-30`
- `POST /api/invoices`
- `GET /api/invoices/{id}`
- `PUT /api/invoices/{id}`
- `DELETE /api/invoices/{id}?reason=...`
- `GET /api/invoices/{id}/history`
- `GET /api/invoices/{id}/print`

Swagger UI: `http://localhost:8000/docs`

Frontend: `http://localhost:5173`

## Chạy backend local bằng MySQL

Trước hết chạy MySQL bằng Docker Compose hoặc một MySQL local tương thích với thông tin trong `backend/.env`.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API chạy tại `http://localhost:8000`. Backend sẽ đọc `backend/.env`:

```env
DATABASE_URL=mysql+pymysql://hana:hana_password@localhost:3306/hana_pos?charset=utf8mb4
```

## Chạy frontend local

```powershell
cd frontend
npm install
npm run dev
```

Frontend chạy tại `http://localhost:5173` và mặc định gọi API `http://localhost:8000/api`.

## Chạy bằng Docker Compose

```powershell
docker compose up --build
```

Docker Compose sẽ chạy:

- FastAPI tại `http://localhost:8000`
- React frontend tại `http://localhost:5173`
- MySQL tại `localhost:3306`

## Ví dụ tạo hóa đơn

```json
{
  "customer_id": 1,
  "status": "completed",
  "items": [
    {
      "product_id": 1,
      "quantity": 2,
      "unit_price": 120000
    }
  ],
  "extra_charges": [
    {
      "charge_type": "shipping",
      "amount": 25000
    },
    {
      "charge_type": "packing",
      "amount": 10000
    }
  ],
  "reason": "Tạo đơn bán hàng"
}
```

Khi invoice ở trạng thái `completed`, tồn kho sản phẩm sẽ giảm. Nếu sửa hóa đơn completed, hệ thống hoàn tồn kho theo dữ liệu cũ rồi trừ lại theo dữ liệu mới. Mọi lần tạo/sửa/xóa mềm invoice đều ghi vào `invoice_history`.
