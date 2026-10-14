"""External reconciliation filters use the Vietnam handover calendar day."""
import os
import unittest
from datetime import date, datetime

os.environ["DATABASE_URL"] = "sqlite://"

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models import Base, ExternalHandoverBatch
from app.models.enums import ExternalAdvanceMethod, ExternalHandoverBatchStatus
from app.services.order_reconciliation_service import list_external_handover_reconciliations


class ExternalReconciliationDateTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        for code, when, status in [
            ("before", datetime(2026, 10, 10, 16, 59, 59), ExternalHandoverBatchStatus.active),
            ("midnight", datetime(2026, 10, 10, 17), ExternalHandoverBatchStatus.active),
            ("reported", datetime(2026, 10, 10, 18, 34, 23), ExternalHandoverBatchStatus.active),
            ("last", datetime(2026, 10, 11, 16, 59, 59), ExternalHandoverBatchStatus.active),
            ("next", datetime(2026, 10, 11, 17), ExternalHandoverBatchStatus.active),
            ("cancelled", datetime(2026, 10, 10, 19), ExternalHandoverBatchStatus.cancelled),
        ]:
            # Deliberately different creation date: business filtering must use handover time.
            self.db.add(ExternalHandoverBatch(code=code, handed_over_at=when,
                                             created_at=datetime(2026, 10, 12), status=status,
                                             advance_method=ExternalAdvanceMethod.cash))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def codes(self, start, end):
        return [row["batch"]["code"] for row in list_external_handover_reconciliations(self.db, start, end)]

    def test_reported_order_and_midnight_boundaries(self):
        self.assertEqual(self.codes(date(2026, 10, 11), date(2026, 10, 11)), ["last", "reported", "midnight"])

    def test_previous_day_excludes_early_morning_of_today(self):
        self.assertEqual(self.codes(date(2026, 10, 10), date(2026, 10, 10)), ["before"])

    def test_start_only(self):
        self.assertEqual(self.codes(date(2026, 10, 11), None), ["next", "last", "reported", "midnight"])

    def test_end_only(self):
        self.assertEqual(self.codes(None, date(2026, 10, 11)), ["last", "reported", "midnight", "before"])

    def test_no_dates_preserves_active_only(self):
        self.assertEqual(self.codes(None, None), ["next", "last", "reported", "midnight", "before"])

    def test_invalid_range(self):
        with self.assertRaises(HTTPException) as context:
            self.codes(date(2026, 10, 12), date(2026, 10, 11))
        self.assertEqual(context.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
