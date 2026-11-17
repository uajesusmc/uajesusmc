"""Ventana principal de la plataforma MEIF."""

from __future__ import annotations

import sqlite3

from PySide6.QtCore import QDate, Qt, Signal
from PySide6.QtWidgets import (
    QAbstractItemView, QComboBox, QDateEdit, QDoubleSpinBox, QFileDialog, QFormLayout,
    QGridLayout, QGroupBox, QHBoxLayout, QHeaderView, QLabel, QLineEdit, QMainWindow,
    QMessageBox, QProgressBar, QPushButton, QSpinBox, QTableWidget, QTableWidgetItem,
    QTabWidget, QTextEdit, QVBoxLayout, QWidget,
)

from meif import __version__
from meif.db import AREAS, TIPOS_EVALUACION, Database, ReglaMEIFError, estado


# ---------------------------------------------------------------- utilidades
def tabla(columnas: list[str]) -> QTableWidget:
    t = QTableWidget(0, len(columnas))
    t.setHorizontalHeaderLabels(columnas)
    t.setSelectionBehavior(QAbstractItemView.SelectRows)
    t.setSelectionMode(QAbstractItemView.SingleSelection)
    t.setEditTriggers(QAbstractItemView.NoEditTriggers)
    t.setAlternatingRowColors(True)
    t.verticalHeader().setVisible(False)
    t.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
    t.horizontalHeader().setStretchLastSection(True)
    return t


def llenar(t: QTableWidget, filas: list[tuple], ids: list[int]) -> None:
    t.setRowCount(0)
    for r, (fila, rid) in enumerate(zip(filas, ids)):
        t.insertRow(r)
        for c, valor in enumerate(fila):
            item = QTableWidgetItem("" if valor is None else str(valor))
            if c == 0:
                item.setData(Qt.UserRole, rid)
            t.setItem(r, c, item)


def id_seleccionado(t: QTableWidget) -> int | None:
    fila = t.currentRow()
    if fila < 0 or t.item(fila, 0) is None:
        return None
    return t.item(fila, 0).data(Qt.UserRole)


def error(parent: QWidget, exc: Exception) -> None:
    if isinstance(exc, sqlite3.IntegrityError):
        msg = "Registro duplicado o con datos incompletos.\n\n" + str(exc)
    else:
        msg = str(exc)
    QMessageBox.warning(parent, "MEIF", msg)


def boton(texto: str, slot) -> QPushButton:
    b = QPushButton(texto)
    b.clicked.connect(slot)
    return b


class Pestana(QWidget):
    cambio = Signal()

    def __init__(self, db: Database):
        super().__init__()
        self.db = db

    def refrescar(self) -> None:  # pragma: no cover - lo implementan las subclases
        pass


# ------------------------------------------------------------------ programas
class ProgramasTab(Pestana):
    def __init__(self, db: Database):
        super().__init__(db)
        self.tabla = tabla(["Clave", "Programa educativo", "Créditos totales", "Máx. créditos/periodo"])
        self.clave, self.nombre = QLineEdit(), QLineEdit()
        self.max_periodo = QSpinBox(maximum=200, value=54)
        self.creditos = {a: QSpinBox(maximum=500) for a in AREAS}

        form = QFormLayout()
        form.addRow("Clave", self.clave)
        form.addRow("Nombre", self.nombre)
        form.addRow("Máx. créditos por periodo", self.max_periodo)
        for a, sb in self.creditos.items():
            form.addRow(f"Créditos {a} ({AREAS[a]})", sb)
        caja = QGroupBox("Nuevo programa educativo")
        v = QVBoxLayout(caja)
        v.addLayout(form)
        v.addWidget(boton("Agregar programa", self.agregar))
        v.addStretch()

        lay = QHBoxLayout(self)
        lay.addWidget(self.tabla, 3)
        lay.addWidget(caja, 2)

    def refrescar(self) -> None:
        ps = self.db.programas()
        llenar(self.tabla, [(p["clave"], p["nombre"], p["creditos_totales"], p["creditos_max_periodo"]) for p in ps],
               [p["id"] for p in ps])

    def agregar(self) -> None:
        try:
            if not self.clave.text().strip() or not self.nombre.text().strip():
                raise ReglaMEIFError("Clave y nombre son obligatorios.")
            self.db.agregar_programa(self.clave.text().strip().upper(), self.nombre.text().strip(),
                                     {a: sb.value() for a, sb in self.creditos.items()},
                                     self.max_periodo.value())
        except Exception as exc:
            return error(self, exc)
        self.clave.clear()
        self.nombre.clear()
        self.cambio.emit()


# ---------------------------------------------------------------- estudiantes
class EstudiantesTab(Pestana):
    def __init__(self, db: Database):
        super().__init__(db)
        self.buscar = QLineEdit(placeholderText="Buscar por matrícula, nombre o apellidos…")
        self.buscar.textChanged.connect(self.refrescar)
        self.tabla = tabla(["Matrícula", "Nombre", "Apellidos", "Programa", "Ingreso", "Tutor", "Correo"])
        self.tabla.itemSelectionChanged.connect(self.cargar)

        self.matricula, self.nombre, self.apellidos = QLineEdit(), QLineEdit(), QLineEdit()
        self.correo, self.ingreso, self.tutor = QLineEdit(), QLineEdit(placeholderText="p. ej. 2025-AGO"), QLineEdit()
        self.programa = QComboBox()

        form = QFormLayout()
        for etiqueta, w in [("Matrícula", self.matricula), ("Nombre(s)", self.nombre),
                            ("Apellidos", self.apellidos), ("Correo", self.correo),
                            ("Programa educativo", self.programa), ("Periodo de ingreso", self.ingreso),
                            ("Tutor académico", self.tutor)]:
            form.addRow(etiqueta, w)
        botones = QHBoxLayout()
        botones.addWidget(boton("Nuevo", self.limpiar))
        botones.addWidget(boton("Guardar", self.guardar))
        botones.addWidget(boton("Eliminar", self.eliminar))
        caja = QGroupBox("Datos del estudiante")
        v = QVBoxLayout(caja)
        v.addLayout(form)
        v.addLayout(botones)
        v.addStretch()

        izq = QVBoxLayout()
        izq.addWidget(self.buscar)
        izq.addWidget(self.tabla)
        lay = QHBoxLayout(self)
        lay.addLayout(izq, 3)
        lay.addWidget(caja, 2)
        self.actual: int | None = None

    def refrescar(self) -> None:
        sel = self.programa.currentData()
        self.programa.clear()
        for p in self.db.programas():
            self.programa.addItem(p["nombre"], p["id"])
        if sel is not None:
            self.programa.setCurrentIndex(max(0, self.programa.findData(sel)))
        es = self.db.estudiantes(self.buscar.text())
        llenar(self.tabla, [(e["matricula"], e["nombre"], e["apellidos"], e["programa"], e["periodo_ingreso"],
                             e["tutor"], e["correo"]) for e in es], [e["id"] for e in es])

    def cargar(self) -> None:
        eid = id_seleccionado(self.tabla)
        e = self.db.estudiante(eid) if eid else None
        if e is None:
            return
        self.actual = eid
        self.matricula.setText(e["matricula"])
        self.nombre.setText(e["nombre"])
        self.apellidos.setText(e["apellidos"])
        self.correo.setText(e["correo"] or "")
        self.ingreso.setText(e["periodo_ingreso"] or "")
        self.tutor.setText(e["tutor"] or "")
        self.programa.setCurrentIndex(self.programa.findData(e["programa_id"]))

    def limpiar(self) -> None:
        self.actual = None
        self.tabla.clearSelection()
        for w in (self.matricula, self.nombre, self.apellidos, self.correo, self.ingreso, self.tutor):
            w.clear()
        self.matricula.setFocus()

    def guardar(self) -> None:
        datos = dict(matricula=self.matricula.text().strip().upper(), nombre=self.nombre.text().strip(),
                     apellidos=self.apellidos.text().strip(), correo=self.correo.text().strip(),
                     programa_id=self.programa.currentData(), periodo_ingreso=self.ingreso.text().strip(),
                     tutor=self.tutor.text().strip())
        try:
            if not (datos["matricula"] and datos["nombre"] and datos["apellidos"]):
                raise ReglaMEIFError("Matrícula, nombre y apellidos son obligatorios.")
            if datos["programa_id"] is None:
                raise ReglaMEIFError("Registra primero un programa educativo.")
            if self.actual is None:
                self.actual = self.db.agregar_estudiante(**datos)
            else:
                self.db.actualizar_estudiante(self.actual, **datos)
        except Exception as exc:
            return error(self, exc)
        self.cambio.emit()

    def eliminar(self) -> None:
        if self.actual is None:
            return
        r = QMessageBox.question(self, "MEIF", "¿Eliminar al estudiante y todo su historial académico?")
        if r == QMessageBox.Yes:
            self.db.eliminar_estudiante(self.actual)
            self.limpiar()
            self.cambio.emit()


# ------------------------------------------------------ experiencias educativas
class ExperienciasTab(Pestana):
    def __init__(self, db: Database):
        super().__init__(db)
        self.tabla = tabla(["Clave", "Experiencia educativa", "Área", "Créditos", "HT", "HP",
                            "Programa", "Prerrequisitos"])
        self.clave, self.nombre = QLineEdit(), QLineEdit()
        self.area = QComboBox()
        for a, n in AREAS.items():
            self.area.addItem(f"{a} – {n}", a)
        self.creditos = QSpinBox(minimum=1, maximum=40, value=6)
        self.ht, self.hp = QSpinBox(maximum=40), QSpinBox(maximum=40)
        self.programa = QComboBox()
        self.prerreq = QComboBox()

        form = QFormLayout()
        for etiqueta, w in [("Clave", self.clave), ("Nombre", self.nombre), ("Área de formación", self.area),
                            ("Créditos", self.creditos), ("Horas teoría", self.ht), ("Horas práctica", self.hp),
                            ("Programa", self.programa)]:
            form.addRow(etiqueta, w)
        caja = QGroupBox("Nueva experiencia educativa")
        v = QVBoxLayout(caja)
        v.addLayout(form)
        v.addWidget(boton("Agregar experiencia educativa", self.agregar))

        caja2 = QGroupBox("Prerrequisito de la EE seleccionada")
        f2 = QFormLayout(caja2)
        f2.addRow("Requiere", self.prerreq)
        f2.addRow(boton("Agregar prerrequisito", self.agregar_prerreq))

        der = QVBoxLayout()
        der.addWidget(caja)
        der.addWidget(caja2)
        der.addWidget(boton("Eliminar EE seleccionada", self.eliminar))
        der.addStretch()
        lay = QHBoxLayout(self)
        lay.addWidget(self.tabla, 3)
        lay.addLayout(der, 2)

    def refrescar(self) -> None:
        self.programa.clear()
        self.programa.addItem("Todos (transversal: AFBG / AFEL)", None)
        for p in self.db.programas():
            self.programa.addItem(p["nombre"], p["id"])
        xs = self.db.experiencias()
        self.prerreq.clear()
        for x in xs:
            self.prerreq.addItem(f"{x['clave']} – {x['nombre']}", x["id"])
        llenar(self.tabla, [(x["clave"], x["nombre"], x["area"], x["creditos"], x["horas_teoria"],
                             x["horas_practica"], x["programa"] or "Todos", x["prerrequisitos"]) for x in xs],
               [x["id"] for x in xs])

    def agregar(self) -> None:
        try:
            if not self.clave.text().strip() or not self.nombre.text().strip():
                raise ReglaMEIFError("Clave y nombre son obligatorios.")
            self.db.agregar_experiencia(self.clave.text(), self.nombre.text(), self.area.currentData(),
                                        self.creditos.value(), self.ht.value(), self.hp.value(),
                                        self.programa.currentData())
        except Exception as exc:
            return error(self, exc)
        self.clave.clear()
        self.nombre.clear()
        self.cambio.emit()

    def agregar_prerreq(self) -> None:
        ee = id_seleccionado(self.tabla)
        if ee is None or self.prerreq.currentData() is None:
            return QMessageBox.information(self, "MEIF", "Selecciona una experiencia educativa en la tabla.")
        try:
            self.db.agregar_prerrequisito(ee, self.prerreq.currentData())
        except Exception as exc:
            return error(self, exc)
        self.cambio.emit()

    def eliminar(self) -> None:
        ee = id_seleccionado(self.tabla)
        if ee is None:
            return
        try:
            self.db.eliminar_experiencia(ee)
        except Exception as exc:
            return error(self, exc)
        self.cambio.emit()


# ------------------------------------------------------- selector de estudiante
class SelectorEstudiante(QComboBox):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.setMinimumWidth(320)

    def refrescar(self) -> None:
        actual = self.currentData()
        self.blockSignals(True)
        self.clear()
        for e in self.db.estudiantes():
            self.addItem(f"{e['matricula']} – {e['apellidos']}, {e['nombre']}", e["id"])
        idx = self.findData(actual) if actual is not None else 0
        self.setCurrentIndex(max(0, idx))
        self.blockSignals(False)


# ---------------------------------------------------------- trayectoria escolar
class TrayectoriaTab(Pestana):
    def __init__(self, db: Database):
        super().__init__(db)
        self.estudiante = SelectorEstudiante(db)
        self.estudiante.currentIndexChanged.connect(self.refrescar_estudiante)
        self.info = QLabel()

        self.ee = QComboBox()
        self.periodo = QLineEdit(placeholderText="p. ej. 2025-AGO")
        self.tabla = tabla(["Periodo", "Clave", "Experiencia educativa", "Área", "Créditos",
                            "Oportunidad", "Tipo", "Calificación", "Estado"])
        self.calif = QDoubleSpinBox(minimum=0, maximum=10, decimals=1, singleStep=0.5)
        self.tipo = QComboBox()
        self.tipo.addItems(TIPOS_EVALUACION)

        arriba = QHBoxLayout()
        arriba.addWidget(QLabel("Estudiante:"))
        arriba.addWidget(self.estudiante)
        arriba.addWidget(self.info, 1)
        arriba.addWidget(boton("Exportar kárdex (CSV)…", self.exportar))

        insc = QGroupBox("Inscripción")
        fi = QFormLayout(insc)
        fi.addRow("Experiencia educativa", self.ee)
        fi.addRow("Periodo", self.periodo)
        fi.addRow(boton("Inscribir", self.inscribir))

        cal = QGroupBox("Calificación de la inscripción seleccionada")
        fc = QFormLayout(cal)
        fc.addRow("Calificación", self.calif)
        fc.addRow("Tipo de evaluación", self.tipo)
        hb = QHBoxLayout()
        hb.addWidget(boton("Registrar", self.calificar))
        hb.addWidget(boton("Dar de baja", self.baja))
        fc.addRow(hb)

        av = QGroupBox("Avance crediticio por área de formación")
        self.barras: dict[str, QProgressBar] = {}
        g = QGridLayout(av)
        for r, (a, n) in enumerate(AREAS.items()):
            g.addWidget(QLabel(f"{a}  {n}"), r, 0)
            bar = QProgressBar()
            bar.setTextVisible(True)
            g.addWidget(bar, r, 1)
            self.barras[a] = bar
        self.total = QProgressBar()
        g.addWidget(QLabel("<b>Total</b>"), len(AREAS), 0)
        g.addWidget(self.total, len(AREAS), 1)

        der = QVBoxLayout()
        der.addWidget(insc)
        der.addWidget(cal)
        der.addWidget(av)
        der.addStretch()
        centro = QHBoxLayout()
        centro.addWidget(self.tabla, 3)
        centro.addLayout(der, 2)
        lay = QVBoxLayout(self)
        lay.addLayout(arriba)
        lay.addLayout(centro)

    def refrescar(self) -> None:
        self.estudiante.refrescar()
        self.refrescar_estudiante()

    def refrescar_estudiante(self) -> None:
        eid = self.estudiante.currentData()
        est = self.db.estudiante(eid) if eid else None
        self.ee.clear()
        if est is None:
            self.info.setText("")
            self.tabla.setRowCount(0)
            return
        aprob = self.db.aprobadas(eid)
        for x in self.db.experiencias(est["programa_id"]):
            if x["id"] not in aprob:
                self.ee.addItem(f"{x['clave']} – {x['nombre']} ({x['creditos']} cr.)", x["id"])
        ins = self.db.inscripciones(eid)
        filas = [(i["periodo"], i["clave"], i["nombre"], i["area"], i["creditos"], i["oportunidad"],
                  i["tipo"], i["calificacion"], estado(i["calificacion"])) for i in ins]
        llenar(self.tabla, filas, [i["id"] for i in ins])
        for r, i in enumerate(ins):
            color = {"Acreditada": Qt.darkGreen, "No acreditada": Qt.red}.get(estado(i["calificacion"]))
            if color is not None:
                self.tabla.item(r, 8).setForeground(color)
        avance = self.db.avance(eid)
        for a in avance:
            bar = self.barras[a.area]
            bar.setMaximum(max(a.requeridos, 1))
            bar.setValue(min(a.aprobados, max(a.requeridos, 1)))
            bar.setFormat(f"{a.aprobados} / {a.requeridos} créditos ({a.porcentaje:.0f}%)")
        req = sum(a.requeridos for a in avance)
        apr = sum(min(a.aprobados, a.requeridos) for a in avance)
        self.total.setMaximum(max(req, 1))
        self.total.setValue(apr)
        self.total.setFormat(f"{apr} / {req} créditos ({100 * apr / req if req else 0:.0f}%)")
        prom = self.db.promedio(eid)
        self.info.setText(f"  {est['programa']}  ·  Promedio: {prom if prom is not None else '—'}"
                          f"  ·  Tutor: {est['tutor'] or '—'}")

    def inscribir(self) -> None:
        eid, ee = self.estudiante.currentData(), self.ee.currentData()
        if eid is None or ee is None:
            return
        try:
            self.db.inscribir(eid, ee, self.periodo.text())
        except Exception as exc:
            return error(self, exc)
        self.refrescar_estudiante()

    def calificar(self) -> None:
        iid = id_seleccionado(self.tabla)
        if iid is None:
            return QMessageBox.information(self, "MEIF", "Selecciona una inscripción en la tabla.")
        try:
            self.db.calificar(iid, self.calif.value(), self.tipo.currentText())
        except Exception as exc:
            return error(self, exc)
        self.refrescar_estudiante()

    def baja(self) -> None:
        iid = id_seleccionado(self.tabla)
        if iid is None:
            return
        try:
            self.db.baja(iid)
        except Exception as exc:
            return error(self, exc)
        self.refrescar_estudiante()

    def exportar(self) -> None:
        eid = self.estudiante.currentData()
        if eid is None:
            return
        est = self.db.estudiante(eid)
        ruta, _ = QFileDialog.getSaveFileName(self, "Exportar kárdex", f"kardex_{est['matricula']}.csv",
                                              "CSV (*.csv)")
        if ruta:
            self.db.exportar_kardex(eid, ruta)
            QMessageBox.information(self, "MEIF", f"Kárdex exportado a:\n{ruta}")


# ------------------------------------------------------------------- tutorías
class TutoriasTab(Pestana):
    def __init__(self, db: Database):
        super().__init__(db)
        self.estudiante = SelectorEstudiante(db)
        self.estudiante.currentIndexChanged.connect(self.refrescar_estudiante)
        self.tabla = tabla(["Fecha", "Tutor", "Tema", "Observaciones"])
        self.fecha = QDateEdit(QDate.currentDate(), calendarPopup=True, displayFormat="yyyy-MM-dd")
        self.tutor, self.tema = QLineEdit(), QLineEdit()
        self.obs = QTextEdit()

        caja = QGroupBox("Registrar sesión de tutoría")
        f = QFormLayout(caja)
        f.addRow("Fecha", self.fecha)
        f.addRow("Tutor", self.tutor)
        f.addRow("Tema", self.tema)
        f.addRow("Observaciones", self.obs)
        hb = QHBoxLayout()
        hb.addWidget(boton("Registrar", self.agregar))
        hb.addWidget(boton("Eliminar seleccionada", self.eliminar))
        f.addRow(hb)

        arriba = QHBoxLayout()
        arriba.addWidget(QLabel("Estudiante:"))
        arriba.addWidget(self.estudiante)
        arriba.addStretch()
        centro = QHBoxLayout()
        centro.addWidget(self.tabla, 3)
        centro.addWidget(caja, 2)
        lay = QVBoxLayout(self)
        lay.addLayout(arriba)
        lay.addLayout(centro)

    def refrescar(self) -> None:
        self.estudiante.refrescar()
        self.refrescar_estudiante()

    def refrescar_estudiante(self) -> None:
        eid = self.estudiante.currentData()
        est = self.db.estudiante(eid) if eid else None
        if est is None:
            self.tabla.setRowCount(0)
            return
        if not self.tutor.text():
            self.tutor.setText(est["tutor"] or "")
        ts = self.db.tutorias(eid)
        llenar(self.tabla, [(t["fecha"], t["tutor"], t["tema"], t["observaciones"]) for t in ts],
               [t["id"] for t in ts])

    def agregar(self) -> None:
        eid = self.estudiante.currentData()
        if eid is None:
            return
        if not self.tutor.text().strip() or not self.tema.text().strip():
            return error(self, ReglaMEIFError("Tutor y tema son obligatorios."))
        self.db.agregar_tutoria(eid, self.fecha.date().toString("yyyy-MM-dd"), self.tutor.text(),
                                self.tema.text(), self.obs.toPlainText())
        self.tema.clear()
        self.obs.clear()
        self.refrescar_estudiante()

    def eliminar(self) -> None:
        tid = id_seleccionado(self.tabla)
        if tid is not None:
            self.db.eliminar_tutoria(tid)
            self.refrescar_estudiante()


# ------------------------------------------------------------ ventana principal
class MainWindow(QMainWindow):
    def __init__(self, db: Database):
        super().__init__()
        self.db = db
        self.setWindowTitle(f"Plataforma MEIF {__version__} — {db.path}")
        self.resize(1280, 760)
        self.tabs = QTabWidget()
        self.paginas: list[Pestana] = [
            TrayectoriaTab(db), EstudiantesTab(db), ExperienciasTab(db), TutoriasTab(db), ProgramasTab(db),
        ]
        for nombre, p in zip(["Trayectoria escolar", "Estudiantes", "Experiencias educativas",
                              "Tutorías", "Programas educativos"], self.paginas):
            self.tabs.addTab(p, nombre)
            p.cambio.connect(self.refrescar)
        self.tabs.currentChanged.connect(lambda i: self.paginas[i].refrescar())
        self.setCentralWidget(self.tabs)
        self.statusBar().showMessage(
            "Modelo Educativo Integral y Flexible · calificación mínima aprobatoria 6 · máximo 2 inscripciones por EE"
        )
        self.refrescar()

    def refrescar(self) -> None:
        for p in self.paginas:
            p.refrescar()
