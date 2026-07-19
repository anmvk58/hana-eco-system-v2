from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text

from app.api.routers import customers, extra_charge_settings, invoices, product_categories, products
from app.core.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import Customer, ExtraChargeSetting, Invoice, InvoiceCodeSequence, InvoiceExtraCharge, InvoiceHistory, InvoiceItem, Product, ProductCategory, User
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

    @app.on_event("startup")
    def on_startup() -> None:
        Base.metadata.create_all(bind=engine)
        ensure_product_category_column()
        with SessionLocal() as db:
            admin = db.scalar(select(User).where(User.username == "admin"))
            if not admin:
                db.add(User(username="admin", display_name="Admin"))
                db.commit()
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


app = create_app()
