/* ═══════════════════════════════════════════════════════════════
   Antigravity Presupuestos — Legacy JS (monolito)
   Etapa 1: extraído sin modificaciones
   ESTADO: pendiente de refactor en Etapas 2-5
   NO importar directamente — usar app.js como punto de entrada
═══════════════════════════════════════════════════════════════ */


// ── STATE ──
const S = {
  tipoObra: null, conMateriales: true,
  conIva: false, cobertura: 0, margen: 0.30, riesgo: 0,
  combVehCant: 0, combDias: 0, combKmDia: 0
};

// ── PROYECTO MULTI-TIPO ──
let tiposUnidad = [];
let _tipoEditando = null;
const ALTURA_FACTORES = { baja: 1.00, media: 0.80, alta: 0.65 };
const ALTURA_LABELS   = { baja: 'Baja  < 3 m', media: 'Media  3–6 m', alta: 'Alta  > 6 m' };

const ROLES = [
  { id:'es', label:'Oficial Especializado', badge:'rb-es', qty:0, hora:0 },
  { id:'of', label:'Oficial',               badge:'rb-of', qty:0, hora:0 },
  { id:'mo', label:'Medio Oficial',         badge:'rb-mo', qty:0, hora:0 },
  { id:'ay', label:'Ayudante',              badge:'rb-ay', qty:0, hora:0 },
  { id:'ot', label:'Otros',                 badge:'rb-ot', qty:0, hora:0 },
];

let ambientes=[], sectores=[], materiales=[], costosDir=[], costosInd=[], carpItems=[];
const AMBIENTE_TIPOS = ['Fachadas / muros exteriores','Living-comedor','Dormitorio','Comedor','Cocina','Baño','Pasillos / circulación','Quincho','Lavadero','Dormitorio de niños'];
let uid=0;
const nid=()=>++uid;

const VANO_PRESETS = {
  puerta:       { label:'Puerta',      ancho:0.85, alto:2.05 },
  ventana:      { label:'Ventana',     ancho:1.20, alto:1.00 },
  porton:       { label:'Portón',      ancho:2.50, alto:2.30 },
  personalizado:{ label:'Personalizado',ancho:0,   alto:0    },
};

function createVano(tipo='puerta'){
  // Inicia ancho y alto en 0 - el usuario los ingresa manualmente
  return { id:nid(), tipo, ancho:0, alto:0, cantidad:1 };
}
function normalizeVanos(vanos){
  return Array.isArray(vanos) ? vanos.map(v => ({
    id: v.id||nid(), tipo: v.tipo||'puerta',
    ancho: parseFloat(v.ancho)||0, alto: parseFloat(v.alto)||0, cantidad: parseFloat(v.cantidad)||0
  })) : [];
}
function getVanosTotal(vanos){
  return normalizeVanos(vanos).reduce((acc,v)=>acc+((parseFloat(v.ancho)||0)*(parseFloat(v.alto)||0)*(parseFloat(v.cantidad)||0)),0);
}
// Fachada con "frente y contrafrente iguales": se carga solo el frente
// y se multiplica ×2. Para cualquier otro ambiente el factor es 1.
function fachadaFactor(a){
  return (a.tipo === 'Fachadas / muros exteriores' && a.frenteIgual) ? 2 : 1;
}
// Título de cada paño de fachada.
// Sí (lados iguales): se ingresa un frente y un lateral, cada uno cuenta ×2
//   (frente=contrafrente, lateral=lateral opuesto).
// No: se nombran todas las caras y se cargan manualmente.
function panoLabel(a, i, total){
  if(a.frenteIgual){
    if(i === 0) return 'Frente';
    return total > 2 ? `Lateral ${i}` : 'Lateral';
  }
  if(i === 0) return 'Frente';
  if(i === 1) return 'Contrafrente';
  return `Lateral ${i-1}`;
}
function calcAmbMuroBruto(a){
  const isFachada = a.tipo === 'Fachadas / muros exteriores';
  if(isFachada){
    const factor = fachadaFactor(a);
    if(a.panos && a.panos.length > 0)
      return a.panos.reduce((s,p)=>s+(p.ancho||0)*(p.alto||0),0)*factor;
    return (a.ml||0)*(a.alt||0)*factor; // compat historial sin panos
  }
  return a.ml*a.alt*a.paredes;
}
function calcAmbCielo(a){
  const isFachada = a.tipo === 'Fachadas / muros exteriores';
  const lc = a.largoCielo !== undefined ? a.largoCielo : a.ml;
  return isFachada ? 0 : lc*a.anchoCielo;
}
function calcAmbVanos(a){ return getVanosTotal(a.vanos) * fachadaFactor(a); }
function calcAmbMuroNeto(a){ return Math.max(0, calcAmbMuroBruto(a)-calcAmbVanos(a)); }
function calcAmbZocalo(a){ return (a.conZocalo&&a.zocLargo&&a.zocAlto) ? (a.zocLargo*a.zocAlto) : 0; }
function calcAmbBaranda(a){ return (a.conBaranda&&a.barLargo&&a.barAlto) ? (a.barLargo*a.barAlto) : 0; }
function calcAmbTotal(a){ return calcAmbMuroNeto(a)+calcAmbCielo(a)+calcAmbZocalo(a)+calcAmbBaranda(a); }
function calcSectorVanos(s){ return getVanosTotal(s.vanos); }
function calcSectorBruto(s){ return(s.tipo==='muro2'?s.d1*s.d2*2*s.manos:s.d1*s.d2*(s.paredes||1)*s.manos)*(s.niveles||1); }
function calcSectorNeto(s){ return Math.max(0, calcSectorBruto(s)-((s.tipo==='muro'||s.tipo==='muro2')?calcSectorVanos(s):0)); }

// ══════════════════════════════════════════════════════════════
// ═══════════   PROYECTO — MÚLTIPLES TIPOS DE UNIDAD   ════════
// ══════════════════════════════════════════════════════════════

// Factor según altura real en metros
function calcFactorAltura(metros) {
  const m = parseFloat(metros) || 2.70;
  if (m <= 3.00) return 1.00;
  if (m <= 6.00) return 0.80;
  return 0.65;
}
function etiquetaAltura(metros) {
  const m = parseFloat(metros) || 2.70;
  if (m <= 3.00) return 'Baja';
  if (m <= 6.00) return 'Media';
  return 'Alta';
}

function addTipoUnidad() {
  tiposUnidad.push({
    id: nid(), label: 'Modelo A', tipoBase: 'casa',
    cantidad: 1, alturaMetros: 2.70,
    ambientes: [], ambientesEdf: [],
    m2Calculado: 0,
  });
  renderTiposUnidad();
}

function removeTipoUnidad(id) {
  if (!confirm('¿Eliminar este tipo de unidad y sus ambientes?')) return;
  tiposUnidad = tiposUnidad.filter(t => t.id !== id);
  if (_tipoEditando && _tipoEditando.id === id) _tipoEditando = null;
  renderTiposUnidad(); calc();
}

// Actualiza data sin re-renderizar — para usar en oninput de texto/número
function tipoDataUpdate(id, key, val) {
  const tipo = tiposUnidad.find(t => t.id === id); if (!tipo) return;
  tipo[key] = val;
}

// Actualiza data, re-renderiza y recalcula — para usar en onblur/onchange o botones
function tipoChange(id, key, val) {
  const tipo = tiposUnidad.find(t => t.id === id); if (!tipo) return;
  if (key === 'cantidad')     tipo.cantidad     = Math.max(1, parseInt(val) || 1);
  else if (key === 'alturaMetros') tipo.alturaMetros = Math.max(0.5, parseFloat(val) || 2.70);
  else                        tipo[key]         = val;
  renderTiposUnidad(); calc();
}

function editarAmbientesTipo(id) {
  // Sincronizar el tipo que estaba en edición antes de cambiar
  if (_tipoEditando) _guardarAmbientesEnTipo();

  const tipo = tiposUnidad.find(t => t.id === id); if (!tipo) return;
  _tipoEditando = tipo;
  S.tipoObra = tipo.tipoBase;

  // Cargar los ambientes de este tipo en los globales
  ambientes    = JSON.parse(JSON.stringify(tipo.ambientes    || []));
  ambientesEdf = JSON.parse(JSON.stringify(tipo.ambientesEdf || []));

  // Preparar la pantalla de medición según el tipoBase
  document.getElementById('bloque-casa').style.display     = tipo.tipoBase === 'casa'     ? '' : 'none';
  document.getElementById('bloque-edificio').style.display = tipo.tipoBase === 'edificio' ? '' : 'none';
  document.getElementById('btn-casa')?.classList.toggle('sel', tipo.tipoBase === 'casa');
  document.getElementById('btn-edificio')?.classList.toggle('sel', tipo.tipoBase === 'edificio');

  if (tipo.tipoBase === 'edificio') { renderAmbientesEdfSelector(); renderAmbientesEdf(); }
  else { renderAmbientesSelector(); renderAmbientes(); }

  // Mostrar breadcrumb en s-medicion
  _actualizarBreadcrumb();
  goScreen('s-medicion'); calc();
}

function volverATipos() {
  _guardarAmbientesEnTipo();
  _tipoEditando = null;
  _ocultarBreadcrumb();
  goScreen('s-tipos-unidad');
  renderTiposUnidad(); calc();
}

function _guardarAmbientesEnTipo() {
  if (!_tipoEditando) return;
  _tipoEditando.ambientes    = JSON.parse(JSON.stringify(ambientes));
  _tipoEditando.ambientesEdf = JSON.parse(JSON.stringify(ambientesEdf));
}

function _actualizarBreadcrumb() {
  const hdr = document.getElementById('medicion-tipo-header'); if (!hdr) return;
  const tipo = _tipoEditando;
  hdr.style.display = '';
  hdr.innerHTML = `
    <div style="background:var(--bg-elevated);border-bottom:1px solid var(--border-2);padding:10px 16px;display:flex;align-items:center;gap:10px">
      <button onclick="volverATipos()"
        style="background:var(--accent);border:none;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:700;cursor:pointer;color:#000;font-family:inherit;white-space:nowrap">
        ← Guardar y volver
      </button>
      <span style="font-size:11px;color:var(--text-tertiary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        <strong style="color:var(--accent)">${tipo.label}</strong>
        <span style="margin:0 4px">·</span>×&nbsp;${tipo.cantidad}
      </span>
    </div>`;
}

function _ocultarBreadcrumb() {
  const hdr = document.getElementById('medicion-tipo-header');
  if (hdr) hdr.style.display = 'none';
}

function renderTiposUnidad() {
  const c = document.getElementById('tipos-unidad-container'); if (!c) return;

  if (tiposUnidad.length === 0) {
    c.innerHTML = `<div style="text-align:center;padding:28px 16px;color:var(--text-tertiary);font-size:13px;line-height:1.6">
      Sin tipos definidos.<br>Presioná <strong style="color:var(--accent)">+ Agregar tipo</strong> para empezar.
    </div>`;
    return;
  }

  let html = '';
  let totalProyecto = 0;

  tiposUnidad.forEach(tipo => {
    const m2Unit  = tipo.m2Calculado || 0;
    const m2Total = m2Unit * tipo.cantidad;
    totalProyecto += m2Total;
    const editando = _tipoEditando && _tipoEditando.id === tipo.id;
    const labelEsc = (tipo.label || '').replace(/"/g, '&quot;');

    html += `
    <div class="amb-block" style="margin-bottom:12px${editando ? ';border-color:var(--accent)' : ''}">

      <!-- Nombre del modelo -->
      <div class="amb-head" style="margin-bottom:12px">
        <input type="text" value="${labelEsc}"
          placeholder="Nombre del modelo…"
          style="background:transparent;border:none;color:var(--accent);font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;flex:1;min-width:0;outline:none;font-family:'Manrope',sans-serif;padding:0"
          oninput="tipoDataUpdate(${tipo.id},'label',this.value)"
          onblur="tipoChange(${tipo.id},'label',this.value)">
        <button class="btn-rm" onclick="removeTipoUnidad(${tipo.id})" title="Eliminar">×</button>
      </div>

      <!-- Tipo / Cantidad -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div class="fg" style="margin-bottom:0">
          <label>Tipo</label>
          <div class="tg-group">
            <button class="tg-btn ${tipo.tipoBase === 'casa' ? 'on' : ''}"
              onclick="tipoChange(${tipo.id},'tipoBase','casa')">Casa</button>
            <button class="tg-btn ${tipo.tipoBase === 'edificio' ? 'on' : ''}"
              onclick="tipoChange(${tipo.id},'tipoBase','edificio')">Edif.</button>
          </div>
        </div>
        <div class="fg" style="margin-bottom:0">
          <label>Cantidad</label>
          <div class="input-wrap">
            <input type="number" value="${tipo.cantidad}" min="1" step="1" inputmode="numeric"
              style="text-align:right"
              onchange="tipoChange(${tipo.id},'cantidad',this.value)">
            <span class="input-unit">u</span>
          </div>
        </div>
      </div>

      <!-- m² resumen -->
      <div class="sup-row" style="margin-bottom:10px">
        <div class="sup-chip">
          <span class="sl">m² por unidad</span>
          <span class="sv">${m2Unit > 0 ? fm2(m2Unit) : '—'}</span>
        </div>
        <div class="sup-chip">
          <span class="sl">× ${tipo.cantidad}</span>
          <span class="sv">${m2Total > 0 ? fm2(m2Total) : '—'}</span>
        </div>
      </div>

      <!-- Botón editar ambientes -->
      <button onclick="editarAmbientesTipo(${tipo.id})"
        style="width:100%;background:${editando ? 'var(--accent)' : 'var(--bg-elevated)'};border:1px solid var(--accent);border-radius:6px;padding:10px;font-size:12px;font-weight:700;color:${editando ? '#000' : 'var(--accent)'};cursor:pointer;font-family:inherit;letter-spacing:.3px">
        ${editando ? '✏ Editando ambientes…' : 'Cargar ambientes →'}
      </button>
    </div>`;
  });

  // Totales por tipología + total general
  html += `<div style="margin-top:4px">`;
  tiposUnidad.forEach(tipo => {
    const m2u    = tipo.m2Calculado || 0;
    const m2t    = m2u * tipo.cantidad;
    if (m2t > 0) {
      html += `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);padding:3px 0">
        <span>${tipo.label} × ${tipo.cantidad}</span>
        <span>${fm2(m2t)}</span>
      </div>`;
    }
  });
  html += `</div>
  <div class="sup-total-chip" style="margin-top:6px">
    <span class="sl">Total general del proyecto</span>
    <span class="sv">${fm2(totalProyecto)}</span>
  </div>`;

  c.innerHTML = html;
}

function entrarModoProyecto() {
  const hb = document.getElementById('nav-hist-btn'); if (hb) hb.style.display = '';
  const fab = document.getElementById('fab-btn');
  if (fab) { fab.style.display = ''; fab.onclick = () => openModal(); fab.innerHTML = 'Cotización <span class="fab-price" id="fab-price">Calcular</span>'; }
  setActiveModule('pintura');
  showSectionNav(true);
  ['tab-s-tipos-unidad','tab-s-cuadrilla','tab-s-costos','tab-s-precio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = '';
  });
  ['tab-s-medicion','tab-s-obra','tab-s-jornales','tab-s-pjornales','tab-s-pj-cuadrilla','tab-s-pj-costos','tab-s-pj-precio'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  // Sincronizar nombre del proyecto con el input estático del HTML
  const pni = document.getElementById('proyecto-nombre-input');
  if (pni) pni.value = CLI.nombre || '';

  renderTiposUnidad();
  goScreen('s-tipos-unidad');
}

// ── COLAPSABLE ──
function toggleCard(head) {
  const body = head.nextElementSibling;
  const chev = head.querySelector('.card-chevron');
  const collapsed = body.classList.toggle('collapsed');
  if(chev) chev.classList.toggle('open', !collapsed);
  head.classList.toggle('open', !collapsed);
}

// ── THEME TOGGLE ──
function toggleTheme(){
  const isLight=document.body.classList.toggle('light-mode');
  const btn=document.getElementById('theme-toggle-btn');
  if(btn)btn.textContent=isLight?'☾':'☀';
}

// ── NAV ──
// Resalta el módulo activo en la barra inferior primaria
function setActiveModule(mod){
  document.querySelectorAll('.module-tab').forEach(b=>b.classList.toggle('active', b.dataset.mod===mod));
}
// Muestra/oculta la barra inferior de secciones internas
function showSectionNav(show){
  const n=document.getElementById('section-nav');if(n)n.style.display=show?'':'none';
}
// Acceso al módulo Configuración desde la barra inferior
function goConfig(){
  setActiveModule('config');
  showSectionNav(false);
  goScreen('s-config');
}
function moduloProximamente(){
  alert('Desmalezado — próximamente disponible.');
}

// Tabs de la pantalla Costos: Variables / Fijos
function setCostosTab(tab){
  const grupos={var:'costos-grupo-var',fij:'costos-grupo-fij'};
  const botones={var:'costos-tab-var',fij:'costos-tab-fij'};
  Object.entries(grupos).forEach(([k,id])=>{
    const el=document.getElementById(id); if(el) el.style.display=(k===tab?'':'none');
  });
  Object.entries(botones).forEach(([k,id])=>{
    const el=document.getElementById(id); if(el) el.classList.toggle('on', k===tab);
  });
}

function goHome(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('s-home').classList.add('active');
  document.querySelectorAll('.nav-tab,.nav-cfg').forEach(t=>t.classList.remove('active'));
  // Ocultar las secciones internas en home
  ['tab-s-obra','tab-s-medicion','tab-s-cuadrilla','tab-s-costos','tab-s-precio',
   'tab-s-jornales','tab-s-pjornales','tab-s-pj-cuadrilla','tab-s-pj-costos','tab-s-pj-precio'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  setActiveModule('');
  showSectionNav(false);
  const hb=document.getElementById('nav-hist-btn');if(hb)hb.style.display='none';
  const fab=document.getElementById('fab-btn');if(fab)fab.style.display='none';
  if(typeof renderHome==='function') renderHome();
}

function entrarModulo(modulo){
  const hb=document.getElementById('nav-hist-btn');if(hb)hb.style.display='';
  const fab=document.getElementById('fab-btn');if(fab)fab.style.display='';
  setActiveModule(modulo);
  showSectionNav(true);

  if(modulo==='pintura'){
    // Barra inferior: solo Cuadrilla · Costos · Precio (Medición y Tipos son parte del flujo de entrada)
    ['tab-s-cuadrilla','tab-s-costos','tab-s-precio'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.style.display='';
    });
    // Ocultar tabs que no corresponden al modo pintura normal
    ['tab-s-medicion','tab-s-obra','tab-s-jornales','tab-s-pjornales','tab-s-pj-cuadrilla','tab-s-pj-costos','tab-s-pj-precio','tab-s-tipos-unidad'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.style.display='none';
    });
    // FAB modo cotización
    const fab=document.getElementById('fab-btn');
    if(fab){fab.onclick=()=>openModal();fab.innerHTML='Cotización <span class="fab-price" id="fab-price">Calcular</span>';}
    // Limpiar estado de proyecto si se vuelve al flujo simple
    if (S.tipoObra === 'proyecto') { S.tipoObra = null; _tipoEditando = null; _ocultarBreadcrumb(); }
    goScreen('s-obra');
  } else if(modulo==='obra'){
    entrarSubmodulo('jornales-ppto');
  }
}

function entrarSubmodulo(sub){
  const hb=document.getElementById('nav-hist-btn');if(hb)hb.style.display='';
  const fab=document.getElementById('fab-btn');if(fab)fab.style.display='';
  setActiveModule('obra');
  showSectionNav(true);

  if(sub==='jornales-ppto'){
    ['tab-s-obra','tab-s-medicion','tab-s-cuadrilla','tab-s-costos','tab-s-precio',
     'tab-s-jornales','tab-s-pjornales'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.style.display='none';
    });
    ['tab-s-pj-cuadrilla','tab-s-pj-costos','tab-s-pj-precio'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.style.display='';
    });
    const f=document.getElementById('fab-btn');
    if(f){f.onclick=()=>goScreen('s-pj-precio');f.innerHTML='Total <span class="fab-price" id="fab-price">$0</span>';}
    pjInit();
    goScreen('s-pj-cuadrilla');
    pjCalc();
  }
}

function goScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-tab,.nav-cfg').forEach(t=>t.classList.remove('active'));
  const tabId = id==='s-config' ? 'tab-cfg' : 'tab-'+id;
  const tab = document.getElementById(tabId);
  if(tab) tab.classList.add('active');
  if(['s-pjornales','s-pj-cuadrilla','s-pj-costos','s-pj-precio'].includes(id) && typeof pjCalc==='function'){ pjCalc(); }
  else if(id!=='s-obra-menu'){ calc(); }
}

// ── TIPO OBRA ──
function selectObra(tipo, advance=true) {
  if (tipo === 'proyecto') {
    S.tipoObra = 'proyecto';
    tiposUnidad = tiposUnidad.length > 0 ? tiposUnidad : [];
    entrarModoProyecto();
    return;
  }
  S.tipoObra=tipo;
  document.getElementById('btn-casa').classList.toggle('sel',tipo==='casa');
  document.getElementById('btn-edificio').classList.toggle('sel',tipo==='edificio');
  document.getElementById('bloque-casa').style.display=tipo==='casa'?'':'none';
  document.getElementById('bloque-edificio').style.display=tipo==='edificio'?'':'none';
  if(tipo==='edificio'){
    renderAmbientesEdfSelector();
    renderAmbientesEdf();
  }
  calc();
  // Tras elegir el tipo de obra, avanzar al flujo de Medición con transición fluida
  if(advance) setTimeout(()=>goScreen('s-medicion'), 220);
}

// Mostrar / ocultar tabs según el modo
function setTabsByMode(mode){
  const showJ = mode==='jornales';
  const tabsPintura = ['tab-s-medicion','tab-s-cuadrilla','tab-s-costos','tab-s-precio'];
  tabsPintura.forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=showJ?'none':'';});
  const tabJ=document.getElementById('tab-s-jornales');
  if(tabJ) tabJ.style.display=showJ?'':'none';
  // El FAB cambia según modo
  const fab=document.getElementById('fab-btn');
  if(fab){
    if(showJ){
      fab.onclick = ()=>goScreen('s-jornales');
      fab.innerHTML = 'Total <span class="fab-price" id="fab-price">$0</span>';
    } else {
      fab.onclick = ()=>openModal();
      fab.innerHTML = 'Cotización <span class="fab-price" id="fab-price">Calcular</span>';
    }
  }
}

// ── AMBIENTES ──
function renderAmbientesSelector(){
  const c=document.getElementById('ambientes-selector'); if(!c)return; c.innerHTML='';
  AMBIENTE_TIPOS.forEach(t=>{
    const btn=document.createElement('button');
    btn.style.cssText='background:var(--bg-elevated);border:1px solid var(--border-2);border-radius:6px;padding:6px 12px;font-size:11px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:all .15s;font-family:DM Sans,sans-serif;letter-spacing:.3px';
    btn.onmouseover=()=>{btn.style.borderColor='var(--accent)';btn.style.color='var(--accent)'};
    btn.onmouseout=()=>{btn.style.borderColor='var(--border-2)';btn.style.color='var(--text-secondary)'};
    btn.textContent='+ '+t;
    btn.onclick=()=>addAmbiente(t);
    c.appendChild(btn);
  });
}
function addAmbiente(tipo) {
  const isFachada = tipo === 'Fachadas / muros exteriores';
  ambientes.push({
    id:nid(), tipo, ml:0, largoCielo:0, alt:2.70,
    paredes:isFachada?1:4, anchoCielo:0, vanos:[],
    panos: isFachada ? [{id:nid(), ancho:0, alto:2.70}] : [],
    frenteIgual: false,
    conZocalo:false, zocLargo:0, zocAlto:0.15, zocMaterial:'Madera',
    conBaranda:false, barLargo:0, barAlto:1.0, barMaterial:'Metálica'
  });
  renderAmbientes();
}
function addPano(ambId){
  const a=ambientes.find(a=>a.id===ambId);if(!a)return;
  if(!Array.isArray(a.panos))a.panos=[];
  a.panos.push({id:nid(),ancho:0,alto:2.70});renderAmbientes();
}
function removePano(ambId,panoId){
  const a=ambientes.find(a=>a.id===ambId);if(!a||!Array.isArray(a.panos))return;
  if(a.panos.length<=1){return;} // al menos un paño
  a.panos=a.panos.filter(p=>p.id!==panoId);renderAmbientes();calc();
}
function panoChange(ambId,panoId,key,val){
  const a=ambientes.find(a=>a.id===ambId);if(!a||!Array.isArray(a.panos))return;
  const p=a.panos.find(p=>p.id===panoId);if(!p)return;
  p[key]=parseFloat(String(val).replace(',','.'))||0;
  const sub=document.getElementById(`pano-sub-${a.id}-${p.id}`);
  if(sub)sub.textContent=fm2((p.ancho||0)*(p.alto||0)*fachadaFactor(a));
  calcAmb(a.id);calc();
}
function addAmbVano(ambId){
  const a=ambientes.find(a=>a.id===ambId); if(!a)return;
  if(!Array.isArray(a.vanos)) a.vanos=[];
  a.vanos.push(createVano()); renderAmbientes();
}
function removeAmbVano(ambId,vanoId){
  const a=ambientes.find(a=>a.id===ambId); if(!a||!Array.isArray(a.vanos))return;
  a.vanos=a.vanos.filter(v=>v.id!==vanoId); renderAmbientes(); calc();
}
function ambVanoChange(ambId,vanoId,key,val){
  const a=ambientes.find(a=>a.id===ambId); if(!a||!Array.isArray(a.vanos))return;
  const v=a.vanos.find(v=>v.id===vanoId); if(!v)return;
  // Al cambiar tipo NO se sobreescriben ancho/alto (son manuales)
  if(key==='tipo'){ v.tipo=val; renderAmbientes(); calc(); return; }
  v[key]=parseFloat(String(val).replace(',','.'))||0;
  // Actualización in-place: NO re-renderizar mientras el usuario escribe
  // (el re-render destruye el input y le hace perder el foco al primer dígito).
  const sub=document.getElementById(`amb-vano-sub-${a.id}-${v.id}`);
  if(sub) sub.textContent=fm2((v.ancho||0)*(v.alto||0)*(v.cantidad||0));
  calcAmb(a.id); calc();
}
function removeAmbiente(id) { ambientes=ambientes.filter(a=>a.id!==id); renderAmbientes(); calc(); }
function toggleAmbiente(id){
  ambientes = ambientes.map(a => ({ ...a, abierto: a.id===id ? !a.abierto : false }));
  renderAmbientes();
}
function ambChange(id,key,val) {
  const a=ambientes.find(a=>a.id===id); if(!a)return;
  const bools=['conZocalo','conBaranda','frenteIgual'];
  const strs=['tipo','zocMaterial','barMaterial'];
  if(bools.includes(key)) a[key]=val;
  else if(strs.includes(key)) a[key]=val;
  else a[key]=(parseFloat(val)||0);
  if(key==='ml'){a.largoCielo=a.ml;const el=document.getElementById(`amb-lcielo-${id}`);if(el)el.value=a.largoCielo;}
  calcAmb(id); calc();
}
function calcAmb(id) {
  const a=ambientes.find(a=>a.id===id); if(!a)return;
  const el=document.getElementById(`amb-res-${id}`);if(el)el.textContent=fm2(Math.max(0,calcAmbTotal(a)));
  const muEl=document.getElementById(`amb-muro-${id}`);if(muEl)muEl.textContent=fm2(Math.max(0,calcAmbMuroBruto(a)));
  const vaEl=document.getElementById(`amb-vanos-${id}`);if(vaEl)vaEl.textContent=fm2(Math.max(0,calcAmbVanos(a)));
  const neEl=document.getElementById(`amb-neto-${id}`);if(neEl)neEl.textContent=fm2(Math.max(0,calcAmbMuroNeto(a)));
}
function renderAmbientes() {
  const c=document.getElementById('ambientes-container'); c.innerHTML='';
  let counts={};
  ambientes.forEach(a=>{
    if(typeof a.abierto!=='boolean') a.abierto=false;
    if(!Array.isArray(a.vanos)) a.vanos=[];
    counts[a.tipo]=(counts[a.tipo]||0)+1;
    let dispLabel=a.tipo;
    if((a.tipo==='Baño'||a.tipo==='Dormitorio')&&counts[a.tipo]>1) dispLabel=`${a.tipo} N°${counts[a.tipo]}`;
    const div=document.createElement('div'); div.className='amb-block';
    const isFachada=a.tipo==='Fachadas / muros exteriores';
    const muroBruto=Math.max(0,calcAmbMuroBruto(a));
    const vanosTotal=Math.max(0,calcAmbVanos(a));
    const muroNeto=Math.max(0,calcAmbMuroNeto(a));
    const cielo=Math.max(0,calcAmbCielo(a));
    const totalAmb=Math.max(0,calcAmbTotal(a));

    const bodyHtml = a.abierto ? `
      ${isFachada ? `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;margin-top:10px;gap:10px">
        <span style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px">¿Frente y contrafrente iguales?</span>
        <div class="tg-group" style="width:120px;margin:0">
          <button class="tg-btn ${!a.frenteIgual?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambChange(${a.id},'frenteIgual',false);renderAmbientes()">No</button>
          <button class="tg-btn ${a.frenteIgual?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambChange(${a.id},'frenteIgual',true);renderAmbientes()">Sí</button>
        </div>
      </div>
      ${a.frenteIgual?`<div style="font-size:10px;color:var(--accent);margin-bottom:8px;letter-spacing:.2px">Lados iguales · ingresás el frente y el lateral una vez y cada uno se multiplica ×2.</div>`:`<div style="font-size:10px;color:var(--text-tertiary);margin-bottom:8px;letter-spacing:.2px">Cargá cada cara como un paño por separado.</div>`}
      <div style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Paños de fachada${a.frenteIgual?' (lados iguales)':''}</div>
      ${(a.panos||[]).map((p,i,arr)=>`<div class="amb-block" style="padding:10px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${panoLabel(a,i,arr.length)}</div>
        <div class="row2" style="margin-bottom:8px">
          <div class="fg" style="margin-bottom:0"><label>Ancho (m)</label><input type="number" inputmode="decimal" value="${p.ancho||0}" min="0" step="0.01" oninput="panoChange(${a.id},${p.id},'ancho',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" inputmode="decimal" value="${p.alto||0}" min="0" step="0.01" oninput="panoChange(${a.id},${p.id},'alto',this.value)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span style="font-size:10px;color:var(--text-tertiary)">Paño${a.frenteIgual?' ×2':''}: <span id="pano-sub-${a.id}-${p.id}">${fm2((p.ancho||0)*(p.alto||0)*(a.frenteIgual?2:1))}</span></span>
          <button class="btn-rm" onclick="removePano(${a.id},${p.id})" ${(a.panos||[]).length<=1?'style="visibility:hidden"':''}>×</button>
        </div>
      </div>`).join('')}
      <button class="btn-add" onclick="addPano(${a.id})">+ Agregar paño</button>
      ` : `
      <div style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;margin-top:10px">Muros</div>
      <div class="row3" style="margin-bottom:10px">
        <div class="fg" style="margin-bottom:0"><label>Largo (m)</label><input type="number" value="${a.ml}" min="0" step="0.1" oninput="ambChange(${a.id},'ml',this.value)"></div>
        <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" value="${a.alt}" min="0" step="0.1" oninput="ambChange(${a.id},'alt',this.value)"></div>
        <div class="fg" style="margin-bottom:0"><label>Paredes</label><input type="number" value="${a.paredes}" min="1" step="1" oninput="ambChange(${a.id},'paredes',this.value)"></div>
      </div>
      <div style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Cielorraso</div>
      <div class="row2" style="margin-bottom:10px">
        <div class="fg" style="margin-bottom:0"><label>Largo (m)</label><input type="number" id="amb-lcielo-${a.id}" value="${a.largoCielo!==undefined?a.largoCielo:a.ml}" min="0" step="0.1" oninput="ambChange(${a.id},'largoCielo',this.value)"></div>
        <div class="fg" style="margin-bottom:0"><label>Ancho (m)</label><input type="number" value="${a.anchoCielo}" min="0" step="0.1" oninput="ambChange(${a.id},'anchoCielo',this.value)"></div>
      </div>
      `}
      <div style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Descuento de vanos</div>
      ${(a.vanos||[]).map(v=>`<div class="amb-block" style="padding:10px;margin-bottom:8px">
        <div class="row2" style="margin-bottom:8px">
          <div class="fg" style="margin-bottom:0"><label>Tipo</label><select onchange="ambVanoChange(${a.id},${v.id},'tipo',this.value)">${Object.entries(VANO_PRESETS).map(([key,cfg])=>`<option value="${key}" ${v.tipo===key?'selected':''}>${cfg.label}</option>`).join('')}</select></div>
          <div class="fg" style="margin-bottom:0"><label>Cantidad</label><input type="number" value="${v.cantidad}" min="0" step="1" oninput="ambVanoChange(${a.id},${v.id},'cantidad',this.value)"></div>
        </div>
        <div class="row2" style="margin-bottom:8px">
          <div class="fg" style="margin-bottom:0"><label>Ancho (m)</label><input type="number" inputmode="decimal" value="${v.ancho}" min="0" step="0.01" oninput="ambVanoChange(${a.id},${v.id},'ancho',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" inputmode="decimal" value="${v.alto}" min="0" step="0.01" oninput="ambVanoChange(${a.id},${v.id},'alto',this.value)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span style="font-size:10px;color:var(--text-tertiary)">Subtotal vano: <span id="amb-vano-sub-${a.id}-${v.id}">${fm2((v.ancho||0)*(v.alto||0)*(v.cantidad||0))}</span></span>
          <button class="btn-rm" onclick="removeAmbVano(${a.id},${v.id})">×</button>
        </div>
      </div>`).join('')}
      <button class="btn-add" onclick="addAmbVano(${a.id})">+ Agregar vano</button>
      <div class="sup-row" style="margin-top:10px">
        <div class="sup-chip"><span class="sl">${isFachada?'Total paños':'Muro bruto'}</span><span class="sv" id="amb-muro-${a.id}">${fm2(muroBruto)}</span></div>
        <div class="sup-chip"><span class="sl">Vanos</span><span class="sv" id="amb-vanos-${a.id}">${fm2(vanosTotal)}</span></div>
      </div>
      <div class="sup-total-chip" style="margin-top:8px">
        <span class="sl">${isFachada?'Superficie neta':'Muro neto'}</span>
        <span class="sv" id="amb-neto-${a.id}">${fm2(muroNeto)}</span>
      </div>

      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px">Zócalo</span>
          <div class="tg-group" style="width:120px;margin:0">
            <button class="tg-btn ${!a.conZocalo?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambChange(${a.id},'conZocalo',false);renderAmbientes()">No</button>
            <button class="tg-btn ${a.conZocalo?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambChange(${a.id},'conZocalo',true);renderAmbientes()">Sí</button>
          </div>
        </div>
        ${a.conZocalo?`
        <div class="row2" style="margin-bottom:6px">
          <div class="fg" style="margin-bottom:0"><label>Largo (m)</label><input type="number" value="${a.zocLargo||0}" min="0" step="0.1" oninput="ambChange(${a.id},'zocLargo',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" value="${a.zocAlto||0.15}" min="0" step="0.01" oninput="ambChange(${a.id},'zocAlto',this.value)"></div>
        </div>
        <div class="fg" style="margin-bottom:6px"><label>Material</label>
          <select onchange="ambChange(${a.id},'zocMaterial',this.value)">
            ${['Madera','MDF','Mármol','Cerámica'].map(m=>`<option value="${m}" ${a.zocMaterial===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:10px;color:var(--text-tertiary)">Sup. zócalo: ${fm2(calcAmbZocalo(a))}</span>
        </div>`:''}
      </div>

      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px">Baranda</span>
          <div class="tg-group" style="width:120px;margin:0">
            <button class="tg-btn ${!a.conBaranda?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambChange(${a.id},'conBaranda',false);renderAmbientes()">No</button>
            <button class="tg-btn ${a.conBaranda?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambChange(${a.id},'conBaranda',true);renderAmbientes()">Sí</button>
          </div>
        </div>
        ${a.conBaranda?`
        <div class="row2" style="margin-bottom:6px">
          <div class="fg" style="margin-bottom:0"><label>Largo (m)</label><input type="number" value="${a.barLargo||0}" min="0" step="0.1" oninput="ambChange(${a.id},'barLargo',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" value="${a.barAlto||1.0}" min="0" step="0.01" oninput="ambChange(${a.id},'barAlto',this.value)"></div>
        </div>
        <div class="fg" style="margin-bottom:6px"><label>Material</label>
          <select onchange="ambChange(${a.id},'barMaterial',this.value)">
            ${['Madera','Metálica','Hierro'].map(m=>`<option value="${m}" ${a.barMaterial===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:10px;color:var(--text-tertiary)">Sup. baranda: ${fm2(calcAmbBaranda(a))}</span>
        </div>`:''}
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:10px;gap:6px;align-items:center">
        <span style="font-size:10px;color:var(--text-tertiary)">Subtotal Ambiente:</span>
        <span id="amb-res-${a.id}" style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:var(--accent)">${fm2(totalAmb)}</span>
      </div>` : ``;

    div.innerHTML=`
      <div class="amb-head" style="margin-bottom:${a.abierto?'8px':'0'}">
        <button type="button" onclick="toggleAmbiente(${a.id})" style="background:transparent;border:none;color:var(--text-secondary);display:grid;place-items:center;width:28px;height:28px;cursor:pointer;flex-shrink:0;font-size:14px;font-family:'DM Mono',monospace;transform:rotate(${a.abierto?'180deg':'0deg'});transition:transform .2s">▾</button>
        ${a.abierto?`
        <select style="background:transparent;border:none;color:var(--accent);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;flex:1;padding:0;outline:none;min-width:0;font-family:'Manrope',sans-serif" onchange="ambChange(${a.id},'tipo',this.value)">
          ${AMBIENTE_TIPOS.map(t=>{let optText=t===a.tipo?dispLabel:t;let sel=t===a.tipo?'selected':'';return`<option value="${t}" ${sel}>${optText}</option>`;}).join('')}
        </select>`:`
        <button type="button" onclick="toggleAmbiente(${a.id})" style="flex:1;display:flex;align-items:center;justify-content:space-between;min-width:0;background:transparent;border:none;cursor:pointer;padding:0 4px;gap:10px">
          <span style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dispLabel}</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--text-secondary);white-space:nowrap;flex-shrink:0">${fm2(totalAmb)}</span>
        </button>`}
        <button class="btn-rm" type="button" onclick="removeAmbiente(${a.id})">×</button>
      </div>
      ${bodyHtml}`;
    c.appendChild(div); calcAmb(a.id);
  });
  calc();
}

// ── AMBIENTES EDIFICIO (misma lógica que casa) ──
let ambientesEdf = [];
const AMBIENTE_EDF_TIPOS = [
  'Escalera / Circulación','Hall / Lobby','Unidad tipo','Fachada','Pasillo','Palier',
  'Sum / Amenities','Cochera','Terraza / Azotea','Local comercial','Otro'
];

function renderAmbientesEdfSelector(){
  const c=document.getElementById('ambientes-edf-selector');if(!c)return;c.innerHTML='';
  AMBIENTE_EDF_TIPOS.forEach(t=>{
    const btn=document.createElement('button');
    btn.style.cssText='background:var(--bg-elevated);border:1px solid var(--border-2);border-radius:6px;padding:6px 12px;font-size:11px;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:all .15s;font-family:Manrope,sans-serif;letter-spacing:.3px';
    btn.onmouseover=()=>{btn.style.borderColor='var(--accent)';btn.style.color='var(--accent)'};
    btn.onmouseout=()=>{btn.style.borderColor='var(--border-2)';btn.style.color='var(--text-secondary)'};
    btn.textContent='+ '+t;
    btn.onclick=()=>addAmbienteEdf(t);
    c.appendChild(btn);
  });
}

function addAmbienteEdf(tipo){
  const isFachada = tipo === 'Fachada';
  ambientesEdf.push({
    id:nid(), tipo, ml:0, largoCielo:0, alt:2.70,
    paredes:isFachada?1:4, anchoCielo:0, vanos:[],
    panos: isFachada ? [{id:nid(), ancho:0, alto:2.70}] : [],
    niveles:1,
    conZocalo:false, zocLargo:0, zocAlto:0.15, zocMaterial:'Madera',
    conBaranda:false, barLargo:0, barAlto:1.0, barMaterial:'Metálica',
    abierto:false
  });
  renderAmbientesEdf();
}
function addPanoEdf(ambId){
  const a=ambientesEdf.find(a=>a.id===ambId);if(!a)return;
  if(!Array.isArray(a.panos))a.panos=[];
  a.panos.push({id:nid(),ancho:0,alto:2.70});renderAmbientesEdf();
}
function removePanoEdf(ambId,panoId){
  const a=ambientesEdf.find(a=>a.id===ambId);if(!a||!Array.isArray(a.panos))return;
  if(a.panos.length<=1)return;
  a.panos=a.panos.filter(p=>p.id!==panoId);renderAmbientesEdf();calc();
}
function panoEdfChange(ambId,panoId,key,val){
  const a=ambientesEdf.find(a=>a.id===ambId);if(!a||!Array.isArray(a.panos))return;
  const p=a.panos.find(p=>p.id===panoId);if(!p)return;
  p[key]=parseFloat(String(val).replace(',','.'))||0;
  const sub=document.getElementById(`panoedf-sub-${a.id}-${p.id}`);
  if(sub)sub.textContent=fm2((p.ancho||0)*(p.alto||0)*(a.niveles||1));
  calcAmbEdf(a.id);calc();
}

function removeAmbienteEdf(id){ambientesEdf=ambientesEdf.filter(a=>a.id!==id);renderAmbientesEdf();calc();}

function toggleAmbienteEdf(id){
  ambientesEdf=ambientesEdf.map(a=>({...a,abierto:a.id===id?!a.abierto:false}));
  renderAmbientesEdf();
}

function ambEdfChange(id,key,val){
  const a=ambientesEdf.find(a=>a.id===id);if(!a)return;
  const bools=['conZocalo','conBaranda'];
  const strs=['tipo','zocMaterial','barMaterial'];
  if(bools.includes(key)) a[key]=val;
  else if(strs.includes(key)) a[key]=val;
  else a[key]=(parseFloat(val)||0);
  if(key==='ml'){a.largoCielo=a.ml;const el=document.getElementById(`ambedf-lcielo-${id}`);if(el)el.value=a.largoCielo;}
  calcAmbEdf(id);calc();
}

function calcAmbEdfMuroBruto(a){
  const isFachada = a.tipo === 'Fachada';
  if(isFachada && a.panos && a.panos.length > 0)
    return a.panos.reduce((s,p)=>s+(p.ancho||0)*(p.alto||0),0)*(a.niveles||1);
  return a.ml*a.alt*a.paredes*(a.niveles||1);
}
function calcAmbEdfCielo(a){ const lc=a.largoCielo!==undefined?a.largoCielo:a.ml; return lc*a.anchoCielo*(a.niveles||1); }
function calcAmbEdfVanos(a){ return getVanosTotal(a.vanos)*(a.niveles||1); }
function calcAmbEdfMuroNeto(a){ return Math.max(0,calcAmbEdfMuroBruto(a)-calcAmbEdfVanos(a)); }
function calcAmbEdfZocalo(a){ return (a.conZocalo&&a.zocLargo&&a.zocAlto)?(a.zocLargo*a.zocAlto*(a.niveles||1)):0; }
function calcAmbEdfBaranda(a){ return (a.conBaranda&&a.barLargo&&a.barAlto)?(a.barLargo*a.barAlto*(a.niveles||1)):0; }
function calcAmbEdfTotal(a){ return calcAmbEdfMuroNeto(a)+calcAmbEdfCielo(a)+calcAmbEdfZocalo(a)+calcAmbEdfBaranda(a); }

function calcAmbEdf(id){
  const a=ambientesEdf.find(a=>a.id===id);if(!a)return;
  const el=document.getElementById(`ambedf-res-${id}`);if(el)el.textContent=fm2(Math.max(0,calcAmbEdfTotal(a)));
  const muEl=document.getElementById(`ambedf-muro-${id}`);if(muEl)muEl.textContent=fm2(Math.max(0,calcAmbEdfMuroBruto(a)));
  const vaEl=document.getElementById(`ambedf-vanos-${id}`);if(vaEl)vaEl.textContent=fm2(Math.max(0,calcAmbEdfVanos(a)));
  const neEl=document.getElementById(`ambedf-neto-${id}`);if(neEl)neEl.textContent=fm2(Math.max(0,calcAmbEdfMuroNeto(a)));
}

function addAmbEdfVano(ambId){
  const a=ambientesEdf.find(a=>a.id===ambId);if(!a)return;
  if(!Array.isArray(a.vanos))a.vanos=[];
  a.vanos.push(createVano());renderAmbientesEdf();
}
function removeAmbEdfVano(ambId,vanoId){
  const a=ambientesEdf.find(a=>a.id===ambId);if(!a||!Array.isArray(a.vanos))return;
  a.vanos=a.vanos.filter(v=>v.id!==vanoId);renderAmbientesEdf();calc();
}
function ambEdfVanoChange(ambId,vanoId,key,val){
  const a=ambientesEdf.find(a=>a.id===ambId);if(!a||!Array.isArray(a.vanos))return;
  const v=a.vanos.find(v=>v.id===vanoId);if(!v)return;
  if(key==='tipo'){ v.tipo=val; renderAmbientesEdf(); calc(); return; }
  v[key]=parseFloat(String(val).replace(',','.'))||0;
  const sub=document.getElementById(`ambedf-vano-sub-${a.id}-${v.id}`);
  if(sub) sub.textContent=fm2((v.ancho||0)*(v.alto||0)*(v.cantidad||0)*(a.niveles||1));
  calcAmbEdf(a.id); calc();
}

function renderAmbientesEdf(){
  const c=document.getElementById('ambientes-edf-container');if(!c)return;c.innerHTML='';
  let counts={};
  ambientesEdf.forEach(a=>{
    if(typeof a.abierto!=='boolean')a.abierto=false;
    if(!Array.isArray(a.vanos))a.vanos=[];
    counts[a.tipo]=(counts[a.tipo]||0)+1;
    let dispLabel=a.tipo;
    if(counts[a.tipo]>1)dispLabel=`${a.tipo} N°${counts[a.tipo]}`;
    const muroBruto=Math.max(0,calcAmbEdfMuroBruto(a));
    const vanosTotal=Math.max(0,calcAmbEdfVanos(a));
    const muroNeto=Math.max(0,calcAmbEdfMuroNeto(a));
    const totalAmb=Math.max(0,calcAmbEdfTotal(a));
    const div=document.createElement('div');div.className='amb-block';

    const isFachadaEdf = a.tipo === 'Fachada';
    const bodyHtml=a.abierto?`
      ${isFachadaEdf ? `
      <div style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;margin-top:10px">Paños de fachada</div>
      ${(a.panos||[]).map(p=>`<div class="amb-block" style="padding:10px;margin-bottom:8px">
        <div class="row2" style="margin-bottom:8px">
          <div class="fg" style="margin-bottom:0"><label>Ancho (m)</label><input type="number" inputmode="decimal" value="${p.ancho||0}" min="0" step="0.01" oninput="panoEdfChange(${a.id},${p.id},'ancho',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" inputmode="decimal" value="${p.alto||0}" min="0" step="0.01" oninput="panoEdfChange(${a.id},${p.id},'alto',this.value)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span style="font-size:10px;color:var(--text-tertiary)">Paño × ${a.niveles||1} nivel(es): <span id="panoedf-sub-${a.id}-${p.id}">${fm2((p.ancho||0)*(p.alto||0)*(a.niveles||1))}</span></span>
          <button class="btn-rm" onclick="removePanoEdf(${a.id},${p.id})" ${(a.panos||[]).length<=1?'style="visibility:hidden"':''}>×</button>
        </div>
      </div>`).join('')}
      <button class="btn-add" onclick="addPanoEdf(${a.id})">+ Agregar paño</button>
      <div class="fg" style="margin-top:10px;margin-bottom:0"><label>Niveles / pisos</label><input type="number" value="${a.niveles||1}" min="1" step="1" oninput="ambEdfChange(${a.id},'niveles',this.value)"></div>
      ` : `
      <div style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;margin-top:10px">Muros</div>
      <div class="row3" style="margin-bottom:10px">
        <div class="fg" style="margin-bottom:0"><label>Largo (m)</label><input type="number" value="${a.ml}" min="0" step="0.1" oninput="ambEdfChange(${a.id},'ml',this.value)"></div>
        <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" value="${a.alt}" min="0" step="0.1" oninput="ambEdfChange(${a.id},'alt',this.value)"></div>
        <div class="fg" style="margin-bottom:0"><label>Paredes</label><input type="number" value="${a.paredes}" min="1" step="1" oninput="ambEdfChange(${a.id},'paredes',this.value)"></div>
      </div>
      <div style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Cielorraso</div>
      <div class="row3" style="margin-bottom:10px">
        <div class="fg" style="margin-bottom:0"><label>Largo (m)</label><input type="number" id="ambedf-lcielo-${a.id}" value="${a.largoCielo!==undefined?a.largoCielo:a.ml}" min="0" step="0.1" oninput="ambEdfChange(${a.id},'largoCielo',this.value)"></div>
        <div class="fg" style="margin-bottom:0"><label>Ancho (m)</label><input type="number" value="${a.anchoCielo}" min="0" step="0.1" oninput="ambEdfChange(${a.id},'anchoCielo',this.value)"></div>
        <div class="fg" style="margin-bottom:0"><label>Niveles / pisos</label><input type="number" value="${a.niveles||1}" min="1" step="1" oninput="ambEdfChange(${a.id},'niveles',this.value)"></div>
      </div>
      `}
      <div style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Vanos</div>
      ${(a.vanos||[]).map(v=>`<div class="amb-block" style="padding:10px;margin-bottom:8px">
        <div class="row2" style="margin-bottom:8px">
          <div class="fg" style="margin-bottom:0"><label>Tipo</label><select onchange="ambEdfVanoChange(${a.id},${v.id},'tipo',this.value)">${Object.entries(VANO_PRESETS).map(([key,cfg])=>`<option value="${key}" ${v.tipo===key?'selected':''}>${cfg.label}</option>`).join('')}</select></div>
          <div class="fg" style="margin-bottom:0"><label>Cantidad</label><input type="number" value="${v.cantidad}" min="0" step="1" oninput="ambEdfVanoChange(${a.id},${v.id},'cantidad',this.value)"></div>
        </div>
        <div class="row2" style="margin-bottom:8px">
          <div class="fg" style="margin-bottom:0"><label>Ancho (m)</label><input type="number" inputmode="decimal" value="${v.ancho}" min="0" step="0.01" oninput="ambEdfVanoChange(${a.id},${v.id},'ancho',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" inputmode="decimal" value="${v.alto}" min="0" step="0.01" oninput="ambEdfVanoChange(${a.id},${v.id},'alto',this.value)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span style="font-size:10px;color:var(--text-tertiary)">Subtotal vano: <span id="ambedf-vano-sub-${a.id}-${v.id}">${fm2((v.ancho||0)*(v.alto||0)*(v.cantidad||0)*(a.niveles||1))}</span></span>
          <button class="btn-rm" onclick="removeAmbEdfVano(${a.id},${v.id})">×</button>
        </div>
      </div>`).join('')}
      <button class="btn-add" onclick="addAmbEdfVano(${a.id})">+ Agregar vano</button>
      <div class="sup-row" style="margin-top:10px">
        <div class="sup-chip"><span class="sl">${isFachadaEdf?'Total paños':'Muro bruto'}</span><span class="sv" id="ambedf-muro-${a.id}">${fm2(muroBruto)}</span></div>
        <div class="sup-chip"><span class="sl">Vanos</span><span class="sv" id="ambedf-vanos-${a.id}">${fm2(vanosTotal)}</span></div>
      </div>
      <div class="sup-total-chip" style="margin-top:8px">
        <span class="sl">${isFachadaEdf?'Superficie neta':'Muro neto'}</span>
        <span class="sv" id="ambedf-neto-${a.id}">${fm2(muroNeto)}</span>
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px">Zócalo</span>
          <div class="tg-group" style="width:120px;margin:0">
            <button class="tg-btn ${!a.conZocalo?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambEdfChange(${a.id},'conZocalo',false);renderAmbientesEdf()">No</button>
            <button class="tg-btn ${a.conZocalo?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambEdfChange(${a.id},'conZocalo',true);renderAmbientesEdf()">Sí</button>
          </div>
        </div>
        ${a.conZocalo?`<div class="row2" style="margin-bottom:6px">
          <div class="fg" style="margin-bottom:0"><label>Largo (m)</label><input type="number" value="${a.zocLargo||0}" min="0" step="0.1" oninput="ambEdfChange(${a.id},'zocLargo',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" value="${a.zocAlto||0.15}" min="0" step="0.01" oninput="ambEdfChange(${a.id},'zocAlto',this.value)"></div>
        </div>
        <div class="fg" style="margin-bottom:4px"><label>Material</label>
          <select onchange="ambEdfChange(${a.id},'zocMaterial',this.value)">
            ${['Madera','MDF','Mármol','Cerámica'].map(m=>`<option value="${m}" ${a.zocMaterial===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <span style="font-size:10px;color:var(--text-tertiary)">Sup. zócalo: ${fm2(calcAmbEdfZocalo(a))}</span>`:''}
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px">Baranda</span>
          <div class="tg-group" style="width:120px;margin:0">
            <button class="tg-btn ${!a.conBaranda?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambEdfChange(${a.id},'conBaranda',false);renderAmbientesEdf()">No</button>
            <button class="tg-btn ${a.conBaranda?'on':''}" style="padding:4px 8px;font-size:10px" onclick="ambEdfChange(${a.id},'conBaranda',true);renderAmbientesEdf()">Sí</button>
          </div>
        </div>
        ${a.conBaranda?`<div class="row2" style="margin-bottom:6px">
          <div class="fg" style="margin-bottom:0"><label>Largo (m)</label><input type="number" value="${a.barLargo||0}" min="0" step="0.1" oninput="ambEdfChange(${a.id},'barLargo',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" value="${a.barAlto||1.0}" min="0" step="0.01" oninput="ambEdfChange(${a.id},'barAlto',this.value)"></div>
        </div>
        <div class="fg" style="margin-bottom:4px"><label>Material</label>
          <select onchange="ambEdfChange(${a.id},'barMaterial',this.value)">
            ${['Madera','Metálica','Hierro'].map(m=>`<option value="${m}" ${a.barMaterial===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <span style="font-size:10px;color:var(--text-tertiary)">Sup. baranda: ${fm2(calcAmbEdfBaranda(a))}</span>`:''}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:10px;gap:6px;align-items:center">
        <span style="font-size:10px;color:var(--text-tertiary)">Subtotal:</span>
        <span id="ambedf-res-${a.id}" style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:var(--accent)">${fm2(totalAmb)}</span>
      </div>`:'';

    div.innerHTML=`
      <div class="amb-head" style="margin-bottom:${a.abierto?'8px':'0'}">
        <button type="button" onclick="toggleAmbienteEdf(${a.id})" style="background:transparent;border:none;color:var(--text-secondary);display:grid;place-items:center;width:28px;height:28px;cursor:pointer;flex-shrink:0;font-size:14px;font-family:'DM Mono',monospace;transform:rotate(${a.abierto?'180deg':'0deg'});transition:transform .2s">▾</button>
        ${a.abierto?`
        <select style="background:transparent;border:none;color:var(--accent);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;flex:1;padding:0;outline:none;min-width:0;font-family:'Manrope',sans-serif" onchange="ambEdfChange(${a.id},'tipo',this.value)">
          ${AMBIENTE_EDF_TIPOS.map(t=>`<option value="${t}" ${a.tipo===t?'selected':''}>${t===a.tipo?dispLabel:t}</option>`).join('')}
        </select>`:`
        <button type="button" onclick="toggleAmbienteEdf(${a.id})" style="flex:1;display:flex;align-items:center;justify-content:space-between;min-width:0;background:transparent;border:none;cursor:pointer;padding:0 4px;gap:10px">
          <span style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dispLabel}</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--text-secondary);white-space:nowrap;flex-shrink:0">${fm2(totalAmb)}</span>
        </button>`}
        <button class="btn-rm" type="button" onclick="removeAmbienteEdf(${a.id})">×</button>
      </div>
      ${bodyHtml}`;
    c.appendChild(div);calcAmbEdf(a.id);
  });calc();
}

// ── SECTORES EDIFICIO (legacy, mantiene compatibilidad con historial) ──
const SECTOR_TIPOS=[
  {v:'muro',  l:'Muro simple - largo x alto x niveles'},
  {v:'muro2', l:'2 muros iguales - largo x alto x 2 x niveles'},
  {v:'horiz', l:'Plano horizontal - largo x ancho x niveles'},
  {v:'cielo', l:'Cielorraso - largo x ancho x niveles'},
];
function addSector(){sectores.push({id:nid(),nombre:'Sector',tipo:'muro',d1:0,d2:0,niveles:1,manos:1,paredes:1,vanos:[],abierto:false});renderSectores();}
function addSectorVano(sectorId){
  const s=sectores.find(s=>s.id===sectorId);if(!s)return;
  if(!Array.isArray(s.vanos))s.vanos=[];
  s.vanos.push(createVano());s.abierto=true;renderSectores();
}
function removeSectorVano(sectorId,vanoId){
  const s=sectores.find(s=>s.id===sectorId);if(!s||!Array.isArray(s.vanos))return;
  s.vanos=s.vanos.filter(v=>v.id!==vanoId);renderSectores();calc();
}
function sectorVanoChange(sectorId,vanoId,key,val){
  const s=sectores.find(s=>s.id===sectorId);if(!s||!Array.isArray(s.vanos))return;
  const v=s.vanos.find(v=>v.id===vanoId);if(!v)return;
  // Al cambiar tipo NO se sobreescriben ancho/alto (son manuales)
  if(key==='tipo'){v.tipo=val;}
  else{v[key]=parseFloat(val)||0;}
  renderSectores();calc();
}
function removeSector(id){sectores=sectores.filter(s=>s.id!==id);renderSectores();calc();}
function toggleSector(id){sectores=sectores.map(s=>({...s,abierto:s.id===id?!s.abierto:false}));renderSectores();}
function sectorChange(id,key,val){
  const s=sectores.find(s=>s.id===id);if(!s)return;
  s[key]=(key==='nombre'||key==='tipo')?val:(parseFloat(val)||0);calcSectorDisp(id);calc();
}
function calcSectorDisp(id){
  const s=sectores.find(s=>s.id===id);if(!s)return;
  const bruto=Math.max(0,calcSectorBruto(s));
  const vanos=(s.tipo==='muro'||s.tipo==='muro2')?Math.max(0,calcSectorVanos(s)):0;
  const neto=Math.max(0,calcSectorNeto(s));
  const el=document.getElementById(`sec-res-${id}`);if(el)el.textContent=fm2(neto);
  const br=document.getElementById(`sec-bruto-${id}`);if(br)br.textContent=fm2(bruto);
  const va=document.getElementById(`sec-vanos-${id}`);if(va)va.textContent=fm2(vanos);
}
function renderSectores(){
  const c=document.getElementById('sectores-container');c.innerHTML='';
  sectores.forEach((s,idx)=>{
    if(typeof s.abierto!=='boolean')s.abierto=false;
    if(!Array.isArray(s.vanos))s.vanos=[];
    const esMuro=s.tipo==='muro'||s.tipo==='muro2';
    const lbl2=esMuro?'Alto / altura pared (m)':'Ancho (m)';
    const mult=s.tipo==='muro2'?2:1;
    const brutoTotal=s.d1*s.d2*mult*(s.niveles||1);
    const vanosTotal=esMuro?calcSectorVanos(s):0;
    const neto=Math.max(0,esMuro?(brutoTotal-vanosTotal):brutoTotal);
    const titulo=(s.nombre||`Sector ${idx+1}`).trim()||`Sector ${idx+1}`;
    let formulaStr=esMuro
      ?`${s.d1} ml x ${s.d2} m alto${s.tipo==='muro2'?' x 2 muros':''} x ${s.niveles} niveles = <strong>${fm2(brutoTotal)}</strong>`
      :`${s.d1} m x ${s.d2} m x ${s.niveles} niveles = <strong>${fm2(brutoTotal)}</strong>`;

    const bodyHtml=s.abierto?`
      <div class="fg"><label>Nombre del sector</label><input type="text" value="${titulo}" oninput="sectorChange(${s.id},'nombre',this.value)"></div>
      <div class="fg"><label>Tipo de superficie</label>
        <select onchange="sectorChange(${s.id},'tipo',this.value)">
          ${SECTOR_TIPOS.map(t=>`<option value="${t.v}" ${s.tipo===t.v?'selected':''}>${t.l}</option>`).join('')}
        </select>
      </div>
      <div class="row3">
        <div class="fg" style="margin-bottom:0"><label>Largo (m)</label><input type="number" value="${s.d1}" min="0" step="0.01" oninput="sectorChange(${s.id},'d1',this.value)"></div>
        <div class="fg" style="margin-bottom:0"><label>${lbl2}</label><input type="number" value="${s.d2}" min="0" step="0.01" oninput="sectorChange(${s.id},'d2',this.value)"></div>
        <div class="fg" style="margin-bottom:0"><label>${esMuro?'Cant. muros / niveles':'Niveles'}</label><input type="number" value="${s.niveles}" min="1" step="1" oninput="sectorChange(${s.id},'niveles',this.value)"></div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-top:8px;font-size:11px;color:var(--text-secondary)">
        <span style="color:var(--text-tertiary);font-weight:700;text-transform:uppercase;letter-spacing:.5px;font-size:9px">Fórmula: </span>${formulaStr}
      </div>
      ${esMuro?`
      <div style="font-size:9px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;margin-top:10px">Descuento de vanos</div>
      ${(s.vanos||[]).map(v=>`<div class="amb-block" style="padding:10px;margin-bottom:8px">
        <div class="row2" style="margin-bottom:8px">
          <div class="fg" style="margin-bottom:0"><label>Tipo</label><select onchange="sectorVanoChange(${s.id},${v.id},'tipo',this.value)">${Object.entries(VANO_PRESETS).map(([key,cfg])=>`<option value="${key}" ${v.tipo===key?'selected':''}>${cfg.label}</option>`).join('')}</select></div>
          <div class="fg" style="margin-bottom:0"><label>Cantidad</label><input type="number" value="${v.cantidad}" min="0" step="1" oninput="sectorVanoChange(${s.id},${v.id},'cantidad',this.value)"></div>
        </div>
        <div class="row2" style="margin-bottom:8px">
          <div class="fg" style="margin-bottom:0"><label>Ancho (m)</label><input type="number" value="${v.ancho}" min="0" step="0.01" oninput="sectorVanoChange(${s.id},${v.id},'ancho',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Alto (m)</label><input type="number" value="${v.alto}" min="0" step="0.01" oninput="sectorVanoChange(${s.id},${v.id},'alto',this.value)"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span style="font-size:10px;color:var(--text-tertiary)">Subtotal vano: ${fm2((v.ancho||0)*(v.alto||0)*(v.cantidad||0))}</span>
          <button class="btn-rm" onclick="removeSectorVano(${s.id},${v.id})">×</button>
        </div>
      </div>`).join('')}
      <button class="btn-add" type="button" onclick="addSectorVano(${s.id})">+ Agregar vano</button>
      <div class="sup-row" style="margin-top:8px">
        <div class="sup-chip"><span class="sl">Muro bruto</span><span class="sv" id="sec-bruto-${s.id}">${fm2(brutoTotal)}</span></div>
        <div class="sup-chip"><span class="sl">Vanos</span><span class="sv" id="sec-vanos-${s.id}">${fm2(vanosTotal)}</span></div>
      </div>`:''}
      <div style="display:flex;justify-content:flex-end;margin-top:8px;gap:6px;align-items:center">
        <span style="font-size:10px;color:var(--text-tertiary)">Superficie neta:</span>
        <span id="sec-res-${s.id}" style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:var(--accent)">${fm2(neto)}</span>
      </div>`:'';

    const div=document.createElement('div');div.className='amb-block';
    div.innerHTML=`
      <div class="amb-head" style="margin-bottom:${s.abierto?'8px':'0'}">
        <button type="button" onclick="toggleSector(${s.id})" style="background:transparent;border:none;color:var(--text-secondary);display:grid;place-items:center;width:28px;height:28px;cursor:pointer;flex-shrink:0;font-size:14px;font-family:'DM Mono',monospace;transform:rotate(${s.abierto?'180deg':'0deg'});transition:transform .2s">▾</button>
        ${s.abierto?`
        <input type="text" value="${titulo}" style="background:transparent;border:none;color:var(--accent);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;flex:1;padding:0;outline:none;min-width:0;font-family:'DM Sans',sans-serif" oninput="sectorChange(${s.id},'nombre',this.value)">`:`
        <button type="button" onclick="toggleSector(${s.id})" style="flex:1;display:flex;align-items:center;justify-content:space-between;min-width:0;background:transparent;border:none;cursor:pointer;padding:0 4px;gap:10px">
          <span style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${titulo}</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--text-secondary);white-space:nowrap;flex-shrink:0">${fm2(neto)}</span>
        </button>`}
        <button class="btn-rm" type="button" onclick="removeSector(${s.id})">×</button>
      </div>
      ${bodyHtml}`;
    c.appendChild(div);calcSectorDisp(s.id);
  });calc();
}

// ── CUADRILLA ──
function renderCuadrilla(){
  const c=document.getElementById('cuadrilla-container');c.innerHTML='';
  ROLES.forEach((r,i)=>{
    const div=document.createElement('div');div.className='cuad-role';
    div.innerHTML=`
      <div class="cuad-role-head"><span class="role-badge ${r.badge}">${r.label}</span></div>
      <div class="fg" style="margin-bottom:0"><label>Cantidad</label><input type="number" value="${r.qty}" min="0" step="1" oninput="roleChange(${i},'qty',this.value)"></div>
      <div class="cuad-calc" id="role-calc-${i}">Valor/hora: ${fmtm(r.hora)} · Jornada: ${fmtm(r.hora*8)}</div>`;
    c.appendChild(div);
  });
}
function roleChange(i,key,val){
  ROLES[i][key]=parseFloat(val)||0;
  document.getElementById(`role-calc-${i}`).textContent=`Valor/hora: ${fmtm(ROLES[i].hora)} · Jornada: ${fmtm(ROLES[i].hora*8)}`;
  calc();
}

function combChange(){
  S.combVehCant=fv('px-veh-cant');
  S.combDias=fv('px-dias');
  S.combKmDia=fv('px-km-dia');
  calc();
}

// ── CARPINTERÍA ──
const CARP_MATS={puerta_int:['Madera','Metálica','Aluminio'],puerta_ext:['Madera','Metálica','Aluminio'],puerta_asc:['Madera','Metálica'],ven_int:['Madera','Metálica','Aluminio','PVC'],ven_ext:['Madera','Metálica','Aluminio','PVC'],zocalo:['Madera','Cerámica','MDF'],baranda:['Madera','Metálica','Hierro']};
const CARP_LABELS={puerta_int:'Puerta interior',puerta_ext:'Puerta exterior',puerta_asc:'Pta. Ascensor',ven_int:'Ventana interior',ven_ext:'Ventana exterior',zocalo:'Zócalo',baranda:'Baranda'};

// Devuelve un objeto con secciones agrupadas (Puertas / Ventanas / Zócalos / Barandas)
// de los items cargados. Cada línea ya viene con cantidad + descripción + material.
function describeCarpItems(items){
  const list=(items||[]).filter(c=>c&&(c.cant|0)>0);
  const groupOf=cat=>{
    if(cat==='puerta_int'||cat==='puerta_ext'||cat==='puerta_asc') return 'Puertas';
    if(cat==='ven_int'||cat==='ven_ext') return 'Ventanas';
    if(cat==='zocalo') return 'Zócalos';
    if(cat==='baranda') return 'Barandas';
    return 'Otros';
  };
  const singular={puerta_int:'Puerta interior',puerta_ext:'Puerta exterior',puerta_asc:'Puerta de ascensor',ven_int:'Ventana interior',ven_ext:'Ventana exterior',zocalo:'Zócalo',baranda:'Baranda'};
  const plural  ={puerta_int:'Puertas interiores',puerta_ext:'Puertas exteriores',puerta_asc:'Puertas de ascensor',ven_int:'Ventanas interiores',ven_ext:'Ventanas exteriores',zocalo:'Zócalos',baranda:'Barandas'};
  const sections={};
  list.forEach(c=>{
    const g=groupOf(c.cat);
    if(!sections[g]) sections[g]=[];
    const n=c.cant|0;
    const nombre=(n===1?singular[c.cat]:plural[c.cat])||CARP_LABELS[c.cat]||c.cat;
    const mat=c.material?` (${c.material})`:'';
    sections[g].push({ qty:n, line:`${n} ${nombre}${mat}` });
  });
  return sections;
}
function carpItemsAnyIn(items,cats){
  return (items||[]).some(c=>c&&(c.cant|0)>0&&cats.includes(c.cat));
}
function addCarpItem(cat){carpItems.push({id:nid(),cat,material:CARP_MATS[cat][0],cant:1,precio:0});renderCarpinteria();}
function removeCarpItem(id){carpItems=carpItems.filter(c=>c.id!==id);renderCarpinteria();calc();}
function carpChange(id,key,val){
  const c=carpItems.find(c=>c.id===id);if(!c)return;
  c[key]=key==='material'?val:(parseFloat(val)||0);
  const el=document.getElementById(`carp-sub-${id}`);if(el)el.textContent=fmtm(c.cant*c.precio);
  calcCarpTotal();calc();
}
function calcCarpTotal(){
  const total=carpItems.reduce((s,c)=>s+c.cant*c.precio,0);
  const el=document.getElementById('carp-total');if(el)el.textContent=fmtm(total);return total;
}
function renderCarpinteria(){
  ['puerta_int','puerta_ext','puerta_asc','ven_int','ven_ext','zocalo','baranda'].forEach(cat=>{
    const container=document.getElementById(`carp-${cat}-container`);if(!container)return;
    container.innerHTML='';
    carpItems.filter(c=>c.cat===cat).forEach(c=>{
      const div=document.createElement('div');div.className='amb-block';div.style.marginBottom='8px';
      div.innerHTML=`
        <div class="amb-head" style="margin-bottom:8px">
          <span style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px">${CARP_LABELS[cat]}</span>
          <button class="btn-rm" onclick="removeCarpItem(${c.id})">×</button>
        </div>
        <div class="fg" style="margin-bottom:8px"><label>Material</label>
          <select onchange="carpChange(${c.id},'material',this.value)">
            ${CARP_MATS[cat].map(m=>`<option value="${m}" ${c.material===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="row2">
          <div class="fg" style="margin-bottom:0"><label>Cantidad</label><input type="number" value="${c.cant}" min="1" step="1" oninput="carpChange(${c.id},'cant',this.value)"></div>
          <div class="fg" style="margin-bottom:0"><label>Precio unit. $</label><input type="text" inputmode="numeric" value="${fmNum(c.precio)}" placeholder="$ unit" oninput="carpChange(${c.id},'precio',formatInputMoneda(this))"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <span style="font-size:10px;color:var(--text-tertiary)">Subtotal:</span>
          <span id="carp-sub-${c.id}" style="font-family:'DM Mono',monospace;font-size:13px;color:var(--accent)">${fmtm(c.cant*c.precio)}</span>
        </div>`;
      container.appendChild(div);
    });
  });
  calcCarpTotal();
}

// ── PINTURA ──
const TIPOS_PINTURA = {
  latexInteriorSatinada:{ nombre:"Látex Interior Satinada", rendimiento:9 },
  latexExterior:        { nombre:"Látex Exterior",          rendimiento:8 },
  satinadaGeneral:      { nombre:"Satinada General",        rendimiento:9 },
  latexMateSeda:        { nombre:"Látex Mate / Seda",       rendimiento:8 },
  esmalteSintetico:     { nombre:"Esmalte Sintético",       rendimiento:12 }
};
const FACTOR_SUPERFICIE = { normal:1, absorbente:0.85, rugosa:0.75 };
function sugerirEnvases(litros){
  const tamanos=[20,10,4,1],partes=[];let restante=Math.ceil(Math.max(0,litros));
  for(const tam of tamanos){const cantidad=Math.floor(restante/tam);if(cantidad>0){partes.push(`${cantidad} x ${tam}L`);restante-=cantidad*tam;}}
  if(restante>0)partes.push(`1 x ${restante}L`);
  return partes.length?partes.join(' + '):'Sin sugerencia';
}
function calcPintura(m2Base){
  const tipoEl=document.getElementById('paint-tipo');
  const manosEl=document.getElementById('paint-manos');
  const superficieEl=document.getElementById('paint-superficie');
  const salida=document.getElementById('paint-resultado');
  if(!tipoEl||!manosEl||!superficieEl||!salida)return{m2:0,litrosExactos:0,litrosRecomendados:0,envases:'Sin sugerencia'};
  const pintura=TIPOS_PINTURA[tipoEl.value]||TIPOS_PINTURA.latexInteriorSatinada;
  const manos=parseFloat(manosEl.value)||1;
  const superficie=superficieEl.value||'normal';
  const factor=FACTOR_SUPERFICIE[superficie]||1;
  const rendimientoAjustado=pintura.rendimiento*factor;
  const litrosPorMano=rendimientoAjustado>0?m2Base/rendimientoAjustado:0;
  const litrosExactos=litrosPorMano*manos;
  const litrosRecomendados=Math.ceil(litrosExactos);
  const envases=sugerirEnvases(litrosRecomendados);

  // ── Insumos auxiliares ──
  const COB_ROD={normal:55,absorbente:45,rugosa:30};
  const COB_LIJ={normal:25,absorbente:20,rugosa:15};
  const PCT_DIL={latexInteriorSatinada:5,latexMateSeda:5,latexExterior:8,satinadaGeneral:8,esmalteSintetico:12};
  const cobRod=COB_ROD[superficie]||45;
  const cobLij=COB_LIJ[superficie]||25;
  const pctDil=PCT_DIL[tipoEl.value]||8;
  const recambiosRodillo=m2Base>0?Math.ceil(m2Base/cobRod):0;
  const soportesRodillo=litrosRecomendados<=20?1:2;
  const lijas=m2Base>0?Math.ceil(m2Base/cobLij):0;
  const dilucion=litrosExactos*(pctDil/100);
  const bandejas=litrosRecomendados<=20?1:2;
  const pinceles=litrosRecomendados<=20?2:3;

  salida.innerHTML=`
    <div class="paint-step"><strong>Superficie desde medición:</strong> ${fm2(m2Base)}</div>
    <div class="paint-step"><strong>Rendimiento ajustado:</strong> ${rendimientoAjustado.toFixed(2)} m²/L</div>
    <div class="paint-step"><strong>Litros por mano:</strong> ${litrosPorMano.toFixed(2)} L</div>
    <div class="paint-step"><strong>Manos:</strong> ${manos}</div>
    <div class="paint-total"><span>Litros exactos</span><span class="pv">${litrosExactos.toFixed(2)} L</span></div>
    <div class="paint-total"><span>Compra sugerida</span><span class="pv">${litrosRecomendados} L</span></div>
    <div class="paint-total"><span>Envases</span><span class="pv" style="font-size:12px">${envases}</span></div>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:10px;font-family:'Manrope',sans-serif">Insumos auxiliares</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="sup-chip"><span class="sl">Recambios rodillo</span><span class="sv">${recambiosRodillo}</span></div>
        <div class="sup-chip"><span class="sl">Soportes rodillo</span><span class="sv">${soportesRodillo}</span></div>
        <div class="sup-chip"><span class="sl">Lijas</span><span class="sv">${lijas} un</span></div>
        <div class="sup-chip"><span class="sl">Dilución</span><span class="sv">${dilucion.toFixed(1)} L</span></div>
        <div class="sup-chip"><span class="sl">Bandejas</span><span class="sv">${bandejas}</span></div>
        <div class="sup-chip"><span class="sl">Pinceles</span><span class="sv">${pinceles}</span></div>
      </div>
    </div>`;
  return{m2:m2Base,litrosExactos,litrosRecomendados,envases,manos,superficie,pintura:pintura.nombre,rendimientoAjustado};
}

// ── COSTOS EXTRA ──
function addCosto(tipo,nombre='',monto=0){
  const arr=tipo==='dir'?costosDir:costosInd;arr.push({id:nid(),nombre,monto});renderCostos(tipo);
}
function removeCosto(tipo,id){
  if(tipo==='dir')costosDir=costosDir.filter(c=>c.id!==id);
  else costosInd=costosInd.filter(c=>c.id!==id);
  renderCostos(tipo);calc();
}
function costoChange(tipo,id,key,val){
  const arr=tipo==='dir'?costosDir:costosInd;
  const c=arr.find(c=>c.id===id);if(!c)return;
  c[key]=key==='monto'?(parseFloat(val)||0):val;calc();
}
function renderCostos(tipo){
  const arr=tipo==='dir'?costosDir:costosInd;
  const c=document.getElementById(`costos-${tipo}-container`);if(!c)return;c.innerHTML='';
  const adminModeEl=document.getElementById('cfg-admin-mode');
  const adminAutoGlobal=!!(adminModeEl&&adminModeEl.value!=='manual');
  arr.forEach(item=>{
    const row=document.createElement('div');row.className='costo-row';
    const isSeguro=item.id===cfgCostosMap['cfg-seg'];
    const isAdmin=item.id===cfgCostosMap['cfg-adm'];
    const autoLock=isSeguro||(isAdmin&&adminAutoGlobal);
    row.innerHTML=`
      <input type="text" value="${item.nombre}" placeholder="Descripción" oninput="costoChange('${tipo}',${item.id},'nombre',this.value)" ${autoLock?'readonly tabindex="-1"':''}>
      <input type="text" inputmode="numeric" id="costo-monto-${item.id}" value="${fmNum(item.monto)}" placeholder="$ Monto" oninput="costoChange('${tipo}',${item.id},'monto',formatInputMoneda(this))" ${autoLock?`readonly tabindex="-1" style="color:var(--accent);font-weight:700"`:''}>
      <button class="btn-rm" onclick="removeCosto('${tipo}',${item.id})" ${isSeguro?'style="visibility:hidden"':''}>×</button>`;
    c.appendChild(row);
  });
}

// ── MARGEN / IVA ──
function updateMargen(){
  const el=document.getElementById('margen-slider');if(!el)return;
  const v=parseInt(el.value)||0;
  S.margen=v/100;
  const disp=document.getElementById('margen-disp');if(disp)disp.textContent=v+'%';
  calc();
}
function setIva(v){
  S.conIva=v;
  document.getElementById('iva-si').classList.toggle('on',v);
  document.getElementById('iva-no').classList.toggle('on',!v);
  const bir=document.getElementById('bloque-iva-result');if(bir)bir.style.display=v?'':'none';
  calc();
}

// ── CONFIG ──
function renderCfgJornales(){
  const c=document.getElementById('cfg-jornales');c.innerHTML='';
  ROLES.forEach((r,i)=>{
    const row=document.createElement('div');row.className='cfg-row';
    row.innerHTML=`<div><div class="cfg-label">${r.label}</div><div class="cfg-sub">$/hora</div></div>
      <input type="text" inputmode="numeric" id="cfg-role-hora-${r.id}" value="${fmNum(r.hora)}" oninput="cfgRoleChange(${i},formatInputMoneda(this))">`;
    c.appendChild(row);
  });
}

async function cargarUOCRA(){
  const btn=document.getElementById('cfg-uocra-btn');
  const info=document.getElementById('cfg-uocra-info');
  if(btn)btn.disabled=true;
  if(info)info.textContent='Cargando…';
  try{
    const res=await fetch('/data/uocra-salta.json?_='+Date.now());
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    (data.roles||[]).forEach(r=>{
      const roleIdx=ROLES.findIndex(x=>x.id===r.id);
      if(roleIdx<0)return;
      ROLES[roleIdx].hora=r.hora;
      const inp=document.getElementById('cfg-role-hora-'+r.id);
      if(inp)inp.value=fmNum(r.hora);
      const ce=document.getElementById('role-calc-'+roleIdx);
      if(ce)ce.textContent=`Valor/hora: ${fmtm(r.hora)} · Jornada: ${fmtm(r.hora*8)}`;
    });
    const vig=data.vigencia||'—';
    const fte=data.fuente==='manual'?'valores manuales de respaldo':'CAMARCO';
    if(info)info.textContent=`✓ Vigencia ${vig} · Fuente: ${fte}`;
    calc();
  }catch(e){
    if(info)info.textContent='Error: '+e.message+' — ejecutá scripts/scrape_uocra.py primero.';
  }finally{
    if(btn)btn.disabled=false;
  }
}
function cfgRoleChange(i,val){
  ROLES[i].hora=parseFloat(val)||0;
  const ce=document.getElementById(`role-calc-${i}`);if(ce)ce.textContent=`Valor/hora: ${fmtm(ROLES[i].hora)} · Jornada: ${fmtm(ROLES[i].hora*8)}`;
  calc();
}
function setAdminMode(mode){
  const sel=document.getElementById('cfg-admin-mode');
  if(sel)sel.value=(mode==='no'?'manual':mode);
  ['no','5','10'].forEach(m=>{
    const btn=document.getElementById('cfg-adm-'+m);
    if(btn)btn.classList.toggle('on',m===mode);
  });
  syncConfig();
}
function syncConfig(){
  const seguro=fv('cfg-seguro'),amort=fv('cfg-amort'),rend=fv('cfg-rendimiento');
  const adminModeEl=document.getElementById('cfg-admin-mode');
  const adminMode=adminModeEl?adminModeEl.value:'manual';
  const rendEl=document.getElementById('rendimiento');if(rendEl)rendEl.value=rend;
  _syncCfgCosto('ind','cfg-seg','Seguro / ART / otros',seguro);
  _syncCfgCosto('ind','cfg-adm',adminMode==='manual'?'Sin administración':'Administración ('+adminMode+'%)',0);
  _syncCfgCosto('ind','cfg-amr','Amortización herramientas',amort);
  renderCostos('dir');renderCostos('ind');calc();
}
const cfgCostosMap={};
function _syncCfgCosto(tipo,cfgKey,nombre,monto){
  const arr=tipo==='dir'?costosDir:costosInd;
  if(cfgCostosMap[cfgKey]){const c=arr.find(c=>c.id===cfgCostosMap[cfgKey]);if(c){c.nombre=nombre;c.monto=monto;return;}}
  const id=nid();cfgCostosMap[cfgKey]=id;arr.push({id,nombre,monto});
}

// ── CÁLCULO PRINCIPAL ──
function calc(){
  let supMuroBruto=0,supCielo=0,paredesCount=0;
  if(S.tipoObra==='proyecto'){
    // Suma tipos × cantidad × factor altura.
    // Para el tipo actualmente en edición, usa los globales (ambientes/ambientesEdf)
    // para que el total refleje cambios en tiempo real sin necesidad de "guardar".
    tiposUnidad.forEach(tipo => {
      const isActive = _tipoEditando && _tipoEditando.id === tipo.id;
      const ambs     = isActive ? ambientes    : (tipo.ambientes    || []);
      const ambsEdf  = isActive ? ambientesEdf : (tipo.ambientesEdf || []);
      let m2u = 0;
      ambs.forEach(a    => { m2u += calcAmbTotal(a); });
      ambsEdf.forEach(a => { m2u += calcAmbEdfTotal(a); });
      tipo.m2Calculado = m2u;
      supMuroBruto += m2u * tipo.cantidad;
    });
    renderTiposUnidad();
    if (_tipoEditando) _actualizarBreadcrumb();
  } else if(S.tipoObra==='casa'){
    ambientes.forEach(a=>{
      const isFachada=a.tipo==='Fachadas / muros exteriores';
      const muroNeto=calcAmbMuroNeto(a);const cielo=calcAmbCielo(a);
      supMuroBruto+=muroNeto;supCielo+=cielo;
      if(!isFachada)paredesCount+=a.paredes;
    });
  } else if(S.tipoObra==='edificio'){
    ambientesEdf.forEach(a=>{
      supMuroBruto+=calcAmbEdfMuroNeto(a);
      supCielo+=calcAmbEdfCielo(a);
    });
    // Sectores legacy también suman (para historial importado)
    sectores.forEach(s=>{
      const bruto=calcSectorBruto(s);
      if(s.tipo==='cielo'||s.tipo==='horiz')supCielo+=Math.max(0,bruto);
      else{supMuroBruto+=calcSectorNeto(s);}
    });
  }
  const supMuroNeto=Math.max(0,supMuroBruto);
  const supReal=supMuroNeto+supCielo;
  const supAjustada=supReal; // cobertura de imprevistos eliminada
  const rendBase=fv('rendimiento')||24;
  const rendEfect=rendBase;
  let ops=0,jornadaCuadrilla=0;
  ROLES.forEach(r=>{ops+=r.qty;jornadaCuadrilla+=r.qty*r.hora*8;});
  const avance=rendEfect*ops;
  const jornadas=avance>0?supAjustada/avance:0;
  const moDirecta=jornadaCuadrilla*jornadas;
  const totalMat=S.conMateriales?materiales.reduce((s,m)=>s+m.qty*m.precio,0):0;
  const totalCarp=carpItems.reduce((s,c)=>s+c.cant*c.precio,0);
  const pinturaCalc=calcPintura(supReal);

  // Combustible / Logística — vehículos, días y km son manuales; rendimiento y precio desde Config
  const combRend   = fv('cfg-tanque-rend');
  const combPrecio = fv('cfg-tanque-precio');
  const combKmTotal = (S.combVehCant||0) * (S.combDias||0) * (S.combKmDia||0);
  const combLitros  = combRend>0 ? (combKmTotal/combRend) : 0;
  const combTotal   = combLitros * combPrecio;
  sset('px-km-total', Math.round(combKmTotal).toLocaleString('es-AR')+' km');
  sset('px-litros', combLitros.toFixed(1).replace('.',',')+' L');
  sset('px-comb-total', fmtm(combTotal));

  const idSeguro=cfgCostosMap['cfg-seg'];
  if(idSeguro){const seguroInd=costosInd.find(c=>c.id===idSeguro);if(seguroInd){const unitario=fv('cfg-seguro');seguroInd.monto=unitario*ops*jornadas;const el=document.getElementById('costo-monto-'+idSeguro);if(el)el.value=fmNum(seguroInd.monto);}}

  const idAdmin=cfgCostosMap['cfg-adm'];
  const adminModeEl=document.getElementById('cfg-admin-mode');
  const adminPct=adminModeEl&&adminModeEl.value!=='manual'?(parseFloat(adminModeEl.value)||0)/100:0;
  if(idAdmin){
    const adminInd=costosInd.find(c=>c.id===idAdmin);
    if(adminInd){
      if(adminPct>0){const baseAdmin=moDirecta+totalMat+totalCarp+combTotal+costosDir.reduce((s,c)=>s+c.monto,0)+costosInd.filter(c=>c.id!==idAdmin).reduce((s,c)=>s+c.monto,0);adminInd.monto=baseAdmin*adminPct;}
      else{adminInd.monto=0;}
      const el=document.getElementById('costo-monto-'+idAdmin);if(el)el.value=fmNum(adminInd.monto);
    }
  }

  let sumDir=costosDir.reduce((s,c)=>s+c.monto,0);
  let sumInd=costosInd.reduce((s,c)=>s+c.monto,0);

  // Costos directos
  const subtDirBase=moDirecta+totalMat+totalCarp+combTotal+sumDir;
  // Riesgo sobre costos directos eliminado
  const riesgoPct = 0;
  const riesgoMonto = 0;
  const subtDir = subtDirBase;

  // Gastos generales (costos indirectos) — subtotal
  const cto = subtDir + sumInd;

  // Margen de ganancia sobre venta: precio = costo / (1 − margen)
  const margen = Math.min(0.60, Math.max(0, S.margen||0));
  const precioSiIva = margen < 1 ? cto/(1-margen) : cto;
  const margenMonto = precioSiIva - cto;    // ganancia

  // Impuestos sobre venta (se aplican sobre precioSiIva)
  const iibb = precioSiIva * 0.035;         // Ingresos brutos 3.5%
  const debcred = precioSiIva * 0.03;       // Déb/Créd + Gastos fin. 3%
  const ganancias = precioSiIva * 0.05;     // Impuesto a las ganancias 5%
  const iva = precioSiIva * 0.21;           // IVA 21% (opcional)

  const totalImpuestos = iibb + debcred + ganancias + (S.conIva ? iva : 0);
  const precioFinal = precioSiIva + totalImpuestos;

  const m2=supReal>0?precioFinal/supReal:0;
  const costoM2=supReal>0?cto/supReal:0;
  const m2SinIva=supReal>0?precioSiIva/supReal:0;
  // Punto de equilibrio: precio (sin impuestos) que sólo cubre costos (margen 0%)
  const equilibrio = cto;
  const equilibrioM2 = supReal>0 ? cto/supReal : 0;

  // DOM updates
  sset('r-sup-muro-neto',fm2(supMuroNeto));sset('r-sup-cielo',fm2(supCielo));
  sset('r-sup-paredes',paredesCount);sset('r-sup-total-med',fm2(supReal));
  sset('d-sup',fm2(supReal));sset('d-ops',ops);sset('d-rend',fm2(rendEfect));
  sset('d-avance',fm2(avance));sset('d-jornadas',jornadas.toFixed(2));
  sset('sp-ops',ops);sset('sp-avance',fm2(avance));sset('sp-jornadas',jornadas.toFixed(2));
  // ── Desglose visible (pantalla Precio) ──
  sset('dp-mo',fmtm(moDirecta));
  const rowCarp=document.getElementById('dp-row-carp');if(rowCarp)rowCarp.style.display=totalCarp>0?'':'none';
  sset('dp-carp',fmtm(totalCarp));
  sset('dp-dir',fmtm(sumDir));
  sset('dp-riesgo-pct',Math.round(riesgoPct*100));
  sset('dp-riesgo',fmtm(riesgoMonto));
  sset('dp-subtdir',fmtm(subtDir));
  sset('dp-ind',fmtm(sumInd));
  sset('dp-cto',fmtm(cto));
  sset('dp-margen-pct',Math.round(margen*100));
  sset('dp-margen',fmtm(margenMonto));
  sset('dp-siniva',fmtm(precioSiIva));
  sset('dp-iibb',fmtm(iibb));
  sset('dp-debcred',fmtm(debcred));
  sset('dp-ganancias',fmtm(ganancias));
  const rowIva=document.getElementById('dp-row-iva');if(rowIva)rowIva.style.display=S.conIva?'':'none';
  sset('dp-iva',fmtm(iva));
  sset('dp-totalimp',fmtm(totalImpuestos));
  sset('dp-total',fmtm(precioFinal));
  sset('dp-m2',(supReal>0?fmtm(m2):'—')+' /m²');

  // FAB
  const fabPrice=document.getElementById('fab-price');
  if(fabPrice)fabPrice.textContent=precioFinal>0?fmtm(precioFinal):'Calcular';

  // ── Punto de equilibrio ──
  sset('eq-costo',fmtm(equilibrio));
  sset('eq-costo-m2',supReal>0?fmtm(equilibrioM2)+' /m²':'—');
  sset('eq-margen-pct',Math.round(margen*100)+'%');
  sset('eq-ganancia',fmtm(margenMonto));
  const eqFrase=document.getElementById('eq-frase');
  if(eqFrase){
    eqFrase.innerHTML = margen>0
      ? `Cubrís todos los costos con <strong>${fmtm(equilibrio)}</strong>. Tu margen del <strong>${Math.round(margen*100)}%</strong> suma <strong>${fmtm(margenMonto)}</strong> de ganancia. Por debajo del equilibrio trabajás a pérdida.`
      : `Sin margen: tu precio iguala el costo (<strong>${fmtm(equilibrio)}</strong>). No hay ganancia.`;
  }

  window._lastCalc={supReal,supAjustada,ops,jornadas,jornadaCuadrilla,rendEfect,avance,moDirecta,totalMat,totalCarp,sumDir,subtDir,sumInd,cto,margen,margenMonto,precioSiIva,riesgoPct,riesgoMonto,iibb,debcred,ganancias,iva,totalImpuestos,precioFinal,m2,m2SinIva,costoM2,equilibrio,equilibrioM2,pinturaCalc};
}

// ── MODAL COTIZACIÓN ──
function openModal(){
  const d=window._lastCalc||{};
  syncCliente();
  const mb=document.getElementById('modal-body');

  // Detalle de medición
  let medHTML='';
  const _carpDesc=describeCarpItems(carpItems);
  const _carpOrder=['Puertas','Ventanas','Zócalos','Barandas'];
  const adicionalesHTML=_carpOrder
    .filter(g=>_carpDesc[g]&&_carpDesc[g].length)
    .map(g=>`
      <div class="res-row hi"><span class="rl">${g}</span><span class="rv"></span></div>
      ${_carpDesc[g].map(it=>`<div class="res-row"><span class="rl" style="padding-left:14px">· ${it.line}</span><span class="rv"></span></div>`).join('')}
    `).join('');
  if(S.tipoObra==='casa'&&ambientes.length>0){
    medHTML=ambientes.map(a=>{
      const mn=calcAmbMuroNeto(a).toFixed(2).replace('.',',');
      const ci=calcAmbCielo(a).toFixed(2).replace('.',',');
      const isFachada=a.tipo==='Fachadas / muros exteriores';
      const detalle=isFachada
        ?`${(a.panos||[]).length} paño${(a.panos||[]).length!==1?'s':''}`
        :`${a.paredes} pared${a.paredes!==1?'es':''}`;
      return`<div class="res-row"><span class="rl">${a.tipo||'Ambiente'}</span><span class="rv">${mn} m² muro · ${ci} m² cielo · ${detalle}</span></div>`;
    }).join('');
  } else if(S.tipoObra==='edificio'&&ambientesEdf.length>0){
    medHTML=ambientesEdf.map(a=>{
      const mn=calcAmbEdfMuroNeto(a).toFixed(2).replace('.',',');
      const ci=calcAmbEdfCielo(a).toFixed(2).replace('.',',');
      const isFachadaEdf=a.tipo==='Fachada';
      const detalle=isFachadaEdf
        ?`${(a.panos||[]).length} paño${(a.panos||[]).length!==1?'s':''}`
        :'';
      return`<div class="res-row"><span class="rl">${a.tipo||'Espacio'}</span><span class="rv">${mn} m² muro · ${ci} m² cielo${detalle?' · '+detalle:''}</span></div>`;
    }).join('');
  }

  // Datos del cliente (si existen)
  const cliHTML=(CLI.nombre||CLI.direccion||CLI.telefono)?`
    <div class="res-section">Cliente</div>
    ${CLI.nombre?`<div class="res-row"><span class="rl">Nombre</span><span class="rv">${CLI.nombre}</span></div>`:''}
    ${CLI.nro?`<div class="res-row"><span class="rl">N° Presupuesto</span><span class="rv">${CLI.nro}</span></div>`:''}
    ${CLI.direccion?`<div class="res-row"><span class="rl">Dirección</span><span class="rv">${CLI.direccion}</span></div>`:''}
    ${CLI.telefono?`<div class="res-row"><span class="rl">Teléfono</span><span class="rv">${CLI.telefono}</span></div>`:''}
    ${CLI.obs?`<div class="res-row"><span class="rl">Observaciones</span><span class="rv">${CLI.obs}</span></div>`:''}
  `:'';

  mb.innerHTML=`
    ${cliHTML}
    <div class="res-section">Alcance de la obra</div>
    ${medHTML}
    <div class="res-row hi"><span class="rl">Superficie total</span><span class="rv">${(d.supReal||0).toFixed(2).replace('.',',')} m²</span></div>
    <div class="res-row"><span class="rl">Muros netos</span><span class="rv">${(ambientes.reduce((s,a)=>s+calcAmbMuroNeto(a),0)||ambientesEdf.reduce((s,a)=>s+calcAmbEdfMuroNeto(a),0)||0).toFixed(2).replace('.',',')} m²</span></div>
    <div class="res-row"><span class="rl">Cielorrasos</span><span class="rv">${(ambientes.reduce((s,a)=>s+calcAmbCielo(a),0)||ambientesEdf.reduce((s,a)=>s+calcAmbEdfCielo(a),0)||0).toFixed(2).replace('.',',')} m²</span></div>
    ${adicionalesHTML?`<div class="res-section">Adicionales</div>${adicionalesHTML}`:''}
    <div class="res-row"><span class="rl">Días estimados</span><span class="rv">${Math.ceil(d.jornadas||0)} días</span></div>
    <div class="res-section">Costos</div>
    <div class="res-row"><span class="rl">Mano de obra</span><span class="rv">${fmtm(d.moDirecta||0)}</span></div>
    ${(d.totalCarp||0)>0?`<div class="res-row"><span class="rl">Adicionales (carpintería)</span><span class="rv">${fmtm(d.totalCarp||0)}</span></div>`:''}
    <div class="res-row"><span class="rl">Directos adicionales</span><span class="rv">${fmtm(d.sumDir||0)}</span></div>
    <div class="res-row hi"><span class="rl">Subtotal directos</span><span class="rv">${fmtm(d.subtDir||0)}</span></div>
    <div class="res-row"><span class="rl">Costos indirectos</span><span class="rv">${fmtm(d.sumInd||0)}</span></div>
    <div class="res-row hi"><span class="rl">Costo total</span><span class="rv">${fmtm(d.cto||0)}</span></div>
    <div class="res-section">Margen y precio</div>
    <div class="res-row"><span class="rl">Ganancia (${Math.round((d.margen||0)*100)}%)</span><span class="rv">${fmtm(d.margenMonto||0)}</span></div>
    <div class="res-row hi"><span class="rl">Precio de venta (sin impuestos)</span><span class="rv">${fmtm(d.precioSiIva||0)}</span></div>
    <div class="res-section">Impuestos sobre Venta</div>
    <div class="res-row"><span class="rl">Ingresos Brutos (3,5%)</span><span class="rv">${fmtm(d.iibb||0)}</span></div>
    <div class="res-row"><span class="rl">Déb/Créd + Gastos Fin. (3%)</span><span class="rv">${fmtm(d.debcred||0)}</span></div>
    <div class="res-row"><span class="rl">Impuesto a las ganancias (5%)</span><span class="rv">${fmtm(d.ganancias||0)}</span></div>
    ${S.conIva?`<div class="res-row"><span class="rl">IVA 21%</span><span class="rv">${fmtm(d.iva||0)}</span></div>`:''}
    <div class="res-row hi"><span class="rl">Total impuestos</span><span class="rv">${fmtm(d.totalImpuestos||0)}</span></div>
    <div class="res-total">
      <span class="rl">TOTAL</span>
      <span class="rv">${fmtm(d.precioFinal||0)}</span>
    </div>
    <div class="res-section">Punto de equilibrio</div>
    <div class="res-row"><span class="rl">Cubre costos</span><span class="rv">${fmtm(d.cto||0)}</span></div>
    <div class="res-row"><span class="rl">Ganancia (margen ${Math.round((d.margen||0)*100)}%)</span><span class="rv" style="color:var(--positive)">+${fmtm(d.margenMonto||0)}</span></div>`;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(){document.getElementById('modal-overlay').classList.remove('open');}
function closeModalOut(e){if(e.target===document.getElementById('modal-overlay'))closeModal();}

// ── HELPERS ──
function fv(id){
  const el=document.getElementById(id);if(!el)return 0;
  if(el.type==='text')return parseFloat(el.value.replace(/\./g,''))||0;
  return parseFloat(el.value)||0;
}
function sset(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function fm2(n){const v=(n||0).toFixed(2);const parts=v.split('.');parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.');return parts.join(',')+' m²';}
function fmtm(n){return '$'+Math.round(n||0).toLocaleString('es-AR');}
function fmNum(n){return(n||0)===0?'0':Math.round(n).toLocaleString('es-AR');}
function formatInputMoneda(el){
  let raw=el.value.replace(/\D/g,'');
  if(raw)el.value=parseInt(raw,10).toLocaleString('es-AR');else el.value='';
  return raw;
}

// ── HISTORIAL ──
const HIST_KEY='antigravity_historial';
function histGetAll(){try{return JSON.parse(localStorage.getItem(HIST_KEY))||[];}catch(e){return[];}}
function histSetAll(arr){localStorage.setItem(HIST_KEY,JSON.stringify(arr));}

function histCapturarEstado(){
  const cfgGet=id=>{const el=document.getElementById(id);return el?el.value:'';};
  syncCliente();
  return{
    S:JSON.parse(JSON.stringify(S)),ROLES:JSON.parse(JSON.stringify(ROLES)),
    ambientes:JSON.parse(JSON.stringify(ambientes)),sectores:JSON.parse(JSON.stringify(sectores)),
    ambientesEdf:JSON.parse(JSON.stringify(ambientesEdf)),
    materiales:JSON.parse(JSON.stringify(materiales)),costosDir:JSON.parse(JSON.stringify(costosDir)),
    costosInd:JSON.parse(JSON.stringify(costosInd)),carpItems:JSON.parse(JSON.stringify(carpItems)),
    uid,_rendimiento:fv('rendimiento'),
    _cobertura:document.getElementById('cobertura-slider')?document.getElementById('cobertura-slider').value:10,
    _margen: S.margen!==undefined?S.margen:0.30,
    _conIva:S.conIva,
    _cfgSeguro:cfgGet('cfg-seguro'),_cfgAdmin:cfgGet('cfg-admin'),
    _cfgAdminMode:document.getElementById('cfg-admin-mode')?document.getElementById('cfg-admin-mode').value:'manual',
    _cfgAmort:cfgGet('cfg-amort'),_cfgRendimiento:cfgGet('cfg-rendimiento'),
    _lastCalc:window._lastCalc||{},
    // ── Cliente ──
    _cliNombre:    CLI.nombre    || '',
    _cliDireccion: CLI.direccion || '',
    _cliTelefono:  CLI.telefono  || '',
    _cliNro:       CLI.nro       || '',
    _cliObs:       CLI.obs       || '',
    // ── Jornales ──
    J_OBRA: JSON.parse(JSON.stringify(J_OBRA)),
    J_CFG:  JSON.parse(JSON.stringify(J_CFG)),
    jDias:  JSON.parse(JSON.stringify(jDias)),
    _jLastCalc: window._jLastCalc||{},
    // ── Presupuesto Jornales ──
    _pjState: (typeof PJ !== 'undefined') ? JSON.parse(JSON.stringify(PJ)) : null,
    _pjLastCalc: window._pjLastCalc||{},
    // ── Proyecto multi-tipo ──
    tiposUnidad: JSON.parse(JSON.stringify(tiposUnidad)),
    // ── Config nuevos campos ──
    _cfgAlmuerzo:    cfgGet('cfg-almuerzo'),
    _cfgTanqueL:     cfgGet('cfg-tanque-l'),
    _cfgTanqueRend:  cfgGet('cfg-tanque-rend'),
    _cfgTanquePrecio:cfgGet('cfg-tanque-precio'),
  };
}

function histRestaurarEstado(estado){
  if(!estado)return;
  Object.assign(S,estado.S);
  if(estado.ROLES)estado.ROLES.forEach((r,i)=>{if(ROLES[i])Object.assign(ROLES[i],r);});
  ambientes=JSON.parse(JSON.stringify(estado.ambientes||[]));
  sectores=JSON.parse(JSON.stringify(estado.sectores||[]));
  ambientesEdf=JSON.parse(JSON.stringify(estado.ambientesEdf||[]));
  materiales=JSON.parse(JSON.stringify(estado.materiales||[]));
  costosDir=JSON.parse(JSON.stringify(estado.costosDir||[]));
  costosInd=JSON.parse(JSON.stringify(estado.costosInd||[]));
  carpItems=JSON.parse(JSON.stringify(estado.carpItems||[]));
  ambientes=ambientes.map(a=>({...a,vanos:normalizeVanos(a.vanos)}));
  sectores=sectores.map(s=>({...s,vanos:normalizeVanos(s.vanos)}));
  uid=estado.uid||uid;
  renderCuadrilla();renderAmbientesSelector();renderAmbientes();renderSectores();renderAmbientesEdf();
  renderCarpinteria();renderCostos('dir');renderCostos('ind');renderCfgJornales();
  if(S.tipoObra)selectObra(S.tipoObra, false);
  const rendEl=document.getElementById('rendimiento');if(rendEl&&estado._rendimiento)rendEl.value=estado._rendimiento;
  const cobEl=document.getElementById('cobertura-slider');
  if(cobEl&&estado._cobertura!==undefined){cobEl.value=estado._cobertura;S.cobertura=parseInt(estado._cobertura)/100;const cobDisp=document.getElementById('cobertura-disp');if(cobDisp)cobDisp.textContent=estado._cobertura+'%';}
  const mVal = estado._margen!==undefined ? estado._margen : 0.30;
  S.margen = mVal;
  const margenEl=document.getElementById('margen-slider');
  if(margenEl){
    margenEl.value=Math.round(mVal*100);
    const md=document.getElementById('margen-disp');if(md)md.textContent=Math.round(mVal*100)+'%';
  }
  setIva(!!estado._conIva);
  const cfgSet=(id,val)=>{const el=document.getElementById(id);if(el&&val!==undefined)el.value=val;};
  cfgSet('cfg-seguro',estado._cfgSeguro);cfgSet('cfg-admin',estado._cfgAdmin);
  const adminModeEl=document.getElementById('cfg-admin-mode');if(adminModeEl&&estado._cfgAdminMode!==undefined)adminModeEl.value=estado._cfgAdminMode;
  cfgSet('cfg-amort',estado._cfgAmort);cfgSet('cfg-rendimiento',estado._cfgRendimiento);
  cfgSet('cfg-almuerzo',     estado._cfgAlmuerzo);
  cfgSet('cfg-tanque-l',     estado._cfgTanqueL);
  cfgSet('cfg-tanque-rend',  estado._cfgTanqueRend);
  cfgSet('cfg-tanque-precio',estado._cfgTanquePrecio);
  const vcEl=document.getElementById('px-veh-cant');if(vcEl)vcEl.value=S.combVehCant||0;
  const cdEl=document.getElementById('px-dias');if(cdEl)cdEl.value=S.combDias||0;
  const kdEl=document.getElementById('px-km-dia');if(kdEl)kdEl.value=S.combKmDia||0;
  setMateriales(S.conMateriales);syncConfig();calc();

  // ── Restaurar Cliente ──
  CLI.nombre    = estado._cliNombre    || '';
  CLI.direccion = estado._cliDireccion || '';
  CLI.telefono  = estado._cliTelefono  || '';
  CLI.nro       = estado._cliNro       || '';
  CLI.obs       = estado._cliObs       || '';
  const setCli=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val||'';};
  setCli('cli-nombre',   CLI.nombre);
  setCli('cli-direccion',CLI.direccion);
  setCli('cli-telefono', CLI.telefono);
  setCli('cli-nro',      CLI.nro);
  setCli('cli-obs',      CLI.obs);

  // ── Restaurar Jornales ──
  if(estado.J_OBRA) J_OBRA = JSON.parse(JSON.stringify(estado.J_OBRA));
  else J_OBRA = {nombre:'',cliente:'',obs:'',cerrada:false};
  if(estado.J_CFG)  J_CFG  = JSON.parse(JSON.stringify(estado.J_CFG));
  else J_CFG = {jornada:8,art:0};
  jDias = estado.jDias ? JSON.parse(JSON.stringify(estado.jDias)) : [];
  // refrescar inputs del módulo jornales
  const setJ=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val||'';};
  setJ('j-obra-nombre',  J_OBRA.nombre);
  setJ('j-obra-cliente', J_OBRA.cliente);
  setJ('j-obra-obs',     J_OBRA.obs);
  setJ('j-cfg-jornada',  J_CFG.jornada);
  setJ('j-cfg-art',      J_CFG.art);
  // jRender accede a elementos del módulo liquidación (eliminado); solo llamar si están presentes
  if(document.getElementById('j-ci-dias')) jRender();

  // ── Restaurar Presupuesto de Jornales ──
  if(estado._pjState){
    Object.assign(PJ, JSON.parse(JSON.stringify(estado._pjState)));
    const setEl = (id, val)=>{const el=document.getElementById(id);if(el) el.value = val;};
    setEl('pj-nombre',  PJ.obra.nombre);
    setEl('pj-cliente', PJ.obra.cliente);
    setEl('pj-nro',     PJ.obra.nro);
    setEl('pj-tel',     PJ.obra.tel);
    setEl('pj-dir',     PJ.obra.dir);
    setEl('pj-dias',    PJ.dias);
    setEl('pj-horas',   PJ.horas);
    setEl('pj-veh-cant',PJ.vehCant);
    setEl('pj-km-dia',  PJ.kmDia);
    setEl('pj-tanque-l',PJ.tanqueL);
    setEl('pj-tanque-rend', PJ.tanqueRend);
    const tp = document.getElementById('pj-tanque-precio'); if(tp) tp.value = (PJ.tanquePrecio||0).toLocaleString('es-AR');
    const mat = document.getElementById('pj-materiales'); if(mat) mat.value = (PJ.materiales||0).toLocaleString('es-AR');
    const tras = document.getElementById('pj-traslado'); if(tras) tras.value = (PJ.traslado||0).toLocaleString('es-AR');
    const guPct = Math.round((PJ.guPct||0.10)*100);
    const guSl = document.getElementById('pj-gu-slider'); if(guSl) guSl.value = guPct;
    const guD = document.getElementById('pj-gu-disp'); if(guD) guD.textContent = guPct+'%';
    const mPct = Math.round((PJ.margenPct||0.30)*100);
    const mSl = document.getElementById('pj-margen-slider'); if(mSl) mSl.value = mPct;
    const mD = document.getElementById('pj-margen-disp'); if(mD) mD.textContent = mPct+'%';
    setEl('pj-imp-debcred', PJ.impDebcred);
    setEl('pj-imp-iibb',    PJ.impIibb);
    setEl('pj-imp-gan',     PJ.impGan);
    pjSetIva(!!PJ.conIva);
    ['es','of','mo','ay'].forEach(rid=>{
      const inp=document.getElementById('pj-cant-'+rid); if(inp) inp.value = PJ.cantidades[rid]||0;
    });
    if(typeof pjCalc==='function') pjCalc();
  }

  // ── Restaurar proyecto multi-tipo ──
  tiposUnidad = JSON.parse(JSON.stringify(estado.tiposUnidad || []));
  // Migrar saves antiguos que usaban alturaZona en lugar de alturaMetros
  tiposUnidad = tiposUnidad.map(t => {
    if (t.alturaMetros === undefined) {
      t.alturaMetros = t.alturaZona === 'alta' ? 7.00 : t.alturaZona === 'media' ? 4.50 : 2.70;
    }
    return t;
  });
  _tipoEditando = null;

  // ── Navegación al módulo correcto según el tipo de presupuesto guardado ──
  const tipoGuardado = (estado.S && estado.S.tipoObra) || null;
  if(tipoGuardado==='proyecto'){
    entrarModoProyecto();
  } else if(tipoGuardado==='casa' || tipoGuardado==='edificio'){
    if(typeof entrarModulo==='function') entrarModulo('pintura');
  } else if(estado._pjState){
    if(typeof entrarSubmodulo==='function') entrarSubmodulo('jornales-ppto');
  }
}

function histGuardar(){
  const inp=document.getElementById('hist-nombre');
  const esJornales = S.tipoObra === 'jornales';
  const nombreDefault = esJornales
    ? (J_OBRA.nombre || 'Obra jornales '+new Date().toLocaleDateString('es-AR'))
    : ('Presupuesto '+new Date().toLocaleDateString('es-AR'));
  const nombre=(inp?inp.value.trim():'') || nombreDefault;
  const fecha=new Date().toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const estado=histCapturarEstado();
  const c = esJornales ? (window._jLastCalc||{}) : (window._lastCalc||{});
  const total = esJornales ? (c.total||0) : (c.precioFinal||0);
  const supReal = esJornales ? 0 : (c.supReal||0);
  const item={id:Date.now(),nombre,fecha,total,supReal,tipoObra:S.tipoObra||'—',estado};
  const lista=histGetAll();lista.unshift(item);histSetAll(lista);
  if(inp)inp.value='';renderHistLista();
}

function histEliminar(id){
  const lista=histGetAll();const item=lista.find(i=>i.id===id);if(!item)return;
  if(!confirm(`¿Eliminar "${item.nombre}"?\nEsta acción no se puede deshacer.`))return;
  histSetAll(lista.filter(i=>i.id!==id));
  renderHistLista();
}

function histExportar(id){
  const lista=histGetAll();const item=lista.find(i=>i.id===id);if(!item)return;
  const blob=new Blob([JSON.stringify(item,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  const nombreLimpio=item.nombre.replace(/[^a-z0-9áéíóúñ\s]/gi,'').trim().replace(/\s+/g,'-')||'presupuesto';
  a.download=nombreLimpio+'.json';a.click();URL.revokeObjectURL(a.href);
}

function histImportar(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const item=JSON.parse(e.target.result);
      if(!item||!item.estado){alert('Archivo inválido o incompleto.');return;}
      if(!item.id)item.id=Date.now();if(!item.fecha)item.fecha=new Date().toLocaleString('es-AR');
      const lista=histGetAll();const existe=lista.findIndex(i=>i.id===item.id);
      if(existe>=0)lista[existe]=item;else lista.unshift(item);
      histSetAll(lista);renderHistLista();alert(`"${item.nombre}" importado correctamente.`);
    }catch(err){alert('Error al leer el archivo JSON.');}
  };
  reader.readAsText(file);event.target.value='';
}

function renderHistLista(){
  const c=document.getElementById('hist-lista');if(!c)return;
  const lista=histGetAll();
  if(lista.length===0){c.innerHTML='<div class="hist-empty">Todavía no hay presupuestos guardados.<br>Completá una operación y presioná <strong>Guardar actual</strong>.</div>';return;}
  c.innerHTML=lista.map(item=>{
    const total=item.total?fmtm(item.total):'—';
    const esJornales = item.tipoObra==='jornales';
    const esPJ = item.tipoObra==='jornales-ppto';
    const sup = esJornales
      ? ((item.estado&&item.estado._jLastCalc&&item.estado._jLastCalc.horasHombre)?(item.estado._jLastCalc.horasHombre).toFixed(2).replace('.',',')+' hh':'—')
      : esPJ
        ? ((item.estado&&item.estado._pjLastCalc&&item.estado._pjLastCalc.dias)?(item.estado._pjLastCalc.dias)+' días':'—')
        : (item.supReal?(item.supReal).toFixed(2).replace('.',',')+' m²':'—');
    const tipo = item.tipoObra==='casa' ? 'Casa'
               : item.tipoObra==='edificio' ? 'Edificio'
               : esJornales ? 'Liquidación'
               : esPJ ? 'Ppto. Jornales'
               : '—';
    const ver = item.version ? ` v${item.version}` : '';
    return`<div class="hist-item">
      <div class="hist-item-top">
        <div class="hist-item-name" onclick="histAbrir(${item.id})" style="cursor:pointer" title="Abrir para seguir trabajando">${item.nombre}${ver}</div>
        <div class="hist-item-actions">
          <button class="btn-hist-edit"  onclick="histAbrir(${item.id})">Abrir</button>
          <button class="btn-hist-print" onclick="openPdfFromHist(${item.id})">PDF</button>
          <button class="btn-hist-wa"    onclick="enviarWhatsApp(${item.id})">WA</button>
          <button class="btn-hist-exp"   onclick="histExportar(${item.id})">JSON</button>
          <button class="btn-hist-del"   onclick="histEliminar(${item.id})">Eliminar</button>
        </div>
      </div>
      <div class="hist-item-meta">
        <span>${item.fecha}</span>
        <span>${tipo}</span>
        <span>${sup}</span>
        <span style="color:var(--accent);font-weight:700">${total}</span>
      </div>
    </div>`;
  }).join('');
}

function openHist(){renderHistLista();document.getElementById('hist-overlay').classList.add('open');}

// Abrir un presupuesto guardado: lo carga en la app y entra al módulo para seguir trabajando.
function histAbrir(id){
  const lista=histGetAll();
  const item=lista.find(i=>i.id===id);
  if(!item){return;}
  if(!item.estado){alert('Este presupuesto no tiene datos para cargar.');return;}
  closeHist();
  if(item.tipoObra==='jornales-ppto'){
    entrarSubmodulo('jornales-ppto');
    histRestaurarEstado(item.estado);
    if(typeof pjCalc==='function') pjCalc();
  } else {
    entrarModulo('pintura');
    histRestaurarEstado(item.estado);
  }
}

// ── PANTALLA DE INICIO (saludo dinámico + tarjetas de info) ──
function renderHome(){ renderHomeGreeting(); renderHomeInsights(); renderHomeRecent(); }

function renderHomeRecent(){
  const list=document.getElementById('home-recent-list'); if(!list) return;
  const lista=(typeof histGetAll==='function')?histGetAll():[];
  if(lista.length===0){
    list.innerHTML='<div class="recent-empty">Todavía no guardaste presupuestos.<br>Cuando guardes uno, va a aparecer acá para reabrirlo al instante.</div>';
    return;
  }
  list.innerHTML=lista.slice(0,4).map(it=>{
    const total=it.total?fmtm(it.total):'—';
    return `<div class="recent-item" onclick="histAbrir(${it.id})">
      <div class="recent-item-main">
        <div class="recent-item-name">${it.nombre||'Presupuesto'}</div>
        <div class="recent-item-date">${it.fecha||''}</div>
      </div>
      <div class="recent-item-total">${total}</div>
    </div>`;
  }).join('');
}

function renderHomeGreeting(){
  const el=document.getElementById('home-greeting'); if(!el) return;
  const h=new Date().getHours();
  let saludo, emoji;
  if(h>=6 && h<13){ saludo='Buen día'; emoji='☀️'; }
  else if(h>=13 && h<20){ saludo='Buenas tardes'; emoji='⛅'; }
  else { saludo='Buenas noches'; emoji='🌙'; }
  el.textContent='¡'+saludo+', Joaquín! '+emoji;
  const sub=document.getElementById('home-greeting-sub');
  if(sub) sub.textContent='¿Qué presupuesto vamos a armar hoy?';
}

let _ultimaCotId=null;
function renderHomeInsights(){
  const lista=(typeof histGetAll==='function')?histGetAll():[];
  // Presupuestos este mes (item.id es un timestamp Date.now())
  const now=new Date(), mes=now.getMonth(), anio=now.getFullYear();
  let count=0;
  lista.forEach(it=>{
    const ts=Number(it.id);
    if(!isNaN(ts)){ const d=new Date(ts); if(d.getMonth()===mes && d.getFullYear()===anio) count++; }
  });
  const mesEl=document.getElementById('insight-mes'); if(mesEl) mesEl.textContent=count;
  // Última cotización (lista[0] = más reciente por unshift)
  const ult=lista[0]||null;
  _ultimaCotId = ult?ult.id:null;
  const nameEl=document.getElementById('insight-last-name');
  const amtEl=document.getElementById('insight-last-amount');
  if(ult){
    if(nameEl) nameEl.textContent=ult.nombre||'Presupuesto';
    if(amtEl) amtEl.textContent=ult.total?fmtm(ult.total):'';
  } else {
    if(nameEl) nameEl.textContent='—';
    if(amtEl) amtEl.textContent='Sin presupuestos aún';
  }
}

function abrirUltimaCotizacion(){ if(_ultimaCotId!=null) histAbrir(_ultimaCotId); }
function closeHist(){document.getElementById('hist-overlay').classList.remove('open');}
function closeHistOut(e){if(e.target===document.getElementById('hist-overlay'))closeHist();}

function setMateriales(v){
  S.conMateriales=v;
  const bloqueMat=document.getElementById('bloque-mat');const rowMat=document.getElementById('row-mat');
  if(bloqueMat)bloqueMat.style.display=v?'':'none';
  if(rowMat)rowMat.style.display=v?'':'none';
  calc();
}

// ════════════════════════════════════════════════════════════════
// ═════════ MÓDULO JORNALES (horas reales trabajadas) ════════════
// ════════════════════════════════════════════════════════════════

let J_OBRA  = { nombre:'', cliente:'', obs:'', cerrada:false };
let J_CFG   = { jornada:8, art:0 };
let jDias   = [];

window._jLastCalc = { total:0 };

function jParseTime(t){
  if(!t || typeof t!=='string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  const hh=+m[1], mm=+m[2];
  if(hh>23||mm>59) return null;
  return hh + mm/60;
}
function jCalcHorasPersona(p){
  const i = jParseTime(p.ing), s = jParseTime(p.sal);
  if(i===null || s===null) return null;
  let h = s - i;
  if(h < 0) h += 24;
  return Math.round(h*100)/100;
}
function jFmt(n){ return '$'+Math.round(n||0).toLocaleString('es-AR'); }
function jFmtN(n,dec=2){ return (n||0).toLocaleString('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec}); }
function jFmtH(h){ return jFmtN(h,2)+' h'; }
function jFechaCorta(iso){
  if(!iso) return '—';
  const [y,m,d] = iso.split('-');
  if(!d) return iso;
  return `${d}/${m}`;
}
function jEsc(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function jRolById(id){ return ROLES.find(r=>r.id===id) || ROLES.find(r=>r.id==='of') || ROLES[0]; }
function jRoleBadgeClass(r){ return r.badge || 'rb-ot'; }

function jOnObraInput(){
  J_OBRA.nombre  = document.getElementById('j-obra-nombre').value.trim();
  J_OBRA.cliente = document.getElementById('j-obra-cliente').value.trim();
  J_OBRA.obs     = document.getElementById('j-obra-obs').value.trim();
  jRecalcular();
}
function jCerrarObra(){
  const c = jCalcularCierre();
  if(c.diasCerrados === 0){
    alert('No hay días cerrados para consolidar.\nCerrá al menos un día antes de cerrar la obra.');
    return;
  }
  J_OBRA.cerrada = true;
  jRecalcular();
}
function jAbrirObra(){ J_OBRA.cerrada = false; jRecalcular(); }
function jResetObra(){
  if(!confirm('¿Vaciar toda la obra de jornales?\nSe perderán los días no guardados.')) return;
  J_OBRA = {nombre:'', cliente:'', obs:'', cerrada:false};
  jDias = [];
  document.getElementById('j-obra-nombre').value='';
  document.getElementById('j-obra-cliente').value='';
  document.getElementById('j-obra-obs').value='';
  jRender();
}

function jAgregarDia(){
  const fechaEl = document.getElementById('j-nuevo-dia-fecha');
  const tareaEl = document.getElementById('j-nuevo-dia-tarea');
  const fecha = fechaEl.value;
  const tarea = tareaEl.value.trim();
  if(!fecha){ alert('Ingresá una fecha para el día.'); fechaEl.focus(); return; }
  const num = jDias.length + 1;
  jDias.push({ id:nid(), num, fecha, tarea, cerrado:false, abierto:true, personas:[] });
  fechaEl.value=''; tareaEl.value='';
  jRender();
}
function jEliminarDia(diaId, ev){
  if(ev) ev.stopPropagation();
  if(!confirm('¿Eliminar este día y todas sus personas?')) return;
  jDias = jDias.filter(d=>d.id!==diaId);
  jDias.forEach((d,i)=>d.num=i+1);
  jRender();
}
function jCerrarDia(diaId, ev){
  if(ev) ev.stopPropagation();
  const d = jDias.find(x=>x.id===diaId);
  if(!d) return;
  if(d.personas.length === 0){ alert('El día no tiene personas cargadas.'); return; }
  const incompletas = d.personas.filter(p => jCalcHorasPersona(p)===null);
  if(incompletas.length > 0){
    if(!confirm(`Hay ${incompletas.length} persona(s) con horario incompleto.\nNo se computarán al cerrar el día.\n¿Cerrar igual?`)) return;
  }
  d.cerrado = true;
  d.abierto = false;
  jRender();
}
function jReabrirDia(diaId, ev){
  if(ev) ev.stopPropagation();
  const d = jDias.find(x=>x.id===diaId);
  if(!d) return;
  d.cerrado = false;
  d.abierto = true;
  jRender();
}
function jToggleDia(diaId){
  const d = jDias.find(x=>x.id===diaId);
  if(!d) return;
  d.abierto = !d.abierto;
  jRender();
}

function jAgregarPersona(diaId, ev){
  if(ev) ev.stopPropagation();
  const d = jDias.find(x=>x.id===diaId);
  if(!d || d.cerrado) return;
  const rolDef = ROLES.find(r=>r.id==='of') || ROLES[0];
  const numP = d.personas.length + 1;
  d.personas.push({
    id: nid(),
    nombre: `${rolDef.label} ${numP}`,
    rolId: rolDef.id,
    ing:'', sal:'',
    vh: rolDef.hora || 0
  });
  jRender();
}
function jEliminarPersona(diaId, persId, ev){
  if(ev) ev.stopPropagation();
  const d = jDias.find(x=>x.id===diaId);
  if(!d || d.cerrado) return;
  d.personas = d.personas.filter(p=>p.id!==persId);
  jRender();
}
function jUpdatePersona(diaId, persId, campo, valor){
  const d = jDias.find(x=>x.id===diaId);
  if(!d) return;
  const p = d.personas.find(x=>x.id===persId);
  if(!p) return;
  if(campo === 'rolId'){
    p.rolId = valor;
    const r = jRolById(valor);
    p.vh = r.hora || 0;
  } else if(campo === 'vh'){
    p.vh = parseFloat(valor) || 0;
  } else {
    p[campo] = valor;
  }
  jUpdatePersonaUI(diaId, persId);
  jRecalcular();
}
function jUpdatePersonaUI(diaId, persId){
  const d = jDias.find(x=>x.id===diaId);
  if(!d) return;
  const p = d.personas.find(x=>x.id===persId);
  if(!p) return;
  const calcEl = document.getElementById(`jpcalc-${persId}`);
  const warnEl = document.getElementById(`jpwarn-${persId}`);
  const badgeEl = document.getElementById(`jpbadge-${persId}`);
  if(badgeEl){
    const r = jRolById(p.rolId);
    badgeEl.className = 'role-badge ' + jRoleBadgeClass(r);
    badgeEl.textContent = r.label;
  }
  if(calcEl && warnEl){
    const h = jCalcHorasPersona(p);
    if(h===null){
      calcEl.innerHTML = `Horario incompleto`;
      warnEl.style.display = 'block';
      warnEl.textContent = 'Horario incompleto — no se computa';
    } else {
      const total = h * (p.vh||0);
      calcEl.innerHTML = `${jFmtH(h)} × ${jFmt(p.vh)}/h = <strong>${jFmt(total)}</strong>`;
      warnEl.style.display = 'none';
    }
  }
  const r = jCalcDia(d);
  const setMini = (id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  setMini(`jdm-pers-${d.id}`, r.personasComputadas);
  setMini(`jdm-hs-${d.id}`,   jFmtH(r.horasHombre));
  setMini(`jdm-tot-${d.id}`,  jFmt(r.total));
  const lineaEl = document.getElementById(`jdline2-${d.id}`);
  if(lineaEl){
    const tareaTxt = d.tarea ? `<div style="margin-top:2px;color:var(--text-secondary)">${jEsc(d.tarea)}</div>` : '';
    lineaEl.innerHTML = jLineaResumenDia(d, r) + tareaTxt;
  }
}

function jGenerarPersonasRapido(diaId, ev){
  if(ev) ev.stopPropagation();
  const d = jDias.find(x=>x.id===diaId);
  if(!d || d.cerrado) return;
  const cant = parseInt(document.getElementById(`jr-cant-${diaId}`).value) || 0;
  const rolId = document.getElementById(`jr-rol-${diaId}`).value;
  const ing = document.getElementById(`jr-ing-${diaId}`).value;
  const sal = document.getElementById(`jr-sal-${diaId}`).value;
  if(cant < 1){ alert('Ingresá una cantidad de personas (mínimo 1).'); return; }
  const r = jRolById(rolId);
  const baseN = d.personas.length;
  for(let i=0;i<cant;i++){
    d.personas.push({
      id: nid(),
      nombre: `${r.label} ${baseN+i+1}`,
      rolId: r.id,
      ing: ing||'',
      sal: sal||'',
      vh: r.hora || 0
    });
  }
  document.getElementById(`jr-cant-${diaId}`).value = '';
  document.getElementById(`jr-ing-${diaId}`).value = '';
  document.getElementById(`jr-sal-${diaId}`).value = '';
  jRender();
}

function jCalcDia(d){
  let horasHombre=0, mo=0, personasComputadas=0, incompletas=0;
  d.personas.forEach(p=>{
    const h = jCalcHorasPersona(p);
    if(h===null){ incompletas++; return; }
    horasHombre += h;
    mo += h * (p.vh||0);
    personasComputadas++;
  });
  const art = (J_CFG.art||0) * personasComputadas;
  return { horasHombre, mo, art, total: mo+art, personasComputadas, incompletas, totalPersonas:d.personas.length };
}
function jCalcularCierre(){
  let horasHombre=0, mo=0, art=0, diasCerrados=0, personasComputadas=0;
  const pendientes = [];
  jDias.forEach(d=>{
    const r = jCalcDia(d);
    if(d.cerrado){
      diasCerrados++;
      horasHombre += r.horasHombre;
      mo += r.mo;
      art += r.art;
      personasComputadas += r.personasComputadas;
    } else {
      pendientes.push({num:d.num, fecha:d.fecha, motivo:d.personas.length===0?'Sin personas':'Día abierto'});
    }
  });
  const jornada = J_CFG.jornada || 8;
  const jornales = jornada > 0 ? horasHombre/jornada : 0;
  return { horasHombre, mo, art, total:mo+art, diasCerrados, personasComputadas, jornales, pendientes };
}
function jOnCfgChange(){
  J_CFG.jornada = parseFloat(document.getElementById('j-cfg-jornada').value) || 8;
  J_CFG.art     = parseFloat(document.getElementById('j-cfg-art').value) || 0;
  jRecalcular();
}

function jRecalcular(){
  const c = jCalcularCierre();
  window._jLastCalc = c;

  const totalDias = jDias.length;
  const cerr = jDias.filter(d=>d.cerrado).length;
  const estadoEl = document.getElementById('j-obra-estado-info');
  if(estadoEl){
    if(totalDias===0){
      estadoEl.innerHTML = '<em style="color:var(--text-tertiary)">Sin días cargados todavía.</em>';
    } else {
      estadoEl.innerHTML = `
        <div>Días totales: <strong style="color:var(--text-primary)">${totalDias}</strong> · Cerrados: <strong style="color:var(--positive)">${cerr}</strong> · Abiertos: <strong style="color:var(--accent)">${totalDias-cerr}</strong></div>
        <div style="margin-top:6px">Horas hombre cerradas: <strong style="color:var(--text-primary)">${jFmtH(c.horasHombre)}</strong></div>
        <div>Liquidación parcial: <strong style="color:var(--accent)">${jFmt(c.total)}</strong></div>
        <div style="margin-top:6px;font-size:11px;color:${J_OBRA.cerrada?'var(--positive)':'var(--text-tertiary)'}">${J_OBRA.cerrada?'✓ Obra CERRADA':'Obra abierta'}</div>`;
    }
  }
  const btnC = document.getElementById('j-btn-cerrar-obra');
  const btnA = document.getElementById('j-btn-abrir-obra');
  if(btnC && btnA){
    if(J_OBRA.cerrada){ btnC.style.display='none'; btnA.style.display=''; }
    else { btnC.style.display=''; btnA.style.display='none'; }
  }
  document.getElementById('j-ci-dias').textContent = c.diasCerrados;
  document.getElementById('j-ci-personas').textContent = c.personasComputadas;
  document.getElementById('j-ci-horas').textContent = jFmtH(c.horasHombre);
  document.getElementById('j-ci-jornales').textContent = jFmtN(c.jornales,2);
  document.getElementById('j-ci-mo').textContent = jFmt(c.mo);
  document.getElementById('j-ci-art').textContent = jFmt(c.art);
  document.getElementById('j-row-art').style.display = c.art>0 ? '' : 'none';
  document.getElementById('j-ci-total').textContent = jFmt(c.total);

  const frase = document.getElementById('j-ci-frase');
  if(c.diasCerrados===0){
    frase.innerHTML = 'Cargá días con personas y horarios, después <strong>cerrá cada día</strong> para verlos consolidados acá.';
  } else {
    const obraTxt = J_OBRA.nombre ? `<strong>${jEsc(J_OBRA.nombre)}</strong>: ` : '';
    frase.innerHTML = `${obraTxt}Se utilizaron <strong>${jFmtN(c.jornales,2)} jornales equivalentes</strong> de ${jFmtN(J_CFG.jornada,1)} h, correspondientes a <strong>${jFmtH(c.horasHombre)}</strong> hombre, por una liquidación total de <strong>${jFmt(c.total)}</strong>.`;
  }
  const pendWrap = document.getElementById('j-ci-pendientes-wrap');
  const pendEl = document.getElementById('j-ci-pendientes');
  if(c.pendientes.length>0){
    pendWrap.style.display='';
    pendEl.innerHTML = c.pendientes.map(p=>`Día ${p.num} — ${jFechaCorta(p.fecha)} — ${p.motivo}`).join('<br>');
  } else {
    pendWrap.style.display='none';
  }
  if(S.tipoObra==='jornales'){
    const fp = document.getElementById('fab-price');
    if(fp) fp.textContent = jFmt(c.total);
  }
  jRenderTabla();
}

function jLineaResumenDia(d, r){
  if(d.cerrado){
    return `<span style="color:var(--positive)">●</span> ${r.personasComputadas} pers. — ${jFmtH(r.horasHombre)} hh — ${jFmt(r.total)}`;
  }
  if(d.personas.length===0){
    return `<span style="color:var(--text-tertiary)">○</span> Sin personas`;
  }
  const inc = r.incompletas>0 ? ` · ${r.incompletas} incompleta${r.incompletas>1?'s':''}` : '';
  return `<span style="color:var(--accent)">◐</span> ${r.personasComputadas}/${r.totalPersonas} pers. — ${jFmtH(r.horasHombre)} hh — ${jFmt(r.total)}${inc}`;
}

function jRenderDias(){
  const cont = document.getElementById('j-dias-container');
  const empty = document.getElementById('j-dias-empty');
  if(!cont) return;
  if(jDias.length===0){
    cont.innerHTML='';
    if(empty) empty.style.display='';
    return;
  }
  if(empty) empty.style.display='none';
  cont.innerHTML = jDias.map(d=>{
    const r = jCalcDia(d);
    const linea2 = jLineaResumenDia(d, r);
    const stateClass = d.cerrado ? 'cerrado' : (d.personas.length>0?'pendiente':'');
    const stateBadge = d.cerrado
      ? `<span class="j-dia-state cerrado">Cerrado</span>`
      : `<span class="j-dia-state abierto">Abierto</span>`;
    const tareaTxt = d.tarea ? `<div style="margin-top:2px;color:var(--text-secondary)">${jEsc(d.tarea)}</div>` : '';

    let body = '';
    if(d.abierto){
      body = `
        <div class="j-dia-body">
          <div class="j-section-title">Datos del día</div>
          <div class="row2">
            <div class="fg">
              <label>Fecha</label>
              <input type="date" value="${d.fecha||''}" ${d.cerrado?'disabled':''} onchange="jUpdateDia(${d.id},'fecha',this.value)">
            </div>
            <div class="fg">
              <label>Tarea</label>
              <input type="text" value="${jEsc(d.tarea||'')}" ${d.cerrado?'disabled':''} oninput="jUpdateDia(${d.id},'tarea',this.value)">
            </div>
          </div>
          ${d.cerrado ? '' : `
          <div class="j-section-title">Carga rápida por grupo</div>
          <div class="j-rapid">
            <div class="j-rapid-title">Mismo horario para varias personas</div>
            <div class="j-row3">
              <div class="fg">
                <label>Cantidad</label>
                <input type="number" id="jr-cant-${d.id}" min="1" step="1" placeholder="2">
              </div>
              <div class="fg">
                <label>Ingreso</label>
                <input type="time" id="jr-ing-${d.id}">
              </div>
              <div class="fg">
                <label>Salida</label>
                <input type="time" id="jr-sal-${d.id}">
              </div>
            </div>
            <div class="fg" style="margin-top:8px">
              <label>Rol</label>
              <select id="jr-rol-${d.id}">
                ${ROLES.map(rr=>`<option value="${rr.id}" ${rr.id==='of'?'selected':''}>${rr.label} — ${jFmt(rr.hora)}/h</option>`).join('')}
              </select>
            </div>
            <button class="j-btn-primary" onclick="jGenerarPersonasRapido(${d.id}, event)">Generar personas</button>
          </div>
          `}
          <div class="j-section-title">Personas (${d.personas.length})</div>
          <div>
            ${d.personas.map(p=>jRenderPersona(d, p)).join('') || '<div style="font-size:11px;color:var(--text-tertiary);padding:8px 0">Sin personas. Usá la carga rápida o agregá una manualmente.</div>'}
          </div>
          ${d.cerrado?'':`<button class="btn-add" onclick="jAgregarPersona(${d.id}, event)">+ Agregar persona</button>`}
          <div class="j-resumen">
            <div class="j-mini"><div class="j-mini-val" id="jdm-pers-${d.id}">${r.personasComputadas}</div><div class="j-mini-lbl">Personas</div></div>
            <div class="j-mini"><div class="j-mini-val" id="jdm-hs-${d.id}">${jFmtH(r.horasHombre)}</div><div class="j-mini-lbl">Horas hombre</div></div>
            <div class="j-mini"><div class="j-mini-val" id="jdm-tot-${d.id}">${jFmt(r.total)}</div><div class="j-mini-lbl">Total día</div></div>
          </div>
          <div class="j-acciones">
            ${d.cerrado
              ? `<button class="j-btn-pos" onclick="jReabrirDia(${d.id}, event)">Reabrir día</button>`
              : `<button class="j-btn-pos" onclick="jCerrarDia(${d.id}, event)">Cerrar día</button>`
            }
            <button class="j-btn-warn" onclick="jEliminarDia(${d.id}, event)">Eliminar día</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="j-dia-card ${stateClass}">
        <div class="j-dia-head" onclick="jToggleDia(${d.id})">
          <div class="j-dia-num">${d.num}</div>
          <div class="j-dia-info">
            <div class="j-dia-line1">
              Día ${d.num}
              <span class="j-dia-fecha">${jFechaCorta(d.fecha)}</span>
              ${stateBadge}
            </div>
            <div class="j-dia-line2" id="jdline2-${d.id}">${linea2}${tareaTxt}</div>
          </div>
          <div class="j-dia-chevron ${d.abierto?'open':''}">▾</div>
        </div>
        ${body}
      </div>
    `;
  }).join('');
}

function jRenderPersona(d, p){
  const r = jRolById(p.rolId);
  const h = jCalcHorasPersona(p);
  const disabled = d.cerrado ? 'disabled' : '';
  const calcTxt = h===null
    ? `Horario incompleto`
    : `${jFmtH(h)} × ${jFmt(p.vh)}/h = <strong>${jFmt(h*(p.vh||0))}</strong>`;
  const warnDisplay = h===null ? 'block' : 'none';
  return `
    <div class="j-persona">
      <div class="j-persona-head">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
          <span class="j-persona-titulo">${jEsc(p.nombre)}</span>
          <span class="role-badge ${jRoleBadgeClass(r)}" id="jpbadge-${p.id}">${r.label}</span>
        </div>
        ${d.cerrado?'':`<button class="btn-rm" onclick="jEliminarPersona(${d.id},${p.id},event)">×</button>`}
      </div>
      <div class="fg">
        <label>Nombre / referencia</label>
        <input type="text" value="${jEsc(p.nombre)}" ${disabled} oninput="jUpdatePersona(${d.id},${p.id},'nombre',this.value)">
      </div>
      <div class="row2">
        <div class="fg">
          <label>Rol</label>
          <select ${disabled} onchange="jUpdatePersona(${d.id},${p.id},'rolId',this.value)">
            ${ROLES.map(rr=>`<option value="${rr.id}" ${rr.id===p.rolId?'selected':''}>${rr.label}</option>`).join('')}
          </select>
        </div>
        <div class="fg">
          <label>Valor hora</label>
          <div class="input-wrap">
            <input type="number" value="${p.vh||0}" min="0" step="50" ${disabled} oninput="jUpdatePersona(${d.id},${p.id},'vh',this.value)">
            <span class="input-unit">$/h</span>
          </div>
        </div>
      </div>
      <div class="row2">
        <div class="fg">
          <label>Ingreso</label>
          <input type="time" value="${p.ing||''}" ${disabled} oninput="jUpdatePersona(${d.id},${p.id},'ing',this.value)">
        </div>
        <div class="fg">
          <label>Salida</label>
          <input type="time" value="${p.sal||''}" ${disabled} oninput="jUpdatePersona(${d.id},${p.id},'sal',this.value)">
        </div>
      </div>
      <div class="j-persona-warn" id="jpwarn-${p.id}" style="display:${warnDisplay}">Horario incompleto — no se computa</div>
      <div class="j-persona-calc" id="jpcalc-${p.id}">${calcTxt}</div>
    </div>
  `;
}

function jUpdateDia(diaId, campo, valor){
  const d = jDias.find(x=>x.id===diaId);
  if(!d || d.cerrado) return;
  d[campo] = valor;
  const r = jCalcDia(d);
  const lineaEl = document.getElementById(`jdline2-${d.id}`);
  if(lineaEl){
    const tareaTxt = d.tarea ? `<div style="margin-top:2px;color:var(--text-secondary)">${jEsc(d.tarea)}</div>` : '';
    lineaEl.innerHTML = jLineaResumenDia(d, r) + tareaTxt;
  }
  jRecalcular();
}

function jRenderTabla(){
  const tb = document.getElementById('j-tabla-body');
  if(!tb) return;
  const filas = [];
  jDias.forEach(d=>{
    if(d.personas.length===0){
      filas.push(`<tr>
        <td>${d.num}</td><td>${jFechaCorta(d.fecha)}</td>
        <td colspan="7" style="color:var(--text-tertiary);font-style:italic">Sin personas</td>
        <td class="${d.cerrado?'est-c':'est-a'}">${d.cerrado?'Cerr.':'Abr.'}</td>
      </tr>`);
      return;
    }
    d.personas.forEach(p=>{
      const r = jRolById(p.rolId);
      const h = jCalcHorasPersona(p);
      const tot = h===null ? '—' : jFmt(h*(p.vh||0));
      const hTxt = h===null ? 'inc.' : jFmtN(h,2);
      const estClass = h===null ? 'est-i' : (d.cerrado?'est-c':'est-a');
      const estTxt = h===null ? '—' : (d.cerrado?'Cerr.':'Abr.');
      filas.push(`<tr>
        <td>${d.num}</td>
        <td>${jFechaCorta(d.fecha)}</td>
        <td>${jEsc(p.nombre)}</td>
        <td>${r.label}</td>
        <td>${p.ing||'—'}</td>
        <td>${p.sal||'—'}</td>
        <td>${hTxt}</td>
        <td>${jFmt(p.vh||0)}</td>
        <td>${tot}</td>
        <td class="${estClass}">${estTxt}</td>
      </tr>`);
    });
  });
  tb.innerHTML = filas.join('') || `<tr><td colspan="10" style="text-align:center;color:var(--text-tertiary);padding:20px">Sin datos</td></tr>`;
}

function jRender(){
  jRenderDias();
  jRecalcular();
}

function jInit(){
  const fEl = document.getElementById('j-nuevo-dia-fecha');
  if(fEl && !fEl.value){
    const hoy = new Date();
    fEl.value = hoy.toISOString().slice(0,10);
  }
}

// ════════════════════════════════════════════════════════════════
// ═══════════ FIN MÓDULO JORNALES ════════════════════════════════
// ════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════
// ═══ MÓDULO PRESUPUESTO DE JORNALES (proyección anticipada) ════
// ════════════════════════════════════════════════════════════════

// Estado del módulo: solo cantidades y datos manuales del presupuesto.
// Los valores/hora se leen del array global ROLES.
// Almuerzo/seguro/combustible se leen de Config.
const PJ = {
  obra:    { nombre:'', cliente:'', nro:'', tel:'', dir:'' },
  // Roles fijos: Oficial Especializado (es), Oficial (of), Ayudante (ay)
  cantidades: { es:0, of:0, ay:0 },
  dias: 0,
  horas: 8,
  vehCant: 0,
  kmDia: 0,
  tanqueL: 0,
  tanqueRend: 0,
  tanquePrecio: 0,
  materiales: 0,
  traslado: 0,
  guPct: 0.10,
  margenPct: 0.30,
  impDebcred: 3,
  impIibb: 3.5,
  impGan: 10,
  conIva: false,
};

let _pjInitDone = false;
function pjInit(){
  // Render de filas de roles (solo es, of, ay) si todavía no se renderizaron
  if(!_pjInitDone){
    pjRenderMO();
    pjLoadFromConfig();
    pjLoadInputs();
    _pjInitDone = true;
  } else {
    pjLoadFromConfig();
  }
}

function pjRenderMO(){
  const c = document.getElementById('pj-mo-container');
  if(!c) return;
  const filas = [
    { id:'es', label:'Oficial Especializado' },
    { id:'of', label:'Oficial' },
    { id:'mo', label:'Medio Oficial' },
    { id:'ay', label:'Ayudante' },
  ];
  c.innerHTML = filas.map(f=>{
    const role = ROLES.find(r=>r.id===f.id) || {hora:0};
    return `
      <div class="cuad-role">
        <div class="cuad-role-head">
          <span class="role-badge rb-of">${f.label}</span>
          <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-tertiary)" id="pj-vh-${f.id}">$${(role.hora||0).toLocaleString('es-AR')}/h</span>
        </div>
        <div class="row2">
          <div class="fg" style="margin-bottom:0">
            <label>Cantidad</label>
            <input type="number" id="pj-cant-${f.id}" value="${PJ.cantidades[f.id]||0}" min="0" step="1" inputmode="numeric" oninput="pjCantChange('${f.id}',this.value)">
          </div>
          <div class="fg" style="margin-bottom:0">
            <label>Subtotal</label>
            <input type="text" id="pj-sub-${f.id}" value="$0" readonly style="color:var(--accent);font-weight:500">
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function pjCantChange(rolId, val){
  PJ.cantidades[rolId] = parseInt(val)||0;
  pjCalc();
}

function pjLoadFromConfig(){
  // Refresca valores/hora visibles tomados de ROLES
  ['es','of','mo','ay'].forEach(id=>{
    const role = ROLES.find(r=>r.id===id);
    const el = document.getElementById('pj-vh-'+id);
    if(el && role) el.textContent = '$'+(role.hora||0).toLocaleString('es-AR')+'/h';
  });
  // Almuerzo / seguro / combustible: leer de Config
  const almEl = document.getElementById('cfg-almuerzo');
  const segEl = document.getElementById('cfg-seguro');
  const tankL = document.getElementById('cfg-tanque-l');
  const tankR = document.getElementById('cfg-tanque-rend');
  const tankP = document.getElementById('cfg-tanque-precio');
  const almuerzo = almEl ? (parseFloat((almEl.value||'0').replace(/\./g,'').replace(',','.'))||0) : 0;
  const seguro   = segEl ? (parseFloat((segEl.value||'0').replace(/\./g,'').replace(',','.'))||0) : 0;
  const tL  = tankL ? (parseFloat(tankL.value)||0) : 0;
  const tR  = tankR ? (parseFloat(tankR.value)||0) : 0;
  const tP  = tankP ? (parseFloat((tankP.value||'0').replace(/\./g,'').replace(',','.'))||0) : 0;

  // Reflejar en chips informativos
  const chipAlm = document.getElementById('pj-cfg-almuerzo'); if(chipAlm) chipAlm.textContent = '$'+almuerzo.toLocaleString('es-AR');
  const chipSeg = document.getElementById('pj-cfg-seguro');   if(chipSeg) chipSeg.textContent = '$'+seguro.toLocaleString('es-AR');

  // Cargar combustible defaults solo si los inputs están en 0 / vacíos
  const setIfEmpty = (id, val, isMoneda)=>{
    const el = document.getElementById(id); if(!el) return;
    const cur = isMoneda ? parseFloat((el.value||'0').replace(/\./g,'').replace(',','.'))||0 : parseFloat(el.value)||0;
    if(cur===0 && val>0){
      if(isMoneda){ el.value = val.toLocaleString('es-AR'); }
      else { el.value = val; }
    }
  };
  setIfEmpty('pj-tanque-l', tL, false);
  setIfEmpty('pj-tanque-rend', tR, false);
  setIfEmpty('pj-tanque-precio', tP, true);
}

function pjLoadInputs(){
  const get = id => document.getElementById(id);
  if(get('pj-dias')) get('pj-dias').value = PJ.dias;
  if(get('pj-horas')) get('pj-horas').value = PJ.horas;
  if(get('pj-veh-cant')) get('pj-veh-cant').value = PJ.vehCant;
  if(get('pj-km-dia')) get('pj-km-dia').value = PJ.kmDia;
}

function pjGUChange(v){
  PJ.guPct = (parseFloat(v)||0)/100;
  const d = document.getElementById('pj-gu-disp'); if(d) d.textContent = v+'%';
  pjCalc();
}
function pjMargenChange(v){
  PJ.margenPct = (parseFloat(v)||0)/100;
  const d = document.getElementById('pj-margen-disp'); if(d) d.textContent = v+'%';
  pjCalc();
}
function pjSetIva(on){
  PJ.conIva = !!on;
  const si = document.getElementById('pj-iva-si');
  const no = document.getElementById('pj-iva-no');
  if(si) si.classList.toggle('on', on);
  if(no) no.classList.toggle('on', !on);
  const row = document.getElementById('pj-row-iva'); if(row) row.style.display = on ? '' : 'none';
  pjCalc();
}

function pjSync(){
  PJ.obra.nombre  = (document.getElementById('pj-nombre')||{}).value || '';
  PJ.obra.cliente = (document.getElementById('pj-cliente')||{}).value || '';
  PJ.obra.nro     = (document.getElementById('pj-nro')||{}).value || '';
  PJ.obra.tel     = (document.getElementById('pj-tel')||{}).value || '';
  PJ.obra.dir     = (document.getElementById('pj-dir')||{}).value || '';
}

function pjGetMoneda(id){
  const el = document.getElementById(id);
  if(!el) return 0;
  return parseFloat((el.value||'0').replace(/\./g,'').replace(',','.'))||0;
}

function pjCalc(){
  // Refrescar datos de Config (por si se modificaron)
  pjLoadFromConfig();

  // Inputs principales
  const dias  = parseFloat((document.getElementById('pj-dias')||{}).value)||0;
  const horas = parseFloat((document.getElementById('pj-horas')||{}).value)||0;
  PJ.dias = dias; PJ.horas = horas;

  // Mano de obra: por rol -> cant × valor/hora × horas × días
  const filas = ['es','of','mo','ay'];
  let totalMO = 0, totalOps = 0;
  filas.forEach(id=>{
    const cant = PJ.cantidades[id]||0;
    const role = ROLES.find(r=>r.id===id) || {hora:0};
    const sub = cant * (role.hora||0) * horas * dias;
    totalMO += sub;
    totalOps += cant;
    const subEl = document.getElementById('pj-sub-'+id);
    if(subEl) subEl.value = '$'+Math.round(sub).toLocaleString('es-AR');
  });
  const moTotalEl = document.getElementById('pj-mo-total');
  if(moTotalEl) moTotalEl.textContent = '$'+Math.round(totalMO).toLocaleString('es-AR');

  // Almuerzo y Seguro (desde Config)
  const almEl = document.getElementById('cfg-almuerzo');
  const segEl = document.getElementById('cfg-seguro');
  const almuerzoUnit = almEl ? (parseFloat((almEl.value||'0').replace(/\./g,'').replace(',','.'))||0) : 0;
  const seguroUnit   = segEl ? (parseFloat((segEl.value||'0').replace(/\./g,'').replace(',','.'))||0) : 0;
  const almuerzoTotal = almuerzoUnit * totalOps * dias;
  const seguroTotal   = seguroUnit * totalOps * dias;
  const almT = document.getElementById('pj-almuerzo-total'); if(almT) almT.textContent = '$'+Math.round(almuerzoTotal).toLocaleString('es-AR');
  const segT = document.getElementById('pj-seguro-total');   if(segT) segT.textContent = '$'+Math.round(seguroTotal).toLocaleString('es-AR');

  // Combustible
  const veh   = parseFloat((document.getElementById('pj-veh-cant')||{}).value)||0;
  const kmDia = parseFloat((document.getElementById('pj-km-dia')||{}).value)||0;
  const tL    = parseFloat((document.getElementById('pj-tanque-l')||{}).value)||0;
  const tR    = parseFloat((document.getElementById('pj-tanque-rend')||{}).value)||0;
  const tP    = pjGetMoneda('pj-tanque-precio');
  PJ.vehCant=veh; PJ.kmDia=kmDia; PJ.tanqueL=tL; PJ.tanqueRend=tR; PJ.tanquePrecio=tP;

  const kmTotal    = veh * kmDia * dias;
  const autonomia  = tL * tR; // km de autonomía por tanque (referencia)
  const litros     = tR>0 ? (kmTotal/tR) : 0;
  const combTotal  = litros * tP;

  const fmKm = n => Math.round(n).toLocaleString('es-AR')+' km';
  const elKm = document.getElementById('pj-km-total'); if(elKm) elKm.textContent = fmKm(kmTotal);
  const elAut = document.getElementById('pj-autonomia'); if(elAut) elAut.textContent = fmKm(autonomia);
  const elLit = document.getElementById('pj-tanques'); if(elLit) elLit.textContent = litros.toFixed(1).replace('.',',')+' L';
  const elComb = document.getElementById('pj-comb-total'); if(elComb) elComb.textContent = '$'+Math.round(combTotal).toLocaleString('es-AR');

  // Otros costos
  const materiales = pjGetMoneda('pj-materiales');
  const traslado   = pjGetMoneda('pj-traslado');
  PJ.materiales = materiales; PJ.traslado = traslado;

  // Filas resumen
  const sset = (id,v)=>{const el=document.getElementById(id);if(el)el.textContent='$'+Math.round(v||0).toLocaleString('es-AR');};
  sset('pj-r-mo', totalMO);
  sset('pj-r-alm', almuerzoTotal);
  sset('pj-r-seg', seguroTotal);
  sset('pj-r-comb', combTotal);
  sset('pj-r-mat', materiales);
  sset('pj-r-tras', traslado);

  const subDir = totalMO + almuerzoTotal + seguroTotal + combTotal + materiales + traslado;
  sset('pj-r-subdir', subDir);

  // Gastos y utilidad (% sobre subDir)
  const gu = subDir * (PJ.guPct||0);
  sset('pj-r-gu', gu);
  const totalDir = subDir + gu;
  sset('pj-r-totaldir', totalDir);

  // Margen aplicado: precio = costo / (1 - margen%)
  // Si margen=0 -> precio = totalDir
  const m = Math.min(0.95, Math.max(0, PJ.margenPct||0));
  const pBase = m<1 ? (totalDir/(1-m)) : totalDir;
  sset('pj-r-pbase', pBase);

  // Impuestos sobre venta (sobre pBase)
  const pctDC  = (parseFloat((document.getElementById('pj-imp-debcred')||{}).value)||0)/100;
  const pctIIBB= (parseFloat((document.getElementById('pj-imp-iibb')||{}).value)||0)/100;
  const pctGan = (parseFloat((document.getElementById('pj-imp-gan')||{}).value)||0)/100;
  PJ.impDebcred=pctDC*100; PJ.impIibb=pctIIBB*100; PJ.impGan=pctGan*100;

  const debcred = pBase * pctDC;
  const iibb    = pBase * pctIIBB;
  const gan     = pBase * pctGan;
  const iva     = PJ.conIva ? (pBase * 0.21) : 0;
  const totImp  = debcred + iibb + gan + iva;

  sset('pj-r-debcred', debcred);
  sset('pj-r-iibb', iibb);
  sset('pj-r-gan', gan);
  sset('pj-r-iva', iva);
  sset('pj-r-totalimp', totImp);

  const totalGen = pBase + totImp;
  sset('pj-r-total', totalGen);

  // FAB price
  const fp = document.getElementById('fab-price');
  if(fp) fp.textContent = totalGen>0 ? '$'+Math.round(totalGen).toLocaleString('es-AR') : '$0';

  // Guardar último cálculo para historial
  window._pjLastCalc = {
    totalMO, totalOps, dias, horas,
    almuerzoUnit, almuerzoTotal,
    seguroUnit, seguroTotal,
    veh, kmDia, kmTotal, tanqueL:tL, tanqueRend:tR, tanquePrecio:tP, autonomia, litros, combTotal,
    materiales, traslado,
    subDir, guPct:PJ.guPct, gu, totalDir,
    margenPct:m, pBase,
    impDebcred:pctDC, impIibb:pctIIBB, impGan:pctGan, conIva:PJ.conIva,
    debcred, iibb, gan, iva, totImp,
    totalGen,
    cantidades: {...PJ.cantidades},
    obra: {...PJ.obra},
  };
}

function pjGuardarPresupuesto(){
  pjSync(); pjCalc();
  const c = window._pjLastCalc || {};
  const nombre = (PJ.obra.nombre || 'Presupuesto jornales '+new Date().toLocaleDateString('es-AR'));
  const fecha = new Date().toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const item = {
    id: Date.now(),
    nombre,
    fecha,
    total: c.totalGen||0,
    supReal: 0,
    tipoObra: 'jornales-ppto',
    estado: {
      _pjState: JSON.parse(JSON.stringify(PJ)),
      _pjLastCalc: JSON.parse(JSON.stringify(c)),
      _cliNombre:    PJ.obra.cliente || '',
      _cliDireccion: PJ.obra.dir || '',
      _cliTelefono:  PJ.obra.tel || '',
      _cliNro:       PJ.obra.nro || '',
      _cliObs:       PJ.obra.nombre || '',
    }
  };
  const lista = histGetAll();
  lista.unshift(item);
  histSetAll(lista);
  alert('Presupuesto guardado en Historial.');
}

// ════════════════════════════════════════════════════════════════
// ═══════════ FIN MÓDULO PRESUPUESTO DE JORNALES ════════════════
// ════════════════════════════════════════════════════════════════

// ── EDITAR PRESUPUESTO ──
let _editId = null;
function openEdit(id){
  const lista=histGetAll();
  const item=lista.find(i=>i.id===id);if(!item)return;
  _editId=id;
  const est=item.estado||{};
  const eb=document.getElementById('edit-body');
  eb.innerHTML=`
    <button class="btn-edit-load" onclick="editCargarParaEditar()">↩ Cargar y seguir editando</button>
    <div class="edit-load-note">Trae todo el presupuesto (medición, cuadrilla, costos, margen) a la app para modificarlo. Abajo podés ajustar solo los datos del cliente y guardar una nueva versión.</div>
    <div class="edit-field"><label>Nombre del presupuesto</label><input type="text" id="ed-nombre" value="${item.nombre||''}"></div>
    <div class="edit-field"><label>Cliente</label><input type="text" id="ed-cli-nombre" value="${est._cliNombre||''}"></div>
    <div class="edit-field"><label>Dirección</label><input type="text" id="ed-cli-dir" value="${est._cliDireccion||''}"></div>
    <div class="edit-field"><label>Teléfono</label><input type="text" id="ed-cli-tel" value="${est._cliTelefono||''}"></div>
    <div class="edit-field"><label>N° Presupuesto</label><input type="text" id="ed-cli-nro" value="${est._cliNro||''}"></div>
    <div class="edit-field"><label>Observaciones</label><input type="text" id="ed-cli-obs" value="${est._cliObs||''}"></div>
  `;
  document.getElementById('edit-overlay').classList.add('open');
}
function editCargarParaEditar(){
  if(!_editId)return;
  const lista=histGetAll();const item=lista.find(i=>i.id===_editId);
  if(!item||!item.estado){alert('Este presupuesto no tiene datos para cargar.');return;}
  if(!confirm(`¿Cargar "${item.nombre}" para seguir editándolo?\nSe reemplazarán los datos actuales en pantalla.`))return;
  histRestaurarEstado(item.estado);
  closeEdit();
  closeHist();
}
function editGuardar(){
  if(!_editId)return;
  const lista=histGetAll();
  const idx=lista.findIndex(i=>i.id===_editId);if(idx<0)return;
  const original=lista[idx];
  const gv=id=>(document.getElementById(id)||{}).value||'';
  // Guardar versión original como ítem separado con sufijo de versión
  const ver=(original.version||1);
  const copia={...JSON.parse(JSON.stringify(original)),id:Date.now(),nombre:original.nombre+' (v'+ver+')',version:ver};
  // Nueva versión editada
  const nuevo={...JSON.parse(JSON.stringify(original)),
    id:_editId,
    nombre:gv('ed-nombre')||original.nombre,
    version:ver+1,
    fecha:new Date().toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    estado:{...original.estado,
      _cliNombre:   gv('ed-cli-nombre'),
      _cliDireccion:gv('ed-cli-dir'),
      _cliTelefono: gv('ed-cli-tel'),
      _cliNro:      gv('ed-cli-nro'),
      _cliObs:      gv('ed-cli-obs')
    }
  };
  lista.splice(idx,1,nuevo,copia);
  histSetAll(lista);
  renderHistLista();
  closeEdit();
}
function closeEdit(){document.getElementById('edit-overlay').classList.remove('open');_editId=null;}
function closeEditOut(e){if(e.target===document.getElementById('edit-overlay'))closeEdit();}

// ── WHATSAPP ──
function enviarWhatsApp(id){
  const lista=histGetAll();
  const item=lista.find(i=>i.id===id);if(!item)return;
  const est=item.estado||{};
  const esJ=item.tipoObra==='jornales';
  const esPJ=item.tipoObra==='jornales-ppto';
  const d=est._lastCalc||{};
  const jd=est._jLastCalc||{};
  const pjd=est._pjLastCalc||{};
  const cli=est._cliNombre?`👤 *${est._cliNombre}*`:'';
  const dir=est._cliDireccion?`📍 ${est._cliDireccion}`:'';
  const tel=est._cliTelefono?`📞 ${est._cliTelefono}`:'';
  const nro=est._cliNro?`N° ${est._cliNro} · `:'';
  const fecha=item.fecha||'';

  let msg='';
  if(esPJ){
    const obraNom = (pjd.obra && pjd.obra.nombre) || '';
    const c = pjd.cantidades || {};
    const dias = pjd.dias || 0;
    const horas = pjd.horas || 8;
    const totOps = (c.es||0)+(c.of||0)+(c.ay||0);
    const filas = [];
    if((c.es||0)>0) filas.push(`  · Oficial Especializado: ${c.es}`);
    if((c.of||0)>0) filas.push(`  · Oficial: ${c.of}`);
    if((c.ay||0)>0) filas.push(`  · Ayudante: ${c.ay}`);
    const totalGen = fmtm(pjd.totalGen||item.total||0);
    msg=`*PRESUPUESTO DE OBRA — JORNALES*\n`
      +`${nro}${fecha}\n\n`
      +(cli?cli+'\n':'')
      +(obraNom?`🏗️ *Obra:* ${obraNom}\n`:'')
      +(dir?dir+'\n':'')
      +(tel?tel+'\n':'')
      +`\n👷 *Personal proyectado:*\n`
      +(filas.length?filas.join('\n')+'\n':'  · (sin operarios cargados)\n')
      +`  · Total operarios: *${totOps}*\n`
      +`\n📅 *Duración:* ${dias} días × ${horas} h/jornada\n`
      +`⛽ Combustible: ${fmtm(pjd.combTotal||0)} (${(pjd.litros||0).toFixed(1).replace('.',',')} L)\n`
      +`🍽️ Almuerzo: ${fmtm(pjd.almuerzoTotal||0)}\n`
      +`🛡️ Seguro: ${fmtm(pjd.seguroTotal||0)}\n`
      +`\n💰 *TOTAL GENERAL: ${totalGen}*\n`
      +`\n_Este presupuesto tiene validez de 15 días desde la fecha de emisión._\n`
      +`_Los precios no incluyen materiales salvo indicación expresa. · Joaquín_`;
  } else if(!esJ){
    const tipo=item.tipoObra==='edificio'?'Edificio':'Casa';
    const supTotal=(d.supReal||0).toFixed(2).replace('.',',');

    // Calcular muros y cielorrasos desde ambientes guardados
    const ambs=est.ambientes||[];
    const ambsEdf=est.ambientesEdf||[];
    let muroNeto=0,cieloTotal=0;
    if(item.tipoObra==='casa'){
      ambs.forEach(a=>{try{muroNeto+=calcAmbMuroNeto(a);cieloTotal+=calcAmbCielo(a);}catch(e){}});
    } else {
      ambsEdf.forEach(a=>{try{muroNeto+=calcAmbEdfMuroNeto(a);cieloTotal+=calcAmbEdfCielo(a);}catch(e){}});
    }

    // Adicionales (puertas, ventanas, zócalos, barandas) con material
    const carp=est.carpItems||[];
    const carpSecs=describeCarpItems(carp);
    const carpOrder=['Puertas','Ventanas','Zócalos','Barandas'];
    const adicionalesTxt=carpOrder
      .filter(g=>carpSecs[g]&&carpSecs[g].length)
      .map(g=>`*${g}:*\n`+carpSecs[g].map(it=>`  · ${it.line}`).join('\n'))
      .join('\n');

    // Ambientes listados
    const listaAmbs=(item.tipoObra==='casa'?ambs:ambsEdf);
    let ambsLines='';
    if(listaAmbs.length>0){
      const counts={};
      listaAmbs.forEach(a=>{
        const t=a.tipo||'Ambiente';
        counts[t]=(counts[t]||0)+1;
        const lbl=counts[t]>1?`${t} N°${counts[t]}`:t;
        ambsLines+=`  · ${lbl}\n`;
      });
    }

    const dias=Math.ceil(d.jornadas||0);
    const total=fmtm(d.precioFinal||item.total||0);

    msg=`*PRESUPUESTO DE PINTURA*\n`
      +`${nro}${fecha}\n\n`
      +(cli?cli+'\n':'')
      +(dir?dir+'\n':'')
      +(tel?tel+'\n':'')
      +`\n📋 *Tipo:* ${tipo}`
      +`\n\n*DETALLE DE LA OBRA*\n`
      +(ambsLines?ambsLines:'')
      +`📐 Superficie total: *${supTotal} m²*\n`
      +`📏 Muros netos: ${muroNeto.toFixed(2).replace('.',',')} m²\n`
      +`🏠 Cielorrasos: ${cieloTotal.toFixed(2).replace('.',',')} m²\n`
      +(adicionalesTxt?`\n🧱 *ADICIONALES INCLUIDOS*\n${adicionalesTxt}\n`:'')
      +`\n📅 Días estimados: *${dias} días*\n`
      +`\n💰 *TOTAL A COBRAR: ${total}*\n`
      +`\n_Este presupuesto tiene validez de 15 días desde la fecha de emisión._\n`
      +`_Los precios no incluyen materiales salvo indicación expresa. · Joaquín_`;
  } else {
    const obra=est.J_OBRA||{};
    const hh=(jd.horasHombre||0).toFixed(1).replace('.',',');
    const total=fmtm(jd.total||item.total||0);
    msg=`*LIQUIDACIÓN DE JORNALES*\n`
      +`${fecha}\n\n`
      +(obra.cliente?`👤 *${obra.cliente}*\n`:'')
      +(obra.nombre?`🏗️ Obra: ${obra.nombre}\n`:'')
      +`\n⏱️ *Horas-hombre:* ${hh} hh`
      +`\n\n💰 *TOTAL: ${total}*`
      +(obra.obs?`\n\n📝 ${obra.obs}`:'')
      +`\n\n_Liquidación por horas reales trabajadas. · Joaquín_`;
  }
  const url='https://wa.me/?text='+encodeURIComponent(msg);
  window.open(url,'_blank');
}
const CLI = { nombre:'', direccion:'', telefono:'', nro:'', obs:'' };
function syncCliente(){
  CLI.nombre    = (document.getElementById('cli-nombre')||{}).value||'';
  CLI.direccion = (document.getElementById('cli-direccion')||{}).value||'';
  CLI.telefono  = (document.getElementById('cli-telefono')||{}).value||'';
  CLI.nro       = (document.getElementById('cli-nro')||{}).value||'';
  CLI.obs       = (document.getElementById('cli-obs')||{}).value||'';
}

// ── PDF (desde Historial) ──
function openPdfFromHist(id){
  const lista = histGetAll();
  const item = lista.find(i=>i.id===id);
  if(!item){alert('Presupuesto no encontrado.');return;}
  renderPdfDesdeItem(item);
  document.getElementById('pdf-overlay').classList.add('open');
}

function renderPdfDesdeItem(item){
  const sheet = document.getElementById('pdf-sheet');
  const est = item.estado || {};
  const esJornales = item.tipoObra === 'jornales';
  const esPJ = item.tipoObra === 'jornales-ppto';
  const fecha = item.fecha || new Date().toLocaleString('es-AR');

  if(esPJ){
    sheet.innerHTML = renderPdfPjornales(item, est, fecha);
  } else if(esJornales){
    sheet.innerHTML = renderPdfJornales(item, est, fecha);
  } else {
    sheet.innerHTML = renderPdfPintura(item, est, fecha);
  }
}

function renderPdfPjornales(item, est, fecha){
  const c = est._pjLastCalc || {};
  const obra = (c.obra) || {};
  const cant = c.cantidades || {};
  const filas = [];
  if((cant.es||0)>0) filas.push(`<div class="pdf-row"><span class="pr-l">Oficial Especializado</span><span class="pr-v">${cant.es} pers.</span></div>`);
  if((cant.of||0)>0) filas.push(`<div class="pdf-row"><span class="pr-l">Oficial</span><span class="pr-v">${cant.of} pers.</span></div>`);
  if((cant.ay||0)>0) filas.push(`<div class="pdf-row"><span class="pr-l">Ayudante</span><span class="pr-v">${cant.ay} pers.</span></div>`);
  return `
    <div class="pdf-header">
      <div>
        <div class="pdf-brand">Joaquín</div>
        <div class="pdf-brand-sub">Presupuesto de Obra — Jornales</div>
      </div>
      <div class="pdf-meta">
        <div><strong>${obra.nro?'N° '+obra.nro:item.nombre}</strong></div>
        <div>Fecha: ${fecha}</div>
        <div>Tipo: Presupuesto anticipado</div>
      </div>
    </div>

    ${(obra.cliente||obra.nombre||obra.dir||obra.tel) ? `
    <div class="pdf-section-title">Datos de la obra</div>
    <div class="pdf-client-block">
      ${obra.nombre  ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Obra</span><span class="pdf-client-val">${obra.nombre}</span></div>` : ''}
      ${obra.cliente ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Cliente</span><span class="pdf-client-val">${obra.cliente}</span></div>` : ''}
      ${obra.dir     ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Dirección</span><span class="pdf-client-val">${obra.dir}</span></div>` : ''}
      ${obra.tel     ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Teléfono</span><span class="pdf-client-val">${obra.tel}</span></div>` : ''}
    </div>` : ''}

    <div class="pdf-section-title">Personal proyectado</div>
    ${filas.join('') || '<div class="pdf-row"><span class="pr-l">Sin operarios cargados</span><span class="pr-v">—</span></div>'}
    <div class="pdf-row"><span class="pr-l">Total operarios</span><span class="pr-v">${(cant.es||0)+(cant.of||0)+(cant.ay||0)}</span></div>
    <div class="pdf-row hi"><span class="pr-l">Duración</span><span class="pr-v">${c.dias||0} días × ${c.horas||8} h</span></div>

    <div class="pdf-section-title">Resumen de costos</div>
    <div class="pdf-row"><span class="pr-l">Mano de obra</span><span class="pr-v">${fmtm(c.totalMO||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Almuerzo</span><span class="pr-v">${fmtm(c.almuerzoTotal||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Seguro</span><span class="pr-v">${fmtm(c.seguroTotal||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Combustible (${(c.litros||0).toFixed(1).replace('.',',')} L)</span><span class="pr-v">${fmtm(c.combTotal||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Materiales</span><span class="pr-v">${fmtm(c.materiales||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Traslado</span><span class="pr-v">${fmtm(c.traslado||0)}</span></div>
    <div class="pdf-row hi"><span class="pr-l">Subtotal directos</span><span class="pr-v">${fmtm(c.subDir||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Gastos y utilidad (${Math.round((c.guPct||0)*100)}%)</span><span class="pr-v">${fmtm(c.gu||0)}</span></div>
    <div class="pdf-row hi"><span class="pr-l">Total costos directos</span><span class="pr-v">${fmtm(c.totalDir||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Margen aplicado (${Math.round((c.margenPct||0)*100)}%)</span><span class="pr-v">${fmtm((c.pBase||0)-(c.totalDir||0))}</span></div>
    <div class="pdf-row hi"><span class="pr-l">Precio base</span><span class="pr-v">${fmtm(c.pBase||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Imp. débito/créd.</span><span class="pr-v">${fmtm(c.debcred||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Ingresos Brutos</span><span class="pr-v">${fmtm(c.iibb||0)}</span></div>
    <div class="pdf-row"><span class="pr-l">Ganancias</span><span class="pr-v">${fmtm(c.gan||0)}</span></div>
    ${c.conIva?`<div class="pdf-row"><span class="pr-l">IVA 21%</span><span class="pr-v">${fmtm(c.iva||0)}</span></div>`:''}

    <div class="pdf-total-box">
      <span class="pt-l">TOTAL GENERAL</span>
      <span class="pt-v">${fmtm(c.totalGen||item.total||0)}</span>
    </div>

    <div class="pdf-footer">
      Este presupuesto tiene validez de 15 días desde la fecha de emisión.<br>
      Los precios no incluyen materiales salvo indicación expresa. · Joaquín
    </div>
  `;
}

function renderPdfPintura(item, est, fecha){
  const d = est._lastCalc || {};
  const cli = {
    nombre:   est._cliNombre   || '',
    direccion:est._cliDireccion|| '',
    telefono: est._cliTelefono || '',
    nro:      est._cliNro      || '',
    obs:      est._cliObs      || ''
  };
  const tipo = item.tipoObra==='edificio'?'Edificio / PH':'Casa / Vivienda';
  const conIva = !!est._conIva;

  // Detalle de ambientes
  const ambs = (est.ambientes||[]).filter(a=>a&&(a.largo||a.ancho||a.alto));
  const sects = (est.sectores||[]).filter(s=>s&&(s.largo||s.ancho||s.alto));
  const ambsEdf = (est.ambientesEdf||[]).filter(a=>a&&(a.largo||a.ancho||a.alto));

  let alcanceHTML = '';
  if(ambs.length>0){
    alcanceHTML += `<div class="pdf-row hi"><span class="pr-l">Ambientes (${ambs.length})</span><span class="pr-v"></span></div>`;
    ambs.forEach(a=>{
      const m2 = (parseFloat(a.largo)||0)*(parseFloat(a.ancho)||0);
      alcanceHTML += `<div class="pdf-row"><span class="pr-l" style="padding-left:14px">· ${a.nombre||a.tipo||'Ambiente'}</span><span class="pr-v">${m2.toFixed(2).replace('.',',')} m²</span></div>`;
    });
  }
  if(sects.length>0){
    alcanceHTML += `<div class="pdf-row hi"><span class="pr-l">Sectores adicionales (${sects.length})</span><span class="pr-v"></span></div>`;
    sects.forEach(s=>{
      const m2 = (parseFloat(s.largo)||0)*(parseFloat(s.ancho)||0);
      alcanceHTML += `<div class="pdf-row"><span class="pr-l" style="padding-left:14px">· ${s.nombre||'Sector'}</span><span class="pr-v">${m2.toFixed(2).replace('.',',')} m²</span></div>`;
    });
  }
  if(ambsEdf.length>0){
    alcanceHTML += `<div class="pdf-row hi"><span class="pr-l">Espacios del edificio (${ambsEdf.length})</span><span class="pr-v"></span></div>`;
    ambsEdf.forEach(a=>{
      const m2 = (parseFloat(a.largo)||0)*(parseFloat(a.ancho)||0);
      alcanceHTML += `<div class="pdf-row"><span class="pr-l" style="padding-left:14px">· ${a.nombre||a.tipo||'Espacio'}</span><span class="pr-v">${m2.toFixed(2).replace('.',',')} m²</span></div>`;
    });
  }

  return `
    <div class="pdf-header">
      <div>
        <div class="pdf-brand">Joaquín</div>
        <div class="pdf-brand-sub">Presupuesto de Pintura</div>
      </div>
      <div class="pdf-meta">
        <div><strong>${cli.nro?'N° '+cli.nro:item.nombre}</strong></div>
        <div>Fecha: ${fecha}</div>
        <div>Tipo: ${tipo}</div>
      </div>
    </div>

    ${(cli.nombre||cli.direccion||cli.telefono||cli.obs) ? `
    <div class="pdf-section-title">Datos del cliente</div>
    <div class="pdf-client-block">
      ${cli.nombre    ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Cliente</span><span class="pdf-client-val">${cli.nombre}</span></div>` : ''}
      ${cli.direccion ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Dirección</span><span class="pdf-client-val">${cli.direccion}</span></div>` : ''}
      ${cli.telefono  ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Teléfono</span><span class="pdf-client-val">${cli.telefono}</span></div>` : ''}
      ${cli.obs       ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Observ.</span><span class="pdf-client-val">${cli.obs}</span></div>` : ''}
    </div>` : ''}

    <div class="pdf-section-title">Alcance de la obra</div>
    ${alcanceHTML || '<div class="pdf-row"><span class="pr-l">Sin detalle de espacios</span><span class="pr-v">—</span></div>'}
    <div class="pdf-row hi"><span class="pr-l">Superficie total</span><span class="pr-v">${(d.supReal||0).toFixed(2).replace('.',',')} m²</span></div>
    <div class="pdf-row"><span class="pr-l">Muros netos</span><span class="pr-v">${(est.ambientes||[]).reduce((s,a)=>{try{return s+calcAmbMuroNeto(a);}catch(e){return s;}},0).toFixed(2).replace('.',',')} m²</span></div>
    <div class="pdf-row"><span class="pr-l">Cielorrasos</span><span class="pr-v">${(est.ambientes||[]).reduce((s,a)=>{try{return s+calcAmbCielo(a);}catch(e){return s;}},0).toFixed(2).replace('.',',')} m²</span></div>
    <div class="pdf-row"><span class="pr-l">Días estimados</span><span class="pr-v">${Math.ceil(d.jornadas||0)} días</span></div>

    ${(()=>{ const secs=describeCarpItems(est.carpItems||[]); const order=['Puertas','Ventanas','Zócalos','Barandas']; const visible=order.filter(g=>secs[g]&&secs[g].length); if(!visible.length) return ''; return `<div class="pdf-section-title">Adicionales incluidos</div>`+visible.map(g=>`<div class="pdf-row hi"><span class="pr-l">${g}</span><span class="pr-v"></span></div>`+secs[g].map(it=>`<div class="pdf-row"><span class="pr-l" style="padding-left:14px">· ${it.line}</span><span class="pr-v"></span></div>`).join('')).join(''); })()}

    <div class="pdf-total-box">
      <span class="pt-l">TOTAL A PAGAR${conIva?' (con IVA)':''}</span>
      <span class="pt-v">${fmtm(d.precioFinal||item.total||0)}</span>
    </div>

    <div class="pdf-footer">
      Este presupuesto tiene validez de 15 días desde la fecha de emisión.<br>
      Los precios no incluyen materiales salvo indicación expresa. · Joaquín
    </div>
  `;
}

function renderPdfJornales(item, est, fecha){
  const c = est._jLastCalc || {};
  const obra = est.J_OBRA || {};
  const dias = est.jDias || [];
  const diasCerrados = dias.filter(d=>d.cerrado);

  let detalleHTML = '';
  if(diasCerrados.length>0){
    detalleHTML = diasCerrados.map(d=>{
      const personas = (d.personas||[]).length;
      const fechaD = d.fecha || `Día ${d.num}`;
      return `<div class="pdf-row"><span class="pr-l">${fechaD}</span><span class="pr-v">${personas} pers.</span></div>`;
    }).join('');
  }

  return `
    <div class="pdf-header">
      <div>
        <div class="pdf-brand">Joaquín</div>
        <div class="pdf-brand-sub">Liquidación de Jornales</div>
      </div>
      <div class="pdf-meta">
        <div><strong>${item.nombre}</strong></div>
        <div>Fecha: ${fecha}</div>
        <div>Tipo: Obra / Jornales</div>
      </div>
    </div>

    ${(obra.cliente||obra.nombre||obra.obs) ? `
    <div class="pdf-section-title">Datos de la obra</div>
    <div class="pdf-client-block">
      ${obra.nombre  ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Obra</span><span class="pdf-client-val">${obra.nombre}</span></div>` : ''}
      ${obra.cliente ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Cliente</span><span class="pdf-client-val">${obra.cliente}</span></div>` : ''}
      ${obra.obs     ? `<div class="pdf-client-row"><span class="pdf-client-lbl">Observ.</span><span class="pdf-client-val">${obra.obs}</span></div>` : ''}
    </div>` : ''}

    <div class="pdf-section-title">Resumen de la obra</div>
    <div class="pdf-row"><span class="pr-l">Días trabajados</span><span class="pr-v">${diasCerrados.length} día${diasCerrados.length===1?'':'s'}</span></div>
    <div class="pdf-row"><span class="pr-l">Personas computadas</span><span class="pr-v">${c.personasComputadas||0}</span></div>
    <div class="pdf-row hi"><span class="pr-l">Horas-hombre totales</span><span class="pr-v">${(c.horasHombre||0).toFixed(2).replace('.',',')} hh</span></div>
    <div class="pdf-row"><span class="pr-l">Jornadas equivalentes (${est.J_CFG?est.J_CFG.jornada:8} h)</span><span class="pr-v">${c.horasHombre&&est.J_CFG?(c.horasHombre/(est.J_CFG.jornada||8)).toFixed(2).replace('.',','):'—'}</span></div>

    ${detalleHTML?`
    <div class="pdf-section-title">Detalle por día</div>
    ${detalleHTML}`:''}

    <div class="pdf-section-title">Liquidación</div>
    <div class="pdf-row"><span class="pr-l">Mano de obra</span><span class="pr-v">${fmtm(c.mo||0)}</span></div>
    ${(c.art||0)>0?`<div class="pdf-row"><span class="pr-l">Seguro / ART</span><span class="pr-v">${fmtm(c.art||0)}</span></div>`:''}

    <div class="pdf-total-box">
      <span class="pt-l">TOTAL A PAGAR</span>
      <span class="pt-v">${fmtm(c.total||item.total||0)}</span>
    </div>

    <div class="pdf-footer">
      Liquidación basada en horas reales trabajadas y registradas. · Joaquín
    </div>
  `;
}

function closePdf(){
  document.getElementById('pdf-overlay').classList.remove('open');
}

// ── INIT ──
document.addEventListener('DOMContentLoaded',()=>{
  renderAmbientesSelector();renderAmbientesEdfSelector();renderCuadrilla();renderCfgJornales();
  costosDir.push({id:nid(),nombre:'Combustible / viajes',monto:0});
  costosDir.push({id:nid(),nombre:'Flete / movilidad',monto:0});
  syncConfig();calc();
  // Inicializar módulo jornales
  jInit();
  jRender();
  // Iniciar en pantalla Home con el saludo dinámico, las tarjetas de info
  // y la actividad reciente ya cargadas (sin tener que tocar el logo).
  if(typeof renderHome==='function') renderHome();
  const fab=document.getElementById('fab-btn');if(fab)fab.style.display='none';
});
