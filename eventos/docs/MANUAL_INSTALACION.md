# Manual de instalación – MEIF Eventos

## Requisitos

- Windows 10 u 11 (64 bits).
- 300 MB libres en disco (más el espacio de las fotos de los eventos).
- No requiere Internet ni permisos de administrador.

## Instalar

1. Ejecute `MEIF-Eventos-Setup-1.0.0.exe`.
2. Si Windows muestra «Windows protegió su PC», pulse **Más información › Ejecutar de todas formas**
   (el instalador no está firmado digitalmente).
3. Elija la carpeta (o deje la sugerida) y termine. Se crean accesos directos en el escritorio y en el menú Inicio.

## Dónde quedan los datos

`C:\Users\<usuario>\AppData\Roaming\MEIF Eventos\`

- `datos\meif-eventos.sqlite`: base de datos.
- `datos\banners\`: fotos inaugurales de los eventos.
- `datos\certificados\`: PDF de los certificados.
- `respaldos\`: copias de seguridad automáticas y manuales.

## Actualizar

Ejecute el instalador de la nueva versión encima de la anterior. Los datos se conservan y la
base de datos se actualiza sola (migraciones versionadas).

## Pasar a otro computador

1. En el equipo actual: **Configuración › Copias de seguridad › Copiar a USB / carpeta**.
2. Instale la aplicación en el equipo nuevo y cree un administrador temporal.
3. **Configuración › Copias de seguridad › Restaurar desde carpeta…** y elija la carpeta copiada.
   Después inicie sesión con los usuarios de la copia.

## Desinstalar

Desde **Configuración de Windows › Aplicaciones**. La carpeta de datos **no** se borra; elimínela
a mano solo si ya no la necesita y tiene copia.

## Generar el instalador (personal técnico)

```bash
cd eventos
npm install
npm run dist:win     # deja release/MEIF-Eventos-Setup-<versión>.exe
```

En Windows funciona directamente. En Linux requiere `wine`. También se puede generar desde
GitHub Actions con el flujo **Instalador MEIF Eventos (Windows)**.
