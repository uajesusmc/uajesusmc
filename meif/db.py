"""Capa de datos y reglas académicas del MEIF sobre SQLite."""

from __future__ import annotations

import csv
import sqlite3
from dataclasses import dataclass
from pathlib import Path

# Áreas de formación del MEIF
AREAS: dict[str, str] = {
    "AFBG": "Básica General",
    "AFID": "Iniciación a la Disciplina",
    "AFD": "Disciplinar",
    "AFT": "Terminal",
    "AFEL": "Elección Libre",
}

CALIFICACION_MINIMA = 6.0
MAX_INSCRIPCIONES_POR_EE = 2  # primera y segunda inscripción
TIPOS_EVALUACION = ("ordinario", "extraordinario", "título de suficiencia")
ORDEN_AREAS = " ORDER BY instr('AFBG AFID AFD  AFT  AFEL ', x.area || ' '), x.clave"

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS programas (
    id INTEGER PRIMARY KEY,
    clave TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    creditos_max_periodo INTEGER NOT NULL DEFAULT 54,
    creditos_min_periodo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS programa_areas (
    programa_id INTEGER NOT NULL REFERENCES programas(id) ON DELETE CASCADE,
    area TEXT NOT NULL,
    creditos_requeridos INTEGER NOT NULL CHECK (creditos_requeridos >= 0),
    PRIMARY KEY (programa_id, area)
);

CREATE TABLE IF NOT EXISTS estudiantes (
    id INTEGER PRIMARY KEY,
    matricula TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    correo TEXT,
    programa_id INTEGER NOT NULL REFERENCES programas(id),
    periodo_ingreso TEXT,
    tutor TEXT
);

CREATE TABLE IF NOT EXISTS experiencias (
    id INTEGER PRIMARY KEY,
    clave TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    area TEXT NOT NULL,
    creditos INTEGER NOT NULL CHECK (creditos > 0),
    horas_teoria INTEGER NOT NULL DEFAULT 0,
    horas_practica INTEGER NOT NULL DEFAULT 0,
    programa_id INTEGER REFERENCES programas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prerrequisitos (
    ee_id INTEGER NOT NULL REFERENCES experiencias(id) ON DELETE CASCADE,
    requiere_id INTEGER NOT NULL REFERENCES experiencias(id) ON DELETE CASCADE,
    PRIMARY KEY (ee_id, requiere_id),
    CHECK (ee_id <> requiere_id)
);

CREATE TABLE IF NOT EXISTS inscripciones (
    id INTEGER PRIMARY KEY,
    estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    ee_id INTEGER NOT NULL REFERENCES experiencias(id),
    periodo TEXT NOT NULL,
    calificacion REAL CHECK (calificacion IS NULL OR (calificacion >= 0 AND calificacion <= 10)),
    tipo TEXT NOT NULL DEFAULT 'ordinario',
    UNIQUE (estudiante_id, ee_id, periodo)
);

CREATE TABLE IF NOT EXISTS tutorias (
    id INTEGER PRIMARY KEY,
    estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    tutor TEXT NOT NULL,
    tema TEXT NOT NULL,
    observaciones TEXT
);
"""


class ReglaMEIFError(ValueError):
    """Se viola una regla académica del MEIF."""


@dataclass
class AvanceArea:
    area: str
    requeridos: int
    aprobados: int

    @property
    def porcentaje(self) -> float:
        if self.requeridos == 0:
            return 100.0
        return min(100.0, 100.0 * self.aprobados / self.requeridos)


class Database:
    def __init__(self, path: str | Path = ":memory:"):
        self.path = str(path)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def close(self) -> None:
        self.conn.close()

    # ------------------------------------------------------------ utilidades
    def _q(self, sql: str, params=()) -> list[sqlite3.Row]:
        return self.conn.execute(sql, params).fetchall()

    def _exec(self, sql: str, params=()) -> int:
        with self.conn:
            cur = self.conn.execute(sql, params)
        return cur.lastrowid

    # ------------------------------------------------------------ programas
    def agregar_programa(self, clave: str, nombre: str, creditos_por_area: dict[str, int],
                         creditos_max_periodo: int = 54, creditos_min_periodo: int = 0) -> int:
        desconocidas = set(creditos_por_area) - set(AREAS)
        if desconocidas:
            raise ReglaMEIFError(f"Áreas desconocidas: {', '.join(sorted(desconocidas))}")
        with self.conn:
            cur = self.conn.execute(
                "INSERT INTO programas (clave, nombre, creditos_max_periodo, creditos_min_periodo)"
                " VALUES (?, ?, ?, ?)",
                (clave, nombre, creditos_max_periodo, creditos_min_periodo),
            )
            pid = cur.lastrowid
            self.conn.executemany(
                "INSERT INTO programa_areas (programa_id, area, creditos_requeridos) VALUES (?, ?, ?)",
                [(pid, a, creditos_por_area.get(a, 0)) for a in AREAS],
            )
        return pid

    def programas(self) -> list[sqlite3.Row]:
        return self._q(
            "SELECT p.*, COALESCE(SUM(pa.creditos_requeridos), 0) AS creditos_totales"
            " FROM programas p LEFT JOIN programa_areas pa ON pa.programa_id = p.id"
            " GROUP BY p.id ORDER BY p.nombre"
        )

    def creditos_requeridos(self, programa_id: int) -> dict[str, int]:
        rows = self._q(
            "SELECT area, creditos_requeridos FROM programa_areas WHERE programa_id = ?", (programa_id,)
        )
        return {r["area"]: r["creditos_requeridos"] for r in rows}

    # ---------------------------------------------------------- estudiantes
    def agregar_estudiante(self, matricula: str, nombre: str, apellidos: str, programa_id: int,
                           correo: str = "", periodo_ingreso: str = "", tutor: str = "") -> int:
        return self._exec(
            "INSERT INTO estudiantes (matricula, nombre, apellidos, correo, programa_id, periodo_ingreso, tutor)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (matricula.strip().upper(), nombre.strip(), apellidos.strip(), correo.strip(),
             programa_id, periodo_ingreso.strip(), tutor.strip()),
        )

    def actualizar_estudiante(self, estudiante_id: int, **campos) -> None:
        permitidos = {"matricula", "nombre", "apellidos", "correo", "programa_id", "periodo_ingreso", "tutor"}
        campos = {k: v for k, v in campos.items() if k in permitidos}
        if not campos:
            return
        sets = ", ".join(f"{k} = ?" for k in campos)
        self._exec(f"UPDATE estudiantes SET {sets} WHERE id = ?", (*campos.values(), estudiante_id))

    def eliminar_estudiante(self, estudiante_id: int) -> None:
        self._exec("DELETE FROM estudiantes WHERE id = ?", (estudiante_id,))

    def estudiantes(self, filtro: str = "") -> list[sqlite3.Row]:
        like = f"%{filtro.strip()}%"
        return self._q(
            "SELECT e.*, p.nombre AS programa FROM estudiantes e JOIN programas p ON p.id = e.programa_id"
            " WHERE e.matricula LIKE ? OR e.nombre LIKE ? OR e.apellidos LIKE ?"
            " ORDER BY e.apellidos, e.nombre",
            (like, like, like),
        )

    def estudiante(self, estudiante_id: int) -> sqlite3.Row | None:
        rows = self._q(
            "SELECT e.*, p.nombre AS programa FROM estudiantes e JOIN programas p ON p.id = e.programa_id"
            " WHERE e.id = ?", (estudiante_id,)
        )
        return rows[0] if rows else None

    # ------------------------------------------------ experiencias educativas
    def agregar_experiencia(self, clave: str, nombre: str, area: str, creditos: int,
                            horas_teoria: int = 0, horas_practica: int = 0,
                            programa_id: int | None = None) -> int:
        if area not in AREAS:
            raise ReglaMEIFError(f"Área de formación inválida: {area}")
        return self._exec(
            "INSERT INTO experiencias (clave, nombre, area, creditos, horas_teoria, horas_practica, programa_id)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (clave.strip().upper(), nombre.strip(), area, creditos, horas_teoria, horas_practica, programa_id),
        )

    def eliminar_experiencia(self, ee_id: int) -> None:
        if self._q("SELECT 1 FROM inscripciones WHERE ee_id = ? LIMIT 1", (ee_id,)):
            raise ReglaMEIFError("No se puede eliminar: la experiencia educativa tiene inscripciones.")
        self._exec("DELETE FROM experiencias WHERE id = ?", (ee_id,))

    def experiencias(self, programa_id: int | None = None) -> list[sqlite3.Row]:
        sql = (
            "SELECT x.*, p.nombre AS programa,"
            " (SELECT GROUP_CONCAT(r.clave, ', ') FROM prerrequisitos pr"
            "   JOIN experiencias r ON r.id = pr.requiere_id WHERE pr.ee_id = x.id) AS prerrequisitos"
            " FROM experiencias x LEFT JOIN programas p ON p.id = x.programa_id"
        )
        if programa_id is None:
            return self._q(sql + ORDEN_AREAS)
        return self._q(sql + " WHERE x.programa_id IS NULL OR x.programa_id = ?" + ORDEN_AREAS,
                       (programa_id,))

    def agregar_prerrequisito(self, ee_id: int, requiere_id: int) -> None:
        if ee_id == requiere_id:
            raise ReglaMEIFError("Una experiencia educativa no puede ser prerrequisito de sí misma.")
        if ee_id in self._cadena_prerrequisitos(requiere_id):
            raise ReglaMEIFError("El prerrequisito generaría una dependencia circular.")
        self._exec("INSERT OR IGNORE INTO prerrequisitos (ee_id, requiere_id) VALUES (?, ?)", (ee_id, requiere_id))

    def _cadena_prerrequisitos(self, ee_id: int) -> set[int]:
        rows = self._q(
            "WITH RECURSIVE c(id) AS (SELECT requiere_id FROM prerrequisitos WHERE ee_id = ?"
            " UNION SELECT p.requiere_id FROM prerrequisitos p JOIN c ON p.ee_id = c.id) SELECT id FROM c",
            (ee_id,),
        )
        return {r["id"] for r in rows}

    # ----------------------------------------------------------- inscripción
    def aprobadas(self, estudiante_id: int) -> set[int]:
        rows = self._q(
            "SELECT DISTINCT ee_id FROM inscripciones WHERE estudiante_id = ? AND calificacion >= ?",
            (estudiante_id, CALIFICACION_MINIMA),
        )
        return {r["ee_id"] for r in rows}

    def creditos_en_periodo(self, estudiante_id: int, periodo: str) -> int:
        row = self._q(
            "SELECT COALESCE(SUM(x.creditos), 0) AS c FROM inscripciones i"
            " JOIN experiencias x ON x.id = i.ee_id WHERE i.estudiante_id = ? AND i.periodo = ?",
            (estudiante_id, periodo),
        )[0]
        return row["c"]

    def inscribir(self, estudiante_id: int, ee_id: int, periodo: str) -> int:
        """Inscribe validando las reglas del MEIF."""
        periodo = periodo.strip()
        if not periodo:
            raise ReglaMEIFError("Indica el periodo escolar.")
        est = self.estudiante(estudiante_id)
        if est is None:
            raise ReglaMEIFError("Estudiante no encontrado.")
        ee = self._q("SELECT * FROM experiencias WHERE id = ?", (ee_id,))
        if not ee:
            raise ReglaMEIFError("Experiencia educativa no encontrada.")
        ee = ee[0]
        if ee["programa_id"] is not None and ee["programa_id"] != est["programa_id"]:
            raise ReglaMEIFError("La experiencia educativa no pertenece al programa del estudiante.")
        if ee_id in self.aprobadas(estudiante_id):
            raise ReglaMEIFError(f"{ee['clave']} ya está acreditada.")
        previas = self._q(
            "SELECT periodo, calificacion FROM inscripciones WHERE estudiante_id = ? AND ee_id = ?",
            (estudiante_id, ee_id),
        )
        if any(p["calificacion"] is None for p in previas):
            raise ReglaMEIFError(f"{ee['clave']} ya está en curso sin calificación.")
        if len(previas) >= MAX_INSCRIPCIONES_POR_EE:
            raise ReglaMEIFError(
                f"{ee['clave']} ya agotó sus {MAX_INSCRIPCIONES_POR_EE} inscripciones permitidas."
            )
        aprob = self.aprobadas(estudiante_id)
        pendientes = [
            r["clave"] for r in self._q(
                "SELECT r.id, r.clave FROM prerrequisitos p JOIN experiencias r ON r.id = p.requiere_id"
                " WHERE p.ee_id = ? ORDER BY r.clave", (ee_id,))
            if r["id"] not in aprob
        ]
        if pendientes:
            raise ReglaMEIFError(f"Faltan prerrequisitos: {', '.join(pendientes)}.")
        prog = self._q("SELECT creditos_max_periodo FROM programas WHERE id = ?", (est["programa_id"],))[0]
        carga = self.creditos_en_periodo(estudiante_id, periodo) + ee["creditos"]
        if carga > prog["creditos_max_periodo"]:
            raise ReglaMEIFError(
                f"Se excede la carga máxima de {prog['creditos_max_periodo']} créditos en {periodo} ({carga})."
            )
        return self._exec(
            "INSERT INTO inscripciones (estudiante_id, ee_id, periodo) VALUES (?, ?, ?)",
            (estudiante_id, ee_id, periodo),
        )

    def calificar(self, inscripcion_id: int, calificacion: float | None, tipo: str = "ordinario") -> None:
        if tipo not in TIPOS_EVALUACION:
            raise ReglaMEIFError(f"Tipo de evaluación inválido: {tipo}")
        if calificacion is not None and not 0 <= calificacion <= 10:
            raise ReglaMEIFError("La calificación debe estar entre 0 y 10.")
        self._exec("UPDATE inscripciones SET calificacion = ?, tipo = ? WHERE id = ?",
                   (calificacion, tipo, inscripcion_id))

    def baja(self, inscripcion_id: int) -> None:
        row = self._q("SELECT calificacion FROM inscripciones WHERE id = ?", (inscripcion_id,))
        if row and row[0]["calificacion"] is not None:
            raise ReglaMEIFError("No se puede dar de baja una inscripción ya calificada.")
        self._exec("DELETE FROM inscripciones WHERE id = ?", (inscripcion_id,))

    def inscripciones(self, estudiante_id: int) -> list[sqlite3.Row]:
        return self._q(
            "SELECT i.*, x.clave, x.nombre, x.area, x.creditos,"
            " (SELECT COUNT(*) FROM inscripciones j WHERE j.estudiante_id = i.estudiante_id"
            "   AND j.ee_id = i.ee_id AND j.id <= i.id) AS oportunidad"
            " FROM inscripciones i JOIN experiencias x ON x.id = i.ee_id"
            " WHERE i.estudiante_id = ? ORDER BY i.periodo, x.clave",
            (estudiante_id,),
        )

    # ---------------------------------------------------------------- avance
    def avance(self, estudiante_id: int) -> list[AvanceArea]:
        est = self.estudiante(estudiante_id)
        if est is None:
            return []
        req = self.creditos_requeridos(est["programa_id"])
        rows = self._q(
            "SELECT x.area, SUM(x.creditos) AS c FROM experiencias x WHERE x.id IN ("
            "  SELECT ee_id FROM inscripciones WHERE estudiante_id = ? AND calificacion >= ?)"
            " GROUP BY x.area",
            (estudiante_id, CALIFICACION_MINIMA),
        )
        aprob = {r["area"]: r["c"] for r in rows}
        return [AvanceArea(a, req.get(a, 0), aprob.get(a, 0)) for a in AREAS]

    def promedio(self, estudiante_id: int) -> float | None:
        """Promedio de la última calificación de cada EE cursada."""
        row = self._q(
            "SELECT AVG(calificacion) AS p FROM inscripciones i WHERE estudiante_id = ?"
            " AND calificacion IS NOT NULL AND id = (SELECT MAX(id) FROM inscripciones j"
            "   WHERE j.estudiante_id = i.estudiante_id AND j.ee_id = i.ee_id AND calificacion IS NOT NULL)",
            (estudiante_id,),
        )[0]
        return round(row["p"], 2) if row["p"] is not None else None

    def exportar_kardex(self, estudiante_id: int, ruta: str | Path) -> None:
        est = self.estudiante(estudiante_id)
        with open(ruta, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["Matrícula", est["matricula"]])
            w.writerow(["Nombre", f"{est['nombre']} {est['apellidos']}"])
            w.writerow(["Programa", est["programa"]])
            w.writerow(["Promedio", self.promedio(estudiante_id) or ""])
            w.writerow([])
            w.writerow(["Periodo", "Clave", "Experiencia educativa", "Área", "Créditos",
                        "Oportunidad", "Tipo", "Calificación", "Estado"])
            for i in self.inscripciones(estudiante_id):
                w.writerow([i["periodo"], i["clave"], i["nombre"], AREAS[i["area"]], i["creditos"],
                            i["oportunidad"], i["tipo"], "" if i["calificacion"] is None else i["calificacion"],
                            estado(i["calificacion"])])
            w.writerow([])
            w.writerow(["Área", "Créditos aprobados", "Créditos requeridos", "%"])
            for a in self.avance(estudiante_id):
                w.writerow([AREAS[a.area], a.aprobados, a.requeridos, f"{a.porcentaje:.1f}"])

    # --------------------------------------------------------------- tutorías
    def agregar_tutoria(self, estudiante_id: int, fecha: str, tutor: str, tema: str,
                        observaciones: str = "") -> int:
        return self._exec(
            "INSERT INTO tutorias (estudiante_id, fecha, tutor, tema, observaciones) VALUES (?, ?, ?, ?, ?)",
            (estudiante_id, fecha, tutor.strip(), tema.strip(), observaciones.strip()),
        )

    def eliminar_tutoria(self, tutoria_id: int) -> None:
        self._exec("DELETE FROM tutorias WHERE id = ?", (tutoria_id,))

    def tutorias(self, estudiante_id: int) -> list[sqlite3.Row]:
        return self._q("SELECT * FROM tutorias WHERE estudiante_id = ? ORDER BY fecha DESC", (estudiante_id,))

    # ------------------------------------------------------------ datos demo
    def vacia(self) -> bool:
        return not self._q("SELECT 1 FROM programas LIMIT 1")

    def cargar_demo(self) -> None:
        pid = self.agregar_programa(
            "ISC", "Ingeniería de Software",
            {"AFBG": 30, "AFID": 60, "AFD": 200, "AFT": 40, "AFEL": 20}, creditos_max_periodo=54,
        )
        ees = [
            ("AFBG-001", "Lectura y escritura de textos académicos", "AFBG", 4, 2, 2, None),
            ("AFBG-002", "Pensamiento crítico para la solución de problemas", "AFBG", 4, 2, 2, None),
            ("AFBG-003", "Literacidad digital", "AFBG", 4, 2, 2, None),
            ("AFBG-004", "Lengua I", "AFBG", 4, 0, 4, None),
            ("AFBG-005", "Lengua II", "AFBG", 4, 0, 4, None),
            ("ISC-101", "Matemáticas discretas", "AFID", 8, 3, 2, pid),
            ("ISC-102", "Programación", "AFID", 10, 3, 4, pid),
            ("ISC-201", "Estructuras de datos", "AFD", 10, 3, 4, pid),
            ("ISC-202", "Bases de datos", "AFD", 8, 3, 2, pid),
            ("ISC-301", "Ingeniería de requisitos", "AFD", 8, 3, 2, pid),
            ("ISC-401", "Experiencia recepcional", "AFT", 12, 0, 12, pid),
            ("ISC-402", "Servicio social", "AFT", 12, 0, 12, pid),
            ("AFEL-010", "Taller de fotografía", "AFEL", 4, 0, 4, None),
        ]
        ids = {c: self.agregar_experiencia(c, n, a, cr, ht, hp, p) for c, n, a, cr, ht, hp, p in ees}
        self.agregar_prerrequisito(ids["AFBG-005"], ids["AFBG-004"])
        self.agregar_prerrequisito(ids["ISC-201"], ids["ISC-102"])
        self.agregar_prerrequisito(ids["ISC-202"], ids["ISC-201"])
        e1 = self.agregar_estudiante("S24000001", "Ana", "García López", pid,
                                     "ana@example.edu", "2024-AGO", "Dra. Martínez")
        self.agregar_estudiante("S24000002", "Luis", "Hernández Ruiz", pid,
                                "luis@example.edu", "2024-AGO", "Dra. Martínez")
        for clave, cal in [("AFBG-001", 9), ("AFBG-004", 8.5), ("ISC-101", 5), ("ISC-102", 9.5)]:
            iid = self.inscribir(e1, ids[clave], "2024-AGO")
            self.calificar(iid, cal)
        self.inscribir(e1, ids["ISC-101"], "2025-FEB")
        self.inscribir(e1, ids["ISC-201"], "2025-FEB")
        self.agregar_tutoria(e1, "2024-09-15", "Dra. Martínez", "Planeación de trayectoria",
                             "Se recomienda cursar Lengua II en el siguiente periodo.")


def estado(calificacion: float | None) -> str:
    if calificacion is None:
        return "En curso"
    return "Acreditada" if calificacion >= CALIFICACION_MINIMA else "No acreditada"
