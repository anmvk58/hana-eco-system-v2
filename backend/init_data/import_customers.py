from __future__ import annotations

import getpass
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from sqlalchemy import MetaData, Table, create_engine, insert, or_, select
from sqlalchemy.engine import URL, Engine
from sqlalchemy.exc import IntegrityError, NoSuchTableError, SQLAlchemyError


REQUIRED_EXCEL_COLUMNS = ("code", "name", "phone", "address")
REQUIRED_DATABASE_COLUMNS = (
    "code",
    "name",
    "phone",
    "address",
    "created_at",
    "updated_at",
)
FIELD_MAX_LENGTHS = {
    "code": 40,
    "name": 200,
    "phone": 30,
    "address": 500,
}


@dataclass(frozen=True)
class MySQLConfig:
    host: str
    port: int
    username: str
    password: str
    database: str
    charset: str = "utf8mb4"

    def sqlalchemy_url(self) -> URL:
        return URL.create(
            drivername="mysql+pymysql",
            username=self.username,
            password=self.password,
            host=self.host,
            port=self.port,
            database=self.database,
            query={"charset": self.charset},
        )


@dataclass(frozen=True)
class CustomerImportRow:
    excel_row: int
    code: str
    name: str
    phone: str | None
    address: str | None


def normalize_header(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    normalized = str(value).strip()
    return normalized or None


def normalize_phone(value: Any) -> str | None:
    normalized = normalize_text(value)
    if normalized is None:
        return None
    return re.sub(r"\s+", "", normalized) or None


def normalize_code(value: Any) -> str | None:
    normalized = normalize_text(value)
    if normalized is None:
        return None
    return re.sub(r"\s+", "", normalized) or None


def validate_length(field: str, value: str | None, excel_row: int) -> None:
    if value is not None and len(value) > FIELD_MAX_LENGTHS[field]:
        raise ValueError(
            f"Dòng {excel_row}: cột '{field}' vượt quá "
            f"{FIELD_MAX_LENGTHS[field]} ký tự"
        )


def read_customer_rows(
    excel_file: Path,
    sheet_name: str | None = None,
) -> list[CustomerImportRow]:
    if not excel_file.is_file():
        raise ValueError(f"Không tìm thấy file Excel: {excel_file}")
    if excel_file.suffix.lower() != ".xlsx":
        raise ValueError("Script chỉ hỗ trợ file Excel định dạng .xlsx")

    workbook = load_workbook(excel_file, read_only=True, data_only=True)
    try:
        if sheet_name:
            if sheet_name not in workbook.sheetnames:
                raise ValueError(
                    f"Không tìm thấy sheet '{sheet_name}'. "
                    f"Các sheet hiện có: {', '.join(workbook.sheetnames)}"
                )
            worksheet = workbook[sheet_name]
        else:
            worksheet = workbook.active

        row_iterator = worksheet.iter_rows(values_only=True)
        header_row = next(row_iterator, None)
        if header_row is None:
            raise ValueError("File Excel không có dòng tiêu đề")

        header_indexes: dict[str, int] = {}
        for index, value in enumerate(header_row):
            header = normalize_header(value)
            if not header:
                continue
            if header in header_indexes:
                raise ValueError(f"Dòng tiêu đề có cột bị trùng: '{header}'")
            header_indexes[header] = index

        missing_columns = [
            column for column in REQUIRED_EXCEL_COLUMNS if column not in header_indexes
        ]
        if missing_columns:
            raise ValueError("Thiếu cột bắt buộc: " + ", ".join(missing_columns))

        customers: list[CustomerImportRow] = []
        seen_codes: dict[str, int] = {}
        seen_phones: dict[str, int] = {}

        for excel_row, values in enumerate(row_iterator, start=2):
            raw_values = {
                column: values[index] if index < len(values) else None
                for column, index in header_indexes.items()
                if column in REQUIRED_EXCEL_COLUMNS
            }
            if all(
                normalize_text(raw_values.get(column)) is None
                for column in REQUIRED_EXCEL_COLUMNS
            ):
                continue

            code = normalize_code(raw_values.get("code"))
            name = normalize_text(raw_values.get("name"))
            phone = normalize_phone(raw_values.get("phone"))
            address = normalize_text(raw_values.get("address"))

            if not code:
                raise ValueError(f"Dòng {excel_row}: cột 'code' không được để trống")
            if not code.startswith("0"):
                raise ValueError(
                    f"Dòng {excel_row}: code '{code}' phải bắt đầu bằng số 0"
                )
            if not name:
                raise ValueError(f"Dòng {excel_row}: cột 'name' không được để trống")
            if phone and not phone.startswith("0"):
                raise ValueError(
                    f"Dòng {excel_row}: phone '{phone}' phải bắt đầu bằng số 0"
                )

            validate_length("code", code, excel_row)
            validate_length("name", name, excel_row)
            validate_length("phone", phone, excel_row)
            validate_length("address", address, excel_row)

            if code in seen_codes:
                raise ValueError(
                    f"Dòng {excel_row}: code '{code}' trùng với dòng "
                    f"{seen_codes[code]} trong Excel"
                )
            seen_codes[code] = excel_row

            if phone:
                if phone in seen_phones:
                    raise ValueError(
                        f"Dòng {excel_row}: phone '{phone}' trùng với dòng "
                        f"{seen_phones[phone]} trong Excel"
                    )
                seen_phones[phone] = excel_row

            customers.append(
                CustomerImportRow(
                    excel_row=excel_row,
                    code=code,
                    name=name,
                    phone=phone,
                    address=address,
                )
            )
    finally:
        workbook.close()

    if not customers:
        raise ValueError("File Excel không có dòng khách hàng hợp lệ")
    return customers


def create_mysql_engine(config: MySQLConfig) -> Engine:
    return create_engine(
        config.sqlalchemy_url(),
        future=True,
        pool_pre_ping=True,
    )


def reflect_target_table(engine: Engine, table_name: str) -> Table:
    normalized_table_name = table_name.strip()
    if not normalized_table_name:
        raise ValueError("Tên bảng đích không được để trống")

    try:
        table = Table(normalized_table_name, MetaData(), autoload_with=engine)
    except NoSuchTableError as exc:
        raise ValueError(f"Không tìm thấy bảng đích '{normalized_table_name}'") from exc

    missing_columns = [
        column for column in REQUIRED_DATABASE_COLUMNS if column not in table.c
    ]
    if missing_columns:
        raise ValueError(
            f"Bảng '{normalized_table_name}' thiếu cột: "
            + ", ".join(missing_columns)
        )
    return table


def find_existing_values(
    engine: Engine,
    table: Table,
    rows: list[CustomerImportRow],
) -> tuple[set[str], set[str]]:
    codes = {row.code for row in rows}
    phones = {row.phone for row in rows if row.phone}
    conditions = [table.c.code.in_(codes)]
    if phones:
        conditions.append(table.c.phone.in_(phones))

    statement = select(table.c.code, table.c.phone).where(or_(*conditions))
    with engine.connect() as connection:
        existing = connection.execute(statement).mappings().all()

    return (
        {row["code"] for row in existing if row["code"] in codes},
        {row["phone"] for row in existing if row["phone"] in phones},
    )


def build_insert_payloads(rows: list[CustomerImportRow]) -> list[dict[str, Any]]:
    imported_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return [
        {
            "code": row.code,
            "name": row.name,
            "phone": row.phone,
            "address": row.address,
            "created_at": imported_at,
            "updated_at": imported_at,
        }
        for row in rows
    ]


def import_customers(
    *,
    excel_file: Path,
    mysql_config: MySQLConfig,
    target_table_name: str,
    sheet_name: str | None = None,
    dry_run: bool = False,
) -> int:
    rows = read_customer_rows(excel_file.resolve(), sheet_name)
    engine = create_mysql_engine(mysql_config)
    try:
        table = reflect_target_table(engine, target_table_name)
        existing_codes, existing_phones = find_existing_values(engine, table, rows)
        if existing_codes or existing_phones:
            errors = []
            if existing_codes:
                errors.append("code đã tồn tại: " + ", ".join(sorted(existing_codes)))
            if existing_phones:
                errors.append("phone đã tồn tại: " + ", ".join(sorted(existing_phones)))
            raise ValueError("; ".join(errors))

        payloads = build_insert_payloads(rows)
        if dry_run:
            print(
                f"Kiểm tra thành công {len(payloads)} khách hàng; "
                "chưa insert dữ liệu."
            )
            return 0

        try:
            with engine.begin() as connection:
                connection.execute(insert(table), payloads)
        except IntegrityError as exc:
            raise ValueError(
                "Không thể insert vì code hoặc phone đã tồn tại. "
                "Database không có thay đổi."
            ) from exc

        print(
            f"Insert thành công {len(payloads)} khách hàng vào bảng "
            f"'{table.name}'. created_at và updated_at đã được gán theo giờ UTC."
        )
        return len(payloads)
    finally:
        engine.dispose()


def main() -> int:
    # ================================================================
    # CHỈNH CẤU HÌNH IMPORT TẠI ĐÂY
    # ================================================================
    excel_file = Path(r"C:\Users\Zefus\Downloads\Hana_data\customer.xlsx")

    mysql_config = MySQLConfig(
        host="localhost",       # Dùng "db" nếu chạy trong Docker Compose
        port=3306,
        username="hana",
        password=os.getenv("HANA_IMPORT_DB_PASSWORD") or getpass.getpass("Mật khẩu MySQL: "),
        database="hana_pos",
    )

    target_table_name = "customers"
    sheet_name: str | None = "Sheet1"  # Ví dụ: "KhachHang"
    dry_run = False                 # Đổi thành False để insert thật
    # ================================================================

    try:
        import_customers(
            excel_file=excel_file,
            mysql_config=mysql_config,
            target_table_name=target_table_name,
            sheet_name=sheet_name,
            dry_run=dry_run,
        )
        return 0
    except (ValueError, OSError, SQLAlchemyError) as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
