from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.routers import customers, invoices, products
from app.core.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import Customer, Invoice, InvoiceExtraCharge, InvoiceHistory, InvoiceItem, Product, User


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
    app.include_router(products.router, prefix=settings.api_prefix)
    app.include_router(invoices.router, prefix=settings.api_prefix)

    @app.on_event("startup")
    def on_startup() -> None:
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            admin = db.scalar(select(User).where(User.username == "admin"))
            if not admin:
                db.add(User(username="admin", display_name="Admin"))
                db.commit()

    @app.get("/health", tags=["system"])
    def health_check():
        return {"status": "ok"}

    return app


app = create_app()

