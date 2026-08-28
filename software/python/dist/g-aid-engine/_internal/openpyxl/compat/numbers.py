# Copyright (c) 2010-2024 openpyxl

from decimal import Decimal

NUMERIC_TYPES = (int, float, Decimal)


try:
    import numpy
    NUMPY = True
except ImportError:
    NUMPY = False


if NUMPY:
    extras = []
    for name in (
        "short",
        "ushort",
        "intc",
        "uintc",
        "int_",
        "uint",
        "longlong",
        "ulonglong",
        "half",
        "float16",
        "single",
        "double",
        "longdouble",
        "int8",
        "int16",
        "int32",
        "int64",
        "uint8",
        "uint16",
        "uint32",
        "uint64",
        "intp",
        "uintp",
        "float32",
        "float64",
        "bool_",
        "floating",
        "integer",
    ):
        t = getattr(numpy, name, None)
        if t is not None:
            extras.append(t)
    NUMERIC_TYPES = NUMERIC_TYPES + tuple(extras)
