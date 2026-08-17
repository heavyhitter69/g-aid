from datetime import datetime, timezone

import pytest

from formats import parse_gsm19, parse_header_date


def test_gsm19_refuses_invented_date(tmp_path):
    path = tmp_path / "BASE.txt"
    path.write_text("time nT sq\n093000.0 48000.0 99\n", encoding="utf-8")
    with pytest.raises(ValueError, match="no survey date"):
        parse_gsm19(str(path))


def test_gsm19_uses_header_date(tmp_path):
    path = tmp_path / "BASE.txt"
    path.write_text("/ Date 2024-03-15\ntime nT sq\n093000.0 48000.1 99\n093001.0 48000.2 99\n", encoding="utf-8")
    df = parse_gsm19(str(path))
    assert len(df) == 2
    assert df["survey_date"].iloc[0] == "2024-03-15"
    dt = datetime.fromtimestamp(df["timestamp"].iloc[0], tz=timezone.utc)
    assert dt.year == 2024 and dt.month == 3 and dt.day == 15
    assert dt.hour == 9


def test_parse_header_date_slash():
    d = parse_header_date("Survey Date: 25/04/2026")
    assert d is not None
    assert d.year == 2026 and d.month == 4 and d.day == 25
