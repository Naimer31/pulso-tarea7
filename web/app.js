/* PULSO — prototipo funcional (sin dependencias, funciona sin internet).
 * Capas:
 *   1. Dominio: equipo, tareas y motor de asignación (funciones puras).
 *   2. "IA" de extracción: detecta tareas en el texto de la reunión.
 *      En producción se reemplaza por una llamada a un LLM (Claude API) con salida JSON.
 *   3. UI: renderizado de las 3 vistas.
 */

// ---------- 1. DATOS DE EJEMPLO ----------
const COLORS = ["#2ee6a6", "#ff5d73", "#8b7bff", "#ffc857", "#5ad1ff"];

const SEED = () => ({
  team: [
    { id: 1, name: "Luis Ramírez", role: "Desarrollador", skills: ["desarrollo", "pruebas"], load: 45, energy: 4 },
    { id: 2, name: "María Torres", role: "Desarrolladora senior", skills: ["desarrollo"], load: 92, energy: 2 },
    { id: 3, name: "Carla Mendoza", role: "Diseñadora UX/UI", skills: ["diseño", "comunicación"], load: 50, energy: 5 },
    { id: 4, name: "Diego Salas", role: "Analista de datos", skills: ["datos"], load: 70, energy: 3 },
    { id: 5, name: "Sofía Quispe", role: "Coordinadora", skills: ["comunicación", "datos", "general"], load: 35, energy: 4 },
  ],
  tasks: [
    { id: 101, title: "Migrar la base de datos de clientes", skill: "desarrollo", priority: "alta", effort: 25, owner: 2, status: "progreso", why: "Tiene la habilidad de desarrollo." },
    { id: 102, title: "Reporte semanal de métricas", skill: "datos", priority: "media", effort: 15, owner: 4, status: "pendiente", why: "Tiene la habilidad de datos." },
    { id: 103, title: "Actualizar el manual de marca", skill: "diseño", priority: "baja", effort: 10, owner: 3, status: "hecho", why: "Tiene la habilidad de diseño." },
    { id: 104, title: "Revisar el código de la API de pagos", skill: "desarrollo", priority: "media", effort: 15, owner: 2, status: "pendiente", why: "Tiene la habilidad de desarrollo." },
  ],
});

const EXAMPLE =
  "Bueno equipo, hay que arreglar urgente el bug del login en la app. " +
  "También necesitamos diseñar la nueva landing de la campaña, " +
  "preparar el informe de ventas del trimestre para el viernes y " +
  "enviar un correo a los clientes con las novedades. " +
  "Alguien debería probar el nuevo módulo de pagos cuando se pueda.";

let state = load();

function load() {
  try { return JSON.parse(localStorage.getItem("pulso-v2")) || SEED(); }
  catch { return SEED(); }
}
function save() { localStorage.setItem("pulso-v2", JSON.stringify(state)); }

// ---------- 2. DOMINIO ----------
const memberStatus = (m) =>
  m.load >= 90 || m.energy <= 1 ? "danger" : m.load >= 75 || m.energy <= 2 ? "warn" : "ok";

const STATUS_TEXT = { ok: "Equilibrado", warn: "Atención", danger: "Riesgo de burnout" };

/** Motor de asignación: puntaje = habilidad + capacidad libre + energía, con penalización por sobrecarga. */
function bestOwner(task, team) {
  const scored = team.map((m) => {
    const hasSkill = m.skills.includes(task.skill);
    let score = (hasSkill ? 60 : 15) + (100 - m.load) * 0.35 + m.energy * 6;
    const overload = m.load + task.effort > 100;
    if (overload) score *= 0.3;
    if (m.energy <= 2) score *= 0.5;
    return { m, score, hasSkill, overload };
  });
  scored.sort((a, b) => b.score - a.score);
  const win = scored[0];

  const reasons = [];
  if (win.hasSkill) reasons.push(`tiene la habilidad de ${task.skill}`);
  reasons.push(`tiene ${100 - win.m.load}% de capacidad libre`);
  reasons.push(`su energía hoy es ${win.m.energy}/5`);

  // Explica a quién se protegió (alguien con la habilidad pero sobrecargado o con poca energía)
  const protectedOne = scored.find((s) => s.hasSkill && s.m !== win.m && (s.overload || s.m.energy <= 2));
  let why = `Asignada a ${win.m.name.split(" ")[0]} porque ${reasons.join(", ")}.`;
  if (protectedOne) why += ` Se evitó sobrecargar a ${protectedOne.m.name.split(" ")[0]} (carga ${protectedOne.m.load}%, energía ${protectedOne.m.energy}/5).`;
  return { owner: win.m, why };
}

// ---------- 3. "IA" DE EXTRACCIÓN DE TAREAS ----------
const SKILL_RULES = [
  ["desarrollo", /\b(bug|login|api|c[oó]digo|implementar|programar|migrar|backend|servidor|base de datos|app|error|arreglar|integrar)\b/i],
  ["pruebas", /\b(probar|pruebas|testear|test|qa|validar)\b/i],
  ["diseño", /\b(dise[nñ]ar|dise[nñ]o|landing|logo|interfaz|maqueta|banner|prototipo|ui|ux)\b/i],
  ["datos", /\b(informe|reporte|ventas|m[eé]tricas|excel|an[aá]lisis|indicadores|estad[ií]sticas|presupuesto)\b/i],
  ["comunicación", /\b(correo|email|clientes?|presentaci[oó]n|redes|publicar|llamar|enviar|comunicar|invitaci[oó]n)\b/i],
];
const ACTION = /\b(hay que|necesitamos|debemos|tenemos que|deber[ií]a|arreglar|dise[nñ]ar|preparar|enviar|probar|crear|hacer|revisar|actualizar|implementar|organizar|llamar|documentar|publicar|migrar|redactar|corregir|elaborar|integrar|analizar|programar)\b/i;
const FILLER = /^(y\s+|bueno\s+equipo,?\s*|tambi[eé]n\s+|adem[aá]s\s+|entonces\s+|alguien\s+(deber[ií]a|tiene que|puede)\s+|hay que\s+|necesitamos\s+|debemos\s+|tenemos que\s+|que\s+)+/i;

function extractTasks(text) {
  const clauses = text
    .split(/[.;!?\n]+|,\s+(?=(?:y\s+)?(?:hay que|necesitamos|preparar|enviar|dise|arreglar|probar|crear|revisar|actualizar|llamar|publicar|redactar|organizar|hacer)\b)|\s+y\s+(?=(?:preparar|enviar|dise|arreglar|probar|crear|revisar|actualizar|llamar|publicar|redactar|organizar|hacer)\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 6 && ACTION.test(s));

  return clauses.map((c, i) => {
    let title = c.replace(FILLER, "").replace(/\s+/g, " ").trim();
    title = title.charAt(0).toUpperCase() + title.slice(1);
    const skill = (SKILL_RULES.find(([, re]) => re.test(c)) || ["general"])[0];
    const priority = /\b(urgente|hoy|ya|cr[ií]tico|bug|ma[nñ]ana)\b/i.test(c) ? "alta"
      : /\b(cuando se pueda|luego|m[aá]s adelante|sin apuro)\b/i.test(c) ? "baja" : "media";
    const effort = { alta: 20, media: 15, baja: 10 }[priority];
    return { id: Date.now() + i, title, skill, priority, effort, status: "pendiente" };
  });
}

// ---------- 4. UI ----------
const $ = (s) => document.querySelector(s);
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const firstName = (m) => esc(m.name.split(" ")[0]);

/** Índice PULSO (0–100): mezcla capacidad libre y energía, penaliza personas en riesgo. */
function pulseIndex(team) {
  const avgLoad = team.reduce((a, m) => a + m.load, 0) / team.length;
  const avgEnergy = team.reduce((a, m) => a + m.energy, 0) / team.length;
  const risk = team.filter((m) => memberStatus(m) === "danger").length;
  return Math.max(0, Math.min(100, Math.round(0.5 * (100 - avgLoad) + 0.5 * (avgEnergy / 5) * 100 - risk * 8)));
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 4200);
}
const initials = (n) => n.split(" ").map((p) => p[0]).slice(0, 2).join("");
const colorOf = (id) => COLORS[(id - 1) % COLORS.length];
const avatar = (m) => `<div class="avatar" style="background:${colorOf(m.id)}">${esc(initials(m.name))}</div>`;
const barColor = (v) => (v >= 90 ? "var(--accent)" : v >= 75 ? "var(--amber)" : "var(--mint)");

function renderDashboard() {
  const t = state.team;
  const avgLoad = Math.round(t.reduce((a, m) => a + m.load, 0) / t.length);
  const avgEnergy = (t.reduce((a, m) => a + m.energy, 0) / t.length).toFixed(1);
  const risk = t.filter((m) => memberStatus(m) === "danger");
  $("#st-carga").textContent = avgLoad + "%";
  $("#st-energia").textContent = avgEnergy;
  $("#st-tareas").textContent = state.tasks.filter((x) => x.status !== "hecho").length;
  $("#st-riesgo").textContent = risk.length;
  const idx = pulseIndex(t);
  $("#st-index").textContent = idx;
  const ring = $("#ring-fg");
  ring.style.strokeDashoffset = 314 - (314 * idx) / 100;
  ring.style.stroke = idx >= 60 ? "var(--mint)" : idx >= 40 ? "var(--amber)" : "var(--accent)";

  $("#alerts").innerHTML = risk
    .map((m) => `<div class="alert-box">⚠️ <b>${esc(m.name)}</b> está al ${m.load}% de carga con energía ${m.energy}/5: riesgo alto de burnout. PULSO no le asignará tareas nuevas.</div>`)
    .join("");

  $("#team").innerHTML = t.map((m) => {
    const st = memberStatus(m);
    return `
      <div class="member ${st === "danger" ? "risk" : ""}" data-id="${m.id}">
        <div class="member-head">${avatar(m)}<div><b>${esc(m.name)}</b><small>${esc(m.role)}</small></div>
          <span class="badge ${st}">${STATUS_TEXT[st]}</span></div>
        <div class="meter-label"><span>Carga de trabajo</span><span>${m.load}%</span></div>
        <div class="bar"><i style="width:${Math.min(m.load, 100)}%;background:${barColor(m.load)}"></i></div>
        <div class="meter-label"><span>Energía hoy</span><span>${"🔋".repeat(m.energy)}${"▫️".repeat(5 - m.energy)}</span></div>
        <input type="range" min="1" max="5" value="${m.energy}" data-energy="${m.id}" aria-label="Energía de ${esc(m.name)}" />
        <div class="skills">${m.skills.map((s) => `<span>${s}</span>`).join("")}</div>
      </div>`;
  }).join("");
}

function renderBoard() {
  document.querySelectorAll(".col").forEach((col) => {
    const st = col.dataset.status;
    const list = state.tasks.filter((x) => x.status === st);
    col.querySelector("em").textContent = `(${list.length})`;
    col.querySelector(".list").innerHTML = list.length
      ? list.map((x) => {
          const m = state.team.find((p) => p.id === x.owner);
          return `<div class="mini" title="${esc(x.why)}">
            <b>${esc(x.title)}</b>
            <div class="tags"><span class="tag ${x.priority}">${x.priority}</span><span class="tag">${x.skill}</span></div>
            <div class="row">${avatar(m)}${firstName(m)}
              <div class="move">
                ${st !== "pendiente" ? `<button data-move="${x.id}" data-dir="-1" aria-label="Mover atrás">←</button>` : ""}
                ${st !== "hecho" ? `<button data-move="${x.id}" data-dir="1" aria-label="Mover adelante">→</button>` : ""}
                <button class="del" data-del="${x.id}" aria-label="Eliminar tarea" title="Eliminar">×</button>
              </div></div></div>`;
        }).join("")
      : `<div class="empty">Sin tareas</div>`;
  });
}

function renderReport() {
  const t = state.team;
  const active = state.tasks.filter((x) => x.status !== "hecho");
  const done = state.tasks.filter((x) => x.status === "hecho").length;
  const date = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const recs = [];
  t.forEach((m) => {
    const st = memberStatus(m);
    const pend = active.filter((x) => x.owner === m.id && x.status === "pendiente").length;
    if (st === "danger") recs.push(`🔴 <b>${esc(m.name)}</b> está en riesgo (carga ${m.load}%, energía ${m.energy}/5). ${pend ? `Reasignar sus ${pend} tarea(s) pendiente(s) con “Rebalancear equipo”.` : "No asignarle tareas nuevas esta semana."}`);
    else if (st === "warn") recs.push(`🟡 <b>${esc(m.name)}</b> necesita atención (carga ${m.load}%, energía ${m.energy}/5). Conversar en el próximo 1 a 1.`);
    else if (m.load <= 50 && m.energy >= 4) recs.push(`🟢 <b>${esc(m.name)}</b> tiene capacidad (${100 - m.load}% libre) para asumir más responsabilidades.`);
  });
  if (!recs.length) recs.push("✅ El equipo está equilibrado. ¡Buen trabajo!");

  const skills = {};
  active.forEach((x) => (skills[x.skill] = (skills[x.skill] || 0) + 1));
  const maxSkill = Math.max(1, ...Object.values(skills));

  $("#report").innerHTML = `
    <div class="card"><h3>Resumen</h3>
      <p class="meta">Generado el ${date}</p>
      <div class="stats" style="margin:12px 0 0">
        <div class="stat"><span>${pulseIndex(t)}</span><small>Índice PULSO</small></div>
        <div class="stat"><span>${t.length}</span><small>Personas</small></div>
        <div class="stat"><span>${active.length}</span><small>Tareas activas</small></div>
        <div class="stat"><span>${done}</span><small>Tareas completadas</small></div>
      </div></div>
    <div class="card"><h3>Estado por persona</h3>
      <table><thead><tr><th>Persona</th><th>Rol</th><th>Tareas activas</th><th>Carga</th><th>Energía</th><th>Estado</th></tr></thead><tbody>
      ${t.map((m) => {
        const st = memberStatus(m);
        return `<tr><td>${esc(m.name)}</td><td>${esc(m.role)}</td><td>${active.filter((x) => x.owner === m.id).length}</td>
          <td>${m.load}%</td><td>${m.energy}/5</td><td><span class="badge ${st}">${STATUS_TEXT[st]}</span></td></tr>`;
      }).join("")}
      </tbody></table></div>
    <div class="report-grid">
      <div class="card"><h3>Recomendaciones de PULSO</h3><ul>${recs.map((r) => `<li>${r}</li>`).join("")}</ul></div>
      <div class="card"><h3>Tareas activas por tipo</h3>
        ${Object.keys(skills).length ? Object.entries(skills).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
          <div class="skill-row"><span>${esc(k)}</span><div class="bar"><i style="width:${(v / maxSkill) * 100}%;background:var(--violet)"></i></div><b>${v}</b></div>`).join("")
          : `<p class="meta">No hay tareas activas.</p>`}
      </div>
    </div>`;
}

function renderAll() { renderDashboard(); renderBoard(); renderReport(); save(); }

// ---------- 5. EVENTOS ----------
function showView(name) {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

$("#team").addEventListener("input", (e) => {
  const id = +e.target.dataset.energy;
  if (!id) return;
  state.team.find((m) => m.id === id).energy = +e.target.value;
  renderAll();
});

const FLOW = ["pendiente", "progreso", "hecho"];
$(".board").addEventListener("click", (e) => {
  const delId = +e.target.dataset.del;
  if (delId) {
    const task = state.tasks.find((x) => x.id === delId);
    const owner = state.team.find((m) => m.id === task.owner);
    if (task.status !== "hecho") owner.load = Math.max(0, owner.load - task.effort);
    state.tasks = state.tasks.filter((x) => x.id !== delId);
    toast(`🗑️ Tarea eliminada: “${esc(task.title)}”`);
    renderAll();
    return;
  }
  const id = +e.target.dataset.move;
  if (!id) return;
  const task = state.tasks.find((x) => x.id === id);
  const prev = task.status;
  task.status = FLOW[FLOW.indexOf(prev) + +e.target.dataset.dir];
  const owner = state.team.find((m) => m.id === task.owner);
  if (task.status === "hecho") { owner.load = Math.max(0, owner.load - task.effort); toast(`✅ ${firstName(owner)} completó “${esc(task.title)}” (−${task.effort}% de carga)`); }
  if (prev === "hecho") owner.load = Math.min(100, owner.load + task.effort);
  renderAll();
});

$("#btn-ejemplo").addEventListener("click", () => { $("#meeting-text").value = EXAMPLE; });

$("#btn-generar").addEventListener("click", () => {
  const text = $("#meeting-text").value.trim();
  if (!text) { $("#meeting-text").focus(); return; }
  $("#results").innerHTML = "";
  $("#processing").classList.remove("hidden");

  setTimeout(() => {
    $("#processing").classList.add("hidden");
    const found = extractTasks(text);
    if (!found.length) {
      $("#results").innerHTML = `<p class="muted">No se detectaron tareas. Prueba con frases como "hay que preparar el informe".</p>`;
      return;
    }
    found.forEach((task, i) => {
      const { owner, why } = bestOwner(task, state.team);
      task.owner = owner.id;
      task.why = why;
      owner.load = Math.min(100, owner.load + task.effort);
      state.tasks.push(task);
      setTimeout(() => {
        $("#results").insertAdjacentHTML("beforeend", `
          <div class="task-card">
            <h4>${esc(task.title)}</h4>
            <div class="tags"><span class="tag ${task.priority}">Prioridad ${task.priority}</span><span class="tag">${task.skill}</span><span class="tag">+${task.effort}% carga</span></div>
            <div class="assignee">${avatar(owner)}<div><b>${esc(owner.name)}</b><br><small class="muted">${esc(owner.role)}</small></div></div>
            <p class="why">💡 ${esc(why)}</p>
          </div>`);
      }, i * 350);
    });
    renderAll();
    toast(`⚡ ${found.length} tarea(s) creadas y asignadas. Revísalas en el Tablero.`);
  }, 1200);
});

// Dictado por voz (Web Speech API, Chrome/Edge)
$("#btn-mic").addEventListener("click", () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $("#mic-status").textContent = "Tu navegador no soporta dictado. Usa Chrome o Edge, o escribe el texto."; return; }
  const rec = new SR();
  rec.lang = "es-PE";
  rec.interimResults = true;
  const base = $("#meeting-text").value;
  rec.onstart = () => ($("#mic-status").textContent = "🔴 Escuchando… habla ahora.");
  rec.onresult = (e) => {
    const said = Array.from(e.results).map((r) => r[0].transcript).join(" ");
    $("#meeting-text").value = (base + " " + said).trim();
  };
  rec.onerror = () => ($("#mic-status").textContent = "No se pudo usar el micrófono.");
  rec.onend = () => ($("#mic-status").textContent = "Dictado terminado.");
  rec.start();
});

// Rebalancear: reasigna las tareas pendientes de quien está en riesgo
$("#btn-rebalance").addEventListener("click", () => {
  const atRisk = state.team.filter((m) => memberStatus(m) === "danger");
  let moved = 0;
  atRisk.forEach((m) => {
    state.tasks
      .filter((x) => x.owner === m.id && x.status === "pendiente")
      .forEach((task) => {
        const others = state.team.filter((p) => p.id !== m.id && memberStatus(p) !== "danger");
        if (!others.length) return;
        const { owner, why } = bestOwner(task, others);
        m.load = Math.max(0, m.load - task.effort);
        owner.load = Math.min(100, owner.load + task.effort);
        task.owner = owner.id;
        task.why = `Reasignada desde ${m.name.split(" ")[0]} (en riesgo). ` + why;
        moved++;
        toast(`⚖️ “${esc(task.title)}” pasó de ${firstName(m)} a ${firstName(owner)}`);
      });
  });
  if (!moved) toast(atRisk.length ? "Las personas en riesgo no tienen tareas pendientes para mover." : "✅ El equipo ya está equilibrado.");
  renderAll();
  document.querySelectorAll(".member").forEach((el) => el.classList.add("flash"));
  setTimeout(() => document.querySelectorAll(".member").forEach((el) => el.classList.remove("flash")), 1000);
});

// Agregar persona
const modal = $("#modal-add");
const form = $("#form-add");
function syncAddLabels() {
  $("#add-load-val").textContent = form.load.value + "%";
  $("#add-energy-val").textContent = form.energy.value + "/5";
}
$("#btn-add").addEventListener("click", () => { form.reset(); syncAddLabels(); modal.showModal(); });
$("#add-cancel").addEventListener("click", () => modal.close());
form.addEventListener("input", syncAddLabels);
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const skills = [...form.querySelectorAll("input[name=skills]:checked")].map((c) => c.value);
  const m = {
    id: Math.max(0, ...state.team.map((p) => p.id)) + 1,
    name: form.elements.name.value.trim(),
    role: form.elements.role.value.trim(),
    skills: skills.length ? skills : ["general"],
    load: +form.load.value,
    energy: +form.energy.value,
  };
  state.team.push(m);
  modal.close();
  renderAll();
  toast(`👋 ${esc(m.name)} se unió al equipo`);
});

$("#btn-pdf").addEventListener("click", () => window.print());

$("#reset").addEventListener("click", () => {
  state = SEED();
  $("#results").innerHTML = "";
  $("#meeting-text").value = "";
  renderAll();
  toast("↺ Datos de ejemplo restaurados");
});

renderAll();

// Enlaces directos: #reunion, #tablero, #demo (carga el ejemplo y lo ejecuta)
const hash = location.hash.slice(1);
if (hash === "demo") {
  state = SEED();
  renderAll();
  showView("reunion");
  $("#meeting-text").value = EXAMPLE;
  $("#btn-generar").click();
} else if (["dashboard", "reunion", "tablero", "reporte"].includes(hash)) {
  showView(hash);
}
