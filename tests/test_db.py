import csv
import unittest

from meif.db import Database, ReglaMEIFError


class ReglasMEIFTest(unittest.TestCase):
    def setUp(self):
        self.db = Database()
        self.pid = self.db.agregar_programa("ISC", "Ing. Software", {"AFBG": 8, "AFD": 10}, creditos_max_periodo=20)
        self.otro = self.db.agregar_programa("DER", "Derecho", {"AFD": 10})
        self.e = self.db.agregar_estudiante("s1", "Ana", "García", self.pid)
        self.a = self.db.agregar_experiencia("A", "Lengua I", "AFBG", 4)
        self.b = self.db.agregar_experiencia("B", "Lengua II", "AFBG", 4)
        self.c = self.db.agregar_experiencia("C", "Datos", "AFD", 10, programa_id=self.pid)
        self.d = self.db.agregar_experiencia("D", "Civil", "AFD", 10, programa_id=self.otro)
        self.db.agregar_prerrequisito(self.b, self.a)

    def test_matricula_normalizada(self):
        self.assertEqual(self.db.estudiante(self.e)["matricula"], "S1")

    def test_prerrequisito_faltante(self):
        with self.assertRaisesRegex(ReglaMEIFError, "prerrequisitos: A"):
            self.db.inscribir(self.e, self.b, "P1")

    def test_prerrequisito_circular(self):
        with self.assertRaises(ReglaMEIFError):
            self.db.agregar_prerrequisito(self.a, self.b)

    def test_flujo_aprobacion_y_avance(self):
        i = self.db.inscribir(self.e, self.a, "P1")
        self.db.calificar(i, 8)
        self.db.inscribir(self.e, self.b, "P2")  # ya cumple prerrequisito
        avance = {a.area: a for a in self.db.avance(self.e)}
        self.assertEqual(avance["AFBG"].aprobados, 4)
        self.assertEqual(avance["AFBG"].porcentaje, 50.0)
        self.assertEqual(self.db.promedio(self.e), 8.0)
        with self.assertRaisesRegex(ReglaMEIFError, "acreditada"):
            self.db.inscribir(self.e, self.a, "P3")

    def test_maximo_dos_inscripciones(self):
        for p in ("P1", "P2"):
            self.db.calificar(self.db.inscribir(self.e, self.a, p), 5)
        with self.assertRaisesRegex(ReglaMEIFError, "agotó"):
            self.db.inscribir(self.e, self.a, "P3")

    def test_en_curso_no_se_duplica(self):
        self.db.inscribir(self.e, self.a, "P1")
        with self.assertRaisesRegex(ReglaMEIFError, "en curso"):
            self.db.inscribir(self.e, self.a, "P2")

    def test_carga_maxima(self):
        self.db.inscribir(self.e, self.c, "P1")
        self.db.inscribir(self.e, self.a, "P1")
        x = self.db.agregar_experiencia("X", "Extra", "AFEL", 8)
        with self.assertRaisesRegex(ReglaMEIFError, "carga máxima"):
            self.db.inscribir(self.e, x, "P1")

    def test_ee_de_otro_programa(self):
        with self.assertRaisesRegex(ReglaMEIFError, "programa"):
            self.db.inscribir(self.e, self.d, "P1")

    def test_promedio_usa_ultima_oportunidad(self):
        self.db.calificar(self.db.inscribir(self.e, self.a, "P1"), 4)
        self.db.calificar(self.db.inscribir(self.e, self.a, "P2"), 8)
        self.assertEqual(self.db.promedio(self.e), 8.0)
        self.assertEqual([i["oportunidad"] for i in self.db.inscripciones(self.e)], [1, 2])

    def test_baja_solo_sin_calificacion(self):
        i = self.db.inscribir(self.e, self.a, "P1")
        self.db.calificar(i, 9)
        with self.assertRaises(ReglaMEIFError):
            self.db.baja(i)

    def test_no_eliminar_ee_con_inscripciones(self):
        self.db.inscribir(self.e, self.a, "P1")
        with self.assertRaises(ReglaMEIFError):
            self.db.eliminar_experiencia(self.a)

    def test_calificacion_fuera_de_rango(self):
        i = self.db.inscribir(self.e, self.a, "P1")
        with self.assertRaises(ReglaMEIFError):
            self.db.calificar(i, 11)

    def test_exportar_kardex(self):
        self.db.calificar(self.db.inscribir(self.e, self.a, "P1"), 9)
        import tempfile, os
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "k.csv")
            self.db.exportar_kardex(self.e, ruta)
            with open(ruta, encoding="utf-8-sig") as f:
                filas = list(csv.reader(f))
        self.assertIn(["P1", "A", "Lengua I", "Básica General", "4", "1", "ordinario", "9.0", "Acreditada"], filas)

    def test_demo(self):
        db = Database()
        db.cargar_demo()
        self.assertEqual(len(db.estudiantes()), 2)
        self.assertGreater(len(db.experiencias()), 10)


if __name__ == "__main__":
    unittest.main()
