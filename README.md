# PULSO · Tarea 7 (Pista: Futuro del Trabajo)

Copiloto de IA que convierte lo hablado en una reunión en tareas y las reparte según habilidad, carga y energía de cada persona.

🌐 **Web en línea:** https://pulso-tarea7.onrender.com (desplegada en Render; se actualiza sola con cada push a `main`)

## Contenido
- `PULSO_Tarea7.pptx` — presentación de 7 diapositivas (con notas del orador).
- `web/` — prototipo funcional (HTML, CSS y JavaScript, sin instalar nada y sin internet).

## Cómo abrir la web
Doble clic en `web/index.html` (mejor en Chrome o Edge, que también permiten dictar por voz).

Atajos útiles para exponer:
- `index.html#demo` → carga el ejemplo y genera las tareas automáticamente.
- `index.html#tablero` / `#reporte` → abre directamente esa vista.
- Botón **↺ Reiniciar** → vuelve a los datos de ejemplo.

## Funciones
- **Dashboard** con Índice PULSO (0–100), carga y energía por persona y alertas de burnout.
- **Reunión → Tareas**: texto o dictado por voz → tareas detectadas y asignadas con explicación.
- **Rebalancear equipo**: mueve las tareas pendientes de quien está en riesgo.
- **Agregar persona** con habilidades, carga y energía.
- **Tablero** (Pendiente / En progreso / Hecho) con eliminación de tareas.
- **Reporte** con recomendaciones automáticas, descargable en PDF.

## Guion corto de la demo
1. **Dashboard:** María está al 92% de carga y en riesgo de burnout.
2. **Reunión → Tareas:** "Usar ejemplo" → "Generar y asignar tareas".
3. Las 5 tareas se asignan con su explicación; el bug urgente va a Luis, no a María.
4. **Tablero:** mover tareas a "Hecho" reduce la carga de la persona.
