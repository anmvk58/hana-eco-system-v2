"""Vietnamese name normalization shared by ORM writes and the bulk importer."""
import unicodedata


def normalized_customer_name(value: str) -> str:
    return "".join(char for char in unicodedata.normalize("NFD", value.casefold())
                   if not unicodedata.combining(char)).replace("đ", "d").rstrip()


def name_search_suffixes(value: str) -> set[str]:
    normalized = normalized_customer_name(value)
    return {normalized[index:] for index in range(len(normalized) - 1)}
