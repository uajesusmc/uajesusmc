# Manual de usuario – MEIF Eventos

## 0. Membrete, firmas y documentos institucionales

### Membrete (encabezado de los documentos)
**Configuración › Membrete**: nombre, subtítulo, lema, NIT, dirección, teléfono, correo y colores. La vista previa
se actualiza mientras escribe; **Vista previa en PDF** muestra una hoja de ejemplo. El membrete (encabezado con logo
y datos de contacto, y pie con numeración) se imprime en todos los documentos: oficios, listados, agenda, horarios y reportes.
El logotipo se carga en **Configuración › Logotipo**.

### Firmas del Presidente y del Secretario
1. Un administrador crea (o edita) el usuario del Presidente y el del Secretario y en **«Firma como»** elige la función.
   Pueden tener rol «Solo consulta»: igual podrán gestionar su firma.
2. Cada uno inicia sesión con su usuario y pulsa **«Mi firma»** (abajo, en el menú): escribe su nombre y cargo como
   deben aparecer y **sube la imagen de su firma** (PNG con fondo transparente o JPG sobre fondo blanco).
3. Nadie más puede cambiar esa firma, salvo un administrador (**Configuración › Firmas**). Queda registrado quién la
   subió y cuándo.
4. Las firmas aparecen en los **certificados** (Presidente y Secretario) y, si la casilla está activa en
   **Configuración › Institución y certificado**, al final de los **documentos PDF**.

### Documentos institucionales
Menú **Documentos institucionales › Nuevo documento**: elija el tipo (Oficio, Constancia, Circular, Carta, Comunicado,
Acta, Invitación); se carga una plantilla. Complete destinatario, asunto y contenido, marque quién firma y pulse
**Generar PDF**. Cada documento recibe un consecutivo por tipo y año (p. ej. `MEIF-OF-2026-001`) y queda en el listado
para volver a verlo, imprimirlo o guardarlo. Anular un documento no libera su número.

## 1. Primer ingreso

1. Abra **MEIF Eventos** desde el acceso directo del escritorio.
2. La primera vez se pide crear la cuenta del **administrador**: nombre, usuario y contraseña
   (mínimo 8 caracteres, con letras y números).
3. Configure el **membrete**, el **logotipo** y las **firmas** del Presidente y del Secretario (ver sección 0).

## 2. Crear un evento

1. **Eventos del año › Nuevo evento**.
2. Complete nombre, tipo (Olimpiada, Cursillo, Preparación Saber 11°, Feria…), fechas, lugar,
   cupo (opcional) y la **asistencia mínima para certificar** (por defecto 80 %).
3. Al guardar se abre el evento con sus pestañas.

## 3. Foto inaugural y banner

- En el evento, pestaña **Resumen y foto › Subir foto inaugural** (JPG o PNG, hasta 15 MB).
  La foto queda como **banner** de la pantalla de Inicio.
- Desde **Inicio › Cambiar banner** puede elegir otro evento y subir otra foto, o volver a usar
  una foto ya cargada.
- Si tiene varios eventos con foto, use **Usar como banner** en el evento que quiera mostrar.

## 4. Organización y horario de los docentes

Desde el menú lateral **Organización y horarios** (elija el evento arriba) o, dentro del evento, en la pestaña **Organización y horario docente**:

1. **Aulas**: registre las aulas y espacios (nombre, capacidad, ubicación, recursos). Son comunes a todos los eventos.
2. **Cursillos, docentes y aulas › Nuevo cursillo**: nombre del cursillo, área, nivel o grupo,
   **docente que lo dicta**, **aula asignada** y cupo. Si el cupo supera la capacidad del aula, el sistema avisa.
3. **Programar horario** (en cada cursillo): elija los días de clase y el rango de fechas (o una sola fecha)
   y las horas. Antes de guardar, el sistema revisa cada sesión y **no deja guardar** si el docente ya
   tiene otra clase a esa hora o si el aula está ocupada. Puede guardar solo las sesiones sin cruce.
4. **Horario de docentes**: vista semanal con cada docente, la hora, el **cursillo que dicta** y el **aula**,
   o la lista completa. **Horario PDF / Excel** lo imprime para todos los docentes o para uno solo
   (con el total de horas de cada docente).

Si cambia el docente o el aula de un cursillo, sus sesiones ya programadas se actualizan (verificando cruces).
Las sesiones también aparecen en la **Agenda** y en **Asistencia**.

## 4b. Agenda

1. Pestaña **Agenda › Agregar actividad**: título, tipo, área, ponente, lugar, fecha y horas.
2. El sistema revisa mientras escribe y **no deja guardar** si:
   - el ponente ya tiene otra actividad a esa hora (en cualquier evento),
   - el lugar ya está ocupado a esa hora en el mismo evento,
   - la actividad está duplicada o la fecha queda fuera del evento.
3. Los **recesos** no cuentan como horas académicas ni llevan asistencia.
4. **Agenda en PDF** genera el programa del evento para imprimir.

Registre antes a los ponentes en **Ponentes y docentes**.

## 5. Inscribir participantes

- **Inscribir**: busque participantes ya registrados y márquelos, o use **Registrar participante nuevo**.
- **Importar Excel**: descargue la plantilla, llénela (Identificación, Nombres y Apellidos son
  obligatorios), selecciónela y revise la **vista previa** antes de importar. Las personas ya
  registradas no se duplican: solo se inscriben.
- **Listado PDF** sale con una columna de firma para el control de ingreso.
- El sistema respeta el **cupo** del evento.

## 6. Asistencia

1. Pestaña **Asistencia**, elija la actividad.
2. Marque a los presentes (**Marcar todos** ayuda en la inauguración) y pulse **Guardar asistencia**.
3. Abajo verá el resumen: actividades asistidas, porcentaje, horas y si **cumple** el mínimo.

## 7. Certificados

1. Pestaña **Certificados** del evento.
2. **Generar todos los que cumplen** (o seleccione algunos y **Generar seleccionados**).
3. Use **Ver / imprimir** o **Guardar PDF**. Los generados juntos salen en un solo PDF para imprimir.
4. Cada certificado tiene un **código** y un **QR**. En el menú **Certificados › Verificar
   autenticidad** puede escribir el código o cargar una foto del QR.
5. No se emiten dos certificados vigentes para la misma persona y evento. Para corregir uno,
   un administrador usa **Reemitir** (indicando el motivo): el anterior queda **anulado**.

## 8. Reportes

En **Reportes** elija el reporte, el evento o el año, revise la **vista previa** y exporte a **PDF** o **Excel**.

## 9. Usuarios y seguridad

En **Configuración › Usuarios** (solo administradores):

| Rol | Puede |
|---|---|
| Administrador | Todo, incluidos usuarios, anulación y reemisión de certificados y restauración de copias. |
| Organizador | Crear y modificar eventos, agenda, inscritos, asistencia y certificados. |
| Solo consulta | Ver la información sin modificarla. |

Los usuarios nuevos deben cambiar su contraseña al primer ingreso. Tras 5 intentos fallidos el
acceso se bloquea un minuto.

## 10. Copias de seguridad

- Se crea una **copia automática diaria** (al ingresar y al cerrar). Se conservan las 15 más recientes.
- **Configuración › Copias de seguridad › Copiar a USB / carpeta** para guardar una copia externa.
  Hágalo al terminar cada evento.
- **Restaurar** (solo administrador) reemplaza los datos actuales; antes se guarda una copia del estado actual.
- Lo eliminado va a la **Papelera**, desde donde se puede restaurar.
