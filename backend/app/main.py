from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api.routers import access_control, customers, dashboard, extra_charge_settings, internal_cod_collections, invoices, order_reconciliation, product_categories, products, reports, ship_management, shippers, shipping
from app.core.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import AuthSession, Customer, ExternalHandoverBatch, ExternalHandoverBatchItem, ExtraChargeSetting, InternalCodCollectionItem, InternalCodCollectionSession, Invoice, InvoiceCodeSequence, InvoiceExtraCharge, InvoiceHistory, InvoiceItem, Permission, Product, ProductCategory, Role, Shipper, User
from app.services.access_control_service import ensure_defaults as ensure_access_control_defaults
from app.services.extra_charge_setting_service import ensure_default_extra_charge_settings
from app.services.ship_management_service import ensure_legacy_external_handover_batches


settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(customers.router, prefix=settings.api_prefix)
    app.include_router(product_categories.router, prefix=settings.api_prefix)
    app.include_router(products.router, prefix=settings.api_prefix)
    app.include_router(invoices.router, prefix=settings.api_prefix)
    app.include_router(dashboard.router, prefix=settings.api_prefix)
    app.include_router(extra_charge_settings.router, prefix=settings.api_prefix)
    app.include_router(access_control.router, prefix=settings.api_prefix)
    app.include_router(reports.router, prefix=settings.api_prefix)
    app.include_router(shippers.router, prefix=settings.api_prefix)
    app.include_router(shipping.router, prefix=settings.api_prefix)
    app.include_router(ship_management.router, prefix=settings.api_prefix)
    app.include_router(internal_cod_collections.router, prefix=settings.api_prefix)
    app.include_router(order_reconciliation.router, prefix=settings.api_prefix)

    @app.on_event("startup")
    def on_startup() -> None:
        Base.metadata.create_all(bind=engine)
        ensure_product_category_column()
        ensure_user_password_column()
        ensure_unique_customer_phone()
        ensure_invoice_status_values()
        ensure_invoice_audit_columns()
        ensure_invoice_payment_column()
        ensure_invoice_external_handoff_columns()
        ensure_internal_cod_collection_columns()
        with SessionLocal() as db:
            ensure_access_control_defaults(db)
            ensure_default_extra_charge_settings(db)
            ensure_legacy_external_handover_batches(db)

    @app.get("/health", tags=["system"])
    def health_check():
        return {"status": "ok"}

    return app


def ensure_product_category_column() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("products"):
        return
    product_columns = {column["name"] for column in inspector.get_columns("products")}
    if "category_id" in product_columns:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE products ADD COLUMN category_id INT NULL"))


def ensure_user_password_column() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "password_hash" in user_columns:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL"))


def ensure_unique_customer_phone() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("customers"):
        return
    phone_index = next((index for index in inspector.get_indexes("customers") if index["name"] == "ix_customers_phone"), None)
    if phone_index and phone_index.get("unique"):
        return
    with engine.begin() as connection:
        connection.execute(text("UPDATE customers SET phone = NULL WHERE phone IS NOT NULL AND TRIM(phone) = ''"))
        connection.execute(text("UPDATE customers SET phone = REPLACE(TRIM(phone), ' ', '') WHERE phone IS NOT NULL"))
        duplicates = connection.execute(text("""
            SELECT phone
            FROM customers
            WHERE phone IS NOT NULL
            GROUP BY phone
            HAVING COUNT(*) > 1
            LIMIT 1
        """)).scalar()
        if duplicates:
            raise RuntimeError(f"Không thể tạo unique index vì số điện thoại {duplicates} đang bị trùng")
        if phone_index:
            connection.execute(text("DROP INDEX ix_customers_phone ON customers"))
        connection.execute(text("CREATE UNIQUE INDEX ix_customers_phone ON customers (phone)"))


def ensure_invoice_status_values() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("invoices"):
        return
    status_column = next((column for column in inspector.get_columns("invoices") if column["name"] == "status"), None)
    existing_values = set(getattr(status_column["type"], "enums", [])) if status_column else set()
    desired_values = {"created", "completed", "cancelled"}
    if status_column is None or existing_values == desired_values:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE invoices MODIFY COLUMN status ENUM('draft','created','completed','cancelled') NOT NULL DEFAULT 'created'"))
        connection.execute(text("""
            UPDATE products p
            JOIN (
                SELECT ii.product_id, SUM(ii.quantity) AS quantity
                FROM invoice_items ii
                JOIN invoices i ON i.id = ii.invoice_id
                WHERE i.status = 'draft' AND i.deleted_at IS NULL AND ii.product_id IS NOT NULL
                GROUP BY ii.product_id
            ) sold ON sold.product_id = p.id
            SET p.stock_quantity = p.stock_quantity - sold.quantity
        """))
        connection.execute(text("UPDATE invoices SET status = 'created' WHERE status = 'draft'"))
        connection.execute(text("ALTER TABLE invoices MODIFY COLUMN status ENUM('created','completed','cancelled') NOT NULL DEFAULT 'created'"))


def ensure_invoice_audit_columns() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("invoices"):
        return
    invoice_columns = {column["name"] for column in inspector.get_columns("invoices")}
    statements: list[str] = []
    if "audit_label" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN audit_label ENUM('retail','internal_shipper','external_shipper') NULL")
    if "assigned_shipper_id" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN assigned_shipper_id INT NULL, ADD CONSTRAINT fk_invoices_assigned_shipper FOREIGN KEY (assigned_shipper_id) REFERENCES shippers(id)")
    if "audited_at" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN audited_at DATETIME NULL")
    if "audited_by_user_id" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN audited_by_user_id INT NULL, ADD CONSTRAINT fk_invoices_audited_by_user FOREIGN KEY (audited_by_user_id) REFERENCES users(id)")
    if "delivered_at" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN delivered_at DATETIME NULL")
    if "delivered_by_user_id" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN delivered_by_user_id INT NULL, ADD CONSTRAINT fk_invoices_delivered_by_user FOREIGN KEY (delivered_by_user_id) REFERENCES users(id)")
    if not statements:
        return
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_invoice_payment_column() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("invoices"):
        return
    invoice_columns = {column["name"] for column in inspector.get_columns("invoices")}
    if "is_paid_by_transfer" in invoice_columns:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE invoices ADD COLUMN is_paid_by_transfer BOOLEAN NOT NULL DEFAULT FALSE"))


def ensure_invoice_external_handoff_columns() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("invoices"):
        return
    invoice_columns = {column["name"] for column in inspector.get_columns("invoices")}
    statements: list[str] = []
    if "external_shipper_name" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN external_shipper_name VARCHAR(160) NULL")
    if "external_shipper_phone" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN external_shipper_phone VARCHAR(30) NULL")
    if "external_advance_method" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN external_advance_method ENUM('transfer','cash','mixed') NULL")
    if "external_transfer_amount" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN external_transfer_amount DECIMAL(14,2) NOT NULL DEFAULT 0")
    if "external_cash_amount" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN external_cash_amount DECIMAL(14,2) NOT NULL DEFAULT 0")
    if "external_shipping_fee" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN external_shipping_fee DECIMAL(14,2) NOT NULL DEFAULT 0")
    if "external_advance_amount" not in invoice_columns:
        statements.append("ALTER TABLE invoices ADD COLUMN external_advance_amount DECIMAL(14,2) NOT NULL DEFAULT 0")
    if not statements:
        return
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_internal_cod_collection_columns() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("internal_cod_collection_items"):
        return
    item_columns = {column["name"] for column in inspector.get_columns("internal_cod_collection_items")}
    with engine.begin() as connection:
        if "handed_over_at" not in item_columns:
            connection.execute(text("ALTER TABLE internal_cod_collection_items ADD COLUMN handed_over_at DATETIME NULL"))
        connection.execute(text("""
            UPDATE internal_cod_collection_items AS collection_item
            JOIN invoices AS invoice ON invoice.id = collection_item.invoice_id
            SET collection_item.handed_over_at = invoice.audited_at
            WHERE collection_item.handed_over_at IS NULL
        """))


app = create_app()
