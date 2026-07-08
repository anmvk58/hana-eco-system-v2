from enum import Enum


class ProductStatus(str, Enum):
    active = "active"
    inactive = "inactive"


class InvoiceStatus(str, Enum):
    draft = "draft"
    completed = "completed"
    cancelled = "cancelled"


class ExtraChargeType(str, Enum):
    shipping = "shipping"
    packing = "packing"
    other = "other"


class InvoiceHistoryAction(str, Enum):
    created = "created"
    updated = "updated"
    deleted = "deleted"

