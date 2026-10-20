"""In-memory stand-in for the `supabase` client, used only by the e2e tests.

Implements just the query-builder calls backend/main.py makes. Rows live at
module level so they persist across requests for the life of the server.
"""

_tables: dict[str, list[dict]] = {}


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows):
        self._rows = rows
        self._filters = []
        self._insert = None
        self._order = None
        self._limit = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def order(self, column, desc=False):
        self._order = (column, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def insert(self, row):
        self._insert = row
        return self

    def execute(self):
        if self._insert is not None:
            row = {"id": len(self._rows) + 1, **self._insert}
            self._rows.append(row)
            return _Result([row])
        rows = [r for r in self._rows if all(r.get(c) == v for c, v in self._filters)]
        if self._order:
            column, desc = self._order
            rows.sort(key=lambda r: r[column], reverse=desc)
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Result(rows)


class Client:
    def table(self, name):
        return _Query(_tables.setdefault(name, []))


def create_client(_url, _key):
    return Client()
