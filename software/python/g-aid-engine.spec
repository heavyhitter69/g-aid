# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all

_openpyxl = collect_all("openpyxl")
_et_xmlfile = collect_all("et_xmlfile")

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=_openpyxl[1] + _et_xmlfile[1],
    datas=_openpyxl[0] + _et_xmlfile[0],
    hiddenimports=['pandas', 'openpyxl', 'openpyxl.drawing.image', 'et_xmlfile', 'langchain', 'langchain_ollama', 'langgraph', 'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan', 'uvicorn.lifespan.on', 'uvicorn.lifespan.off'] + _openpyxl[2] + _et_xmlfile[2],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='g-aid-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='g-aid-engine',
)
