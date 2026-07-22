from dataclasses import dataclass


@dataclass(frozen=True)
class PermissionDefinition:
    code: str
    name: str
    module: str


PERMISSIONS = [
    PermissionDefinition("dashboard.view", "Xem tổng quan", "Tổng quan"),
    PermissionDefinition("customers.view", "Xem khách hàng", "Khách hàng"),
    PermissionDefinition("customers.create", "Thêm khách hàng", "Khách hàng"),
    PermissionDefinition("customers.update", "Sửa khách hàng", "Khách hàng"),
    PermissionDefinition("customers.delete", "Xóa khách hàng", "Khách hàng"),
    PermissionDefinition("products.view", "Xem sản phẩm", "Sản phẩm"),
    PermissionDefinition("products.create", "Thêm sản phẩm", "Sản phẩm"),
    PermissionDefinition("products.update", "Sửa sản phẩm", "Sản phẩm"),
    PermissionDefinition("products.delete", "Xóa sản phẩm", "Sản phẩm"),
    PermissionDefinition("product_categories.view", "Xem nhóm sản phẩm", "Nhóm sản phẩm"),
    PermissionDefinition("product_categories.create", "Thêm nhóm sản phẩm", "Nhóm sản phẩm"),
    PermissionDefinition("product_categories.update", "Sửa nhóm sản phẩm", "Nhóm sản phẩm"),
    PermissionDefinition("product_categories.delete", "Xóa nhóm sản phẩm", "Nhóm sản phẩm"),
    PermissionDefinition("invoices.view", "Xem hóa đơn", "Hóa đơn"),
    PermissionDefinition("invoices.create", "Tạo hóa đơn", "Hóa đơn"),
    PermissionDefinition("invoices.update", "Sửa hóa đơn", "Hóa đơn"),
    PermissionDefinition("invoices.delete", "Xóa hóa đơn", "Hóa đơn"),
    PermissionDefinition("invoices.cancel", "Hủy hóa đơn", "Hóa đơn"),
    PermissionDefinition("invoices.history", "Xem lịch sử hóa đơn", "Hóa đơn"),
    PermissionDefinition("invoices.print", "In hóa đơn", "Hóa đơn"),
    PermissionDefinition("reports.view", "Xem báo cáo", "Báo cáo"),
    PermissionDefinition("reports.sold_products.view", "Xem báo cáo hàng hóa bán được", "Báo cáo"),
    PermissionDefinition("extra_charges.view", "Xem cấu hình phụ phí", "Phụ phí"),
    PermissionDefinition("extra_charges.update", "Sửa cấu hình phụ phí", "Phụ phí"),
    PermissionDefinition("users.view", "Xem người dùng", "Người dùng & phân quyền"),
    PermissionDefinition("users.create", "Thêm người dùng", "Người dùng & phân quyền"),
    PermissionDefinition("users.update", "Sửa người dùng", "Người dùng & phân quyền"),
    PermissionDefinition("users.delete", "Xóa người dùng", "Người dùng & phân quyền"),
    PermissionDefinition("roles.view", "Xem role", "Người dùng & phân quyền"),
    PermissionDefinition("roles.create", "Thêm role", "Người dùng & phân quyền"),
    PermissionDefinition("roles.update", "Sửa role và phân quyền", "Người dùng & phân quyền"),
    PermissionDefinition("roles.delete", "Xóa role", "Người dùng & phân quyền"),
]

ALL_PERMISSION_CODES = {permission.code for permission in PERMISSIONS}
