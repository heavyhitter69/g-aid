from datetime import datetime, timezone

import pytest

from formats import parse_gsm19, parse_header_date, parse_magarrow


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


def test_parse_header_date_gem_id_roman():
    header = """/Gem Systems GSM-19W 9088378 v7.0 23 VI 2022 M
/ID 1 file 63      .b   25 IV 26
/GPS version 2018/Aug/24
/time nT sq
"""
    d = parse_header_date(header)
    assert d is not None
    assert (d.year, d.month, d.day) == (2026, 4, 25)


def test_gsm19_gem_roman_id(tmp_path):
    path = tmp_path / "BASE.txt"
    path.write_text(
        "/Gem Systems GSM-19W 9088378 v7.0 23 VI 2022 M\n"
        "/ID 1 file 63      .b   25 IV 26\n"
        "/time nT sq\n"
        "093451.0  32565.32 99\n",
        encoding="utf-8",
    )
    df = parse_gsm19(str(path))
    assert df["survey_date"].iloc[0] == "2026-04-25"
    dt = datetime.fromtimestamp(df["timestamp"].iloc[0], tz=timezone.utc)
    assert dt.day == 25 and dt.month == 4 and dt.hour == 9


def test_magarrow_keeps_nmea_gps_rows(tmp_path):
    header = (
        "Counter,Date,Time,Latitude,Longitude,Mag, MagValid,CompassX, CompassY, CompassZ,"
        "GyroscopeX, GyroscopeY, GyroscopeZ,AccelerometerX, AccelerometerY, AccelerometerZ,"
        "ImuTemperature,Track,LocationSource,Hdop,FixQuality, SatellitesUsed, Altitude,"
        "HeightOverEllipsoid,SpeedOverGround,MagneticVariation,VariationDirection,ModeIndicator,"
        "GgaSentence,RmcSentence,EventCode,EventInfo,EventDataLength,EventData"
    )
    interp = (
        "120232,2026/04/25,09:39:59.300,8.13484366,-2.59298368,32575.15635,1,24246,-11815,-20435,"
        "-51.052,3.699,27.426,-0.01903,-0.05149,1.39587,35.805,106.9,I,,,,,,,,,,,,,,,,"
    )
    gps = (
        "120932,2026/04/25,09:40:00.000,8.13484113,-2.59297533,32566.24340,1,24071,-4093,-24359,"
        "-8.798,1.837,-1.450,0.01505,0.14099,0.92321,35.785,106.7,G,0.980,1,12,301.40,24.10,2.578,"
        "0.000, ,,'$GNGGA,094000.00,0808.09039,N,00235.57826,W,1,12,0.98,301.4,M,24.1,M,,*57',"
        "'$GNRMC,094000.00,A,0808.09039,N,00235.57826,W,2.578,106.69,250426,,,A,V*1B',,,,,"
    )
    path = tmp_path / "A (16)-10Hz.csv"
    path.write_text("\n".join([header, interp, gps]) + "\n", encoding="utf-8")
    df = parse_magarrow(str(path))
    assert len(df) == 2
    assert abs(df["y"].iloc[0] - 8.13484366) < 1e-8
    assert abs(df["magnetic_field"].iloc[1] - 32566.24340) < 1e-4
    dt = datetime.fromtimestamp(df["timestamp"].iloc[0], tz=timezone.utc)
    assert dt.year == 2026 and dt.month == 4 and dt.day == 25


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
