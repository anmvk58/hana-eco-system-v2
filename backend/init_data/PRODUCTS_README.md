# Import sản phẩm từ Excel qua API

Script `import_products_via_api.py` đọc và kiểm tra toàn bộ file Excel, đăng nhập
Hana POS rồi gọi API `POST /api/products` cho từng sản phẩm.

## Cột Excel

Cột bắt buộc:

```text
code | name | unit
```

Cột tùy chọn:

```text
category_id | category_name | sale_price | cost_price | stock_quantity | status
```

- Chỉ nhập một trong hai cột `category_id` hoặc `category_name` trên mỗi dòng.
- `sale_price`, `cost_price`, `stock_quantity` mặc định bằng `0` nếu để trống.
- `status` mặc định là `active`; giá trị hợp lệ là `active` hoặc `inactive`.
- `code` được xóa toàn bộ khoảng trắng và phải duy nhất.
- Nên định dạng `code` là **Text** và các cột giá/tồn kho là **Number** trong Excel.

Ví dụ:

```text
code | name         | unit | category_name | sale_price | cost_price | stock_quantity | status
SP01 | Nước rửa tay | Chai | Hóa mỹ phẩm   | 120000     | 80000      | 20             | active
```

## Cấu hình và chạy

Mở `init_data/import_products_via_api.py` và sửa phần cấu hình trong hàm `main()`:

```python
excel_file = Path(r"C:\duong-dan\products.xlsx")

api_config = ApiConfig(
    base_url="http://localhost:8000/api",
    username="YOUR_API_USERNAME",
    password="YOUR_API_PASSWORD",
    timeout_seconds=20,
)

sheet_name = None
dry_run = True
```

Tài khoản API phải có quyền `products.create`. Chạy từ thư mục `backend`:

```powershell
python -m init_data.import_products_via_api
```

Luôn chạy lần đầu với `dry_run = True`. Script sẽ kiểm tra đăng nhập, quyền đọc,
danh mục và mã sản phẩm đã tồn tại nhưng chưa tạo dữ liệu. Sau khi thành công, đổi
thành `dry_run = False` và chạy lại.

API tạo từng sản phẩm bằng transaction riêng. Nếu có lỗi bất ngờ giữa quá trình,
các sản phẩm đã tạo trước đó không tự động bị xóa; script sẽ báo số lượng đã tạo.
