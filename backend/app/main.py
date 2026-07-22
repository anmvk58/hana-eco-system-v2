from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api.routers import access_control, customers, extra_charge_settings, invoices, product_categories, products, reports
from app.core.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import AuthSession, Customer, ExtraChargeSetting, Invoice, InvoiceCodeSequence, InvoiceExtraCharge, InvoiceHistory, InvoiceItem, Permission, Product, ProductCategory, Role, User
from app.services.access_control_service import ensure_defaults as ensure_access_control_defaults
from app.services.extra_charge_setting_service import ensure_default_extra_charge_settings


settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(customers.router, prefix=settings.api_prefix)
    app.include_router(product_categories.router, prefix=settings.api_prefix)
    app.include_router(products.router, prefix=settings.api_prefix)
    app.include_router(invoices.router, prefix=settings.api_prefix)
    app.include_router(extra_charge_settings.router, prefix=settings.api_prefix)
    app.include_router(access_control.router, prefix=settings.api_prefix)
    app.include_router(reports.router, prefix=settings.api_prefix)

    @app.on_event("startup")
    def on_startup() -> None:
        Base.metadata.create_all(bind=engine)
        ensure_product_category_column()
        ensure_user_password_column()
        ensure_invoice_status_values()
        with SessionLocal() as db:
            ensure_access_control_defaults(db)
            ensure_default_extra_charge_settings(db)

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


def ensure_invoice_status_values() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("invoices"):
        return
    status_column = next((column for column in inspector.get_columns("invoices") if column["name"] == "status"), None)
    existing_values = set(getattr(status_column["type"], "enums", [])) if status_column else set()
    if status_column is None or ("created" in existing_values and not {"draft", "completed"} & existing_values):
        return
    with engine.begin() as connection:
        if "created" not in existing_values:
            connection.execute(text("ALTER TABLE invoices MODIFY COLUMN status ENUM('draft','completed','created','cancelled') NOT NULL DEFAULT 'created'"))
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
        connection.execute(text("UPDATE invoices SET status = 'created' WHERE status IN ('draft','completed')"))
        connection.execute(text("ALTER TABLE invoices MODIFY COLUMN status ENUM('created','cancelled') NOT NULL DEFAULT 'created'"))


app = create_app()
