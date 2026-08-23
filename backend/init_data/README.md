# Import khách hàng từ Excel

File Excel phải có dòng tiêu đề gồm đúng bốn trường dữ liệu nghiệp vụ:

```text
code | name | phone | address
```

- `code` và `name` không được để trống.
- `code` phải duy nhất; `phone` nếu có cũng phải duy nhất.
- `code` được xóa toàn bộ khoảng trắng và phải bắt đầu bằng số `0`.
- `phone` được xóa toàn bộ khoảng trắng trước khi kiểm tra và phải bắt đầu bằng số `0` nếu có giá trị.
- Nên định dạng cột `code` và `phone` là **Text** trong Excel để giữ số `0` ở đầu.
- Ô trống trong `phone` và `address` được insert thành `NULL`.
- Script tự gán `created_at` và `updated_at` bằng thời điểm import theo UTC.
- Toàn bộ file được kiểm tra trước và insert trong một transaction. Nếu một dòng lỗi thì không dòng nào được insert.

Mở `init_data/import_customers.py` và sửa trực tiếp phần cấu hình trong hàm `main()`:

```python
excel_file = Path(r"C:\duong-dan\customers.xlsx")

mysql_config = MySQLConfig(
    host="localhost",
    port=3306,
    username="YOUR_MYSQL_USER",
    password="YOUR_MYSQL_PASSWORD",
    database="YOUR_MYSQL_DATABASE",
)

target_table_name = "customers"
sheet_name = None
dry_run = True
```

Chạy từ thư mục `backend`:

```powershell
pip install -r requirements.txt
python -m init_data.import_customers
```

Quy trình khuyến nghị:

1. Đặt `dry_run = True` và chạy để kiểm tra file, kết nối, bảng đích và dữ liệu trùng.
2. Khi kiểm tra thành công, đổi thành `dry_run = False` và chạy lại để insert.

Nếu chạy trong Docker Compose, đặt file trong `backend/init_data`, dùng đường dẫn như
`Path("/app/init_data/customers.xlsx")`, đổi host MySQL thành `db`, rồi chạy
`docker compose exec api python -m init_data.import_customers`.

Script kết nối trực tiếp tới MySQL từ thông tin trong `main()` và phản chiếu bảng theo
`target_table_name`. Bảng đích bắt buộc có các cột `code`, `name`, `phone`, `address`,
`created_at` và `updated_at`.
