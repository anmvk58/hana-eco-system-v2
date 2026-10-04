from pydantic import BaseModel, Field, field_validator


class PaymentNoteSettings(BaseModel):
    notes: list[str] = Field(default_factory=list)

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, values: list[str]) -> list[str]:
        notes = [value.strip() for value in values]
        if any(not note or len(note) > 100 for note in notes):
            raise ValueError("Mỗi ghi chú phải có từ 1 đến 100 ký tự")
        if len(set(note.casefold() for note in notes)) != len(notes):
            raise ValueError("Các ghi chú điền nhanh không được trùng nhau")
        return notes
