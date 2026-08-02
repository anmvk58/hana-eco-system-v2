from enum import Enum


class ProductStatus(str, Enum):
    active = "active"
    inactive = "inactive"


class InvoiceStatus(str, Enum):
    created = "created"
    completed = "completed"
    cancelled = "cancelled"


class InvoiceAuditLabel(str, Enum):
    retail = "retail"
    internal_shipper = "internal_shipper"
    external_shipper = "external_shipper"


class ExternalAdvanceMethod(str, Enum):
    transfer = "transfer"
    cash = "cash"
    mixed = "mixed"


class ExtraChargeType(str, Enum):
    shipping = "shipping"
    packing = "packing"
    other = "other"


class InvoiceHistoryAction(str, Enum):
    created = "created"
    updated = "updated"
    deleted = "deleted"

