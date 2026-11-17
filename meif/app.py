"""Punto de entrada de la aplicación de escritorio."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def ruta_por_defecto() -> Path:
    carpeta = Path.home() / ".meif"
    carpeta.mkdir(exist_ok=True)
    return carpeta / "meif.db"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="meif", description="Plataforma de escritorio MEIF")
    parser.add_argument("--db", type=Path, default=None, help="archivo SQLite (por defecto ~/.meif/meif.db)")
    parser.add_argument("--demo", action="store_true", help="cargar datos de ejemplo si la base está vacía")
    args = parser.parse_args(argv)

    from PySide6.QtWidgets import QApplication

    from meif.db import Database
    from meif.ui.main_window import MainWindow

    app = QApplication(sys.argv[:1])
    app.setApplicationName("Plataforma MEIF")
    app.setStyle("Fusion")
    db = Database(args.db or ruta_por_defecto())
    if args.demo and db.vacia():
        db.cargar_demo()
    ventana = MainWindow(db)
    ventana.show()
    try:
        return app.exec()
    finally:
        db.close()
