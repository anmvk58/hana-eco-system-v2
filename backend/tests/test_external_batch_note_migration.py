import os
import unittest
from unittest.mock import patch
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
from sqlalchemy import create_engine, inspect, text
from app.main import ensure_external_handover_batch_note_column, ensure_external_handover_batch_completion_columns


class ExternalBatchNoteMigrationTests(unittest.TestCase):
    def test_existing_rows_are_preserved_and_migration_is_idempotent(self):
        engine = create_engine("sqlite:///:memory:")
        try:
            with engine.begin() as db:
                db.execute(text("CREATE TABLE external_handover_batches (id INTEGER PRIMARY KEY, code TEXT)"))
                db.execute(text("INSERT INTO external_handover_batches (id, code) VALUES (1, 'OLD')"))
            with patch("app.main.engine", engine):
                ensure_external_handover_batch_note_column()
                ensure_external_handover_batch_completion_columns()
                ensure_external_handover_batch_note_column()
                ensure_external_handover_batch_completion_columns()
            self.assertIn("note", {column["name"] for column in inspect(engine).get_columns("external_handover_batches")})
            with engine.connect() as db:
                self.assertEqual(tuple(db.execute(text("SELECT code, note, completed_at, completed_by_user_id, transfer_note, cash_note FROM external_handover_batches")).one()), ("OLD", None, None, None, None, None))
        finally:
            engine.dispose()
