"""Exercise the actual upgrade SQL and DAO predicates on SQLite without an emulator."""
import json
import re
import sqlite3
import unittest
from pathlib import Path

APP = Path(__file__).resolve().parents[3]
DB = APP / "src/main/java/lk/motormila/app/data/local/db"
SCHEMAS = APP / "schemas/lk.motormila.app.data.local.db.MotormilaDatabase"


class BuyerAlertMigrationTest(unittest.TestCase):
    def test_upgrade_discards_only_unowned_rows_and_queries_by_owner(self):
        with sqlite3.connect(":memory:") as db:
            for entity in json.loads((SCHEMAS / "1.json").read_text())["database"]["entities"]:
                db.execute(entity["createSql"].replace("${TABLE_NAME}", entity["tableName"]))
            db.execute("INSERT INTO watchlist(listingId, title, addedAtMs) VALUES (7, 'Guest save', 1)")
            db.execute("INSERT INTO alerts(id, active, dirty) VALUES (1, 1, 0)")
            migration = (DB / "MotormilaMigrations.kt").read_text(encoding="utf8").split("val MIGRATION_1_2 =")[1].split("val ALL:")[0]
            for sql in re.findall(r'db.execSQL\("([^"\n]+)"\)', migration):
                db.execute(sql)
            self.assertEqual([], db.execute("SELECT * FROM alerts").fetchall())
            self.assertEqual([(7,)], db.execute("SELECT listingId FROM watchlist").fetchall())
            for owner in ["a@example.invalid", "b@example.invalid"]:
                db.execute("INSERT INTO alerts(owner, id, active) VALUES (?, 1, 1)", (owner,))
            dao = (DB / "dao/AlertDao.kt").read_text(encoding="utf8")
            query = re.search(r'@Query\("([^"]+)"\)\s+fun observe\(', dao)[1]
            clear = re.search(r'@Query\("([^"]+)"\)\s+suspend fun clear\(', dao)[1]
            db.execute(clear, {"owner": "a@example.invalid"})
            self.assertEqual([], db.execute(query, {"owner": "a@example.invalid"}).fetchall())
            self.assertEqual(1, len(db.execute(query, {"owner": "b@example.invalid"}).fetchall()))


if __name__ == "__main__":
    unittest.main()
