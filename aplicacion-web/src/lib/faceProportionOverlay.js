/**
 * Croquis facial en tiempo real — MediaPipe Face Mesh (misma lógica que face-proportion-overlay/face_proportion_overlay.html).
 * `FaceMesh` se carga desde `index.html` vía CDN (igual que la demo), no desde el bundle de Vite.
 */
const FaceMesh = globalThis.FaceMesh

/** Suavizado temporal entre frames — más bajo = más fiel al landmark crudo (más «exacto»). */
const LANDMARK_BLEND = 0.12

/** Misma calidad en vivo y en foto fija: landmarks refinados + seguimiento estable. */
const FACEMESH_QUALITY_OPTIONS = {
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.52,
  minTrackingConfidence: 0.62,
}
const profileOptimize = false
function profileOn(pose) {
  return profileOptimize && pose && pose.isProfile
}

function defaultFaceOverlayDrawOptions() {
  return {
    /** 0.2–1 opacidad global del croquis */
    alpha: 0.88,
    /** Escala del grosor base (1.4) */
    strokeScale: 1,
    /** Puntos de malla 468 */
    showMesh: false,
    zones: {
      oval: true,
      brows: true,
      eyes: true,
      nose: true,
      lips: true,
      jaw: true,
      forehead: true,
      papada: true,
      guides: true,
    },
  }
}
let faceOverlayDrawOptions = defaultFaceOverlayDrawOptions()

/** Ajustes en vivo y en foto fija (desde la UI de captura / anotar). */
export function setFaceOverlayOptions(partial) {
  if (partial.zones) {
    faceOverlayDrawOptions.zones = { ...faceOverlayDrawOptions.zones, ...partial.zones }
  }
  const { zones: _z, ...rest } = partial
  Object.assign(faceOverlayDrawOptions, rest)
}

export function resetFaceOverlayOptions() {
  faceOverlayDrawOptions = defaultFaceOverlayDrawOptions()
  liveVideoMirrorX = true
}

/** Referencias compartidas por el motor de dibujo (una sesión a la vez). */
let video
let canvas
let ctx
/** Tamaño lógico del canvas (CSS px), para mapeo cover + trazos nítidos con DPR. */
let canvasCssW = 1
let canvasCssH = 1
let R = null
let landmarkSmoothBuf = null
/** Si está definido, `pt()` usa object-fit contain + mirrorX (foto capturada, sin espejo). */
let stillLayout = null
/** En vivo: espejo X solo con cámara frontal (user); cámara trasera (environment) → false. */
let liveVideoMirrorX = true

export function setFaceOverlayLiveMirror(mirror) {
  liveVideoMirrorX = !!mirror
}

// COORDINATE HELPER
// Landmarks are normalized to the *video frame* (videoWidth × videoHeight).
// CSS object-fit:cover scales/crops the video to fill the canvas — we must map
// [0,1]² → canvas pixels with the same transform as the browser, then mirror X
// to match CSS transform: scaleX(-1) on the video.
// ─────────────────────────────────────────────────────────────────────────────
function videoLayout() {
  if (stillLayout) return stillLayout
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const cw = canvasCssW || 1;
  const ch = canvasCssH || 1;
  const scale = Math.max(cw / vw, ch / vh);
  const offsetX = (cw - vw * scale) / 2;
  const offsetY = (ch - vh * scale) / 2;
  return { vw, vh, scale, offsetX, offsetY, mirrorX: liveVideoMirrorX };
}

function pt(lms, i) {
  const l = lms[i];
  const { vw, vh, scale, offsetX, offsetY, mirrorX } = videoLayout();
  const nx = mirrorX ? (1 - l.x) : l.x;
  const ny = l.y;
  return {
    x: nx * vw * scale + offsetX,
    y: ny * vh * scale + offsetY
  };
}
function pts(lms, arr) { return arr.map(i => pt(lms, i)); }

function blendLandmarks(raw) {
  const T = LANDMARK_BLEND;
  if (!landmarkSmoothBuf || landmarkSmoothBuf.length !== raw.length) {
    landmarkSmoothBuf = raw.map(p => ({ x: p.x, y: p.y, z: p.z }));
    return landmarkSmoothBuf;
  }
  for (let i = 0; i < raw.length; i++) {
    landmarkSmoothBuf[i].x = landmarkSmoothBuf[i].x * (1 - T) + raw[i].x * T;
    landmarkSmoothBuf[i].y = landmarkSmoothBuf[i].y * (1 - T) + raw[i].y * T;
    landmarkSmoothBuf[i].z = landmarkSmoothBuf[i].z * (1 - T) + raw[i].z * T;
  }
  return landmarkSmoothBuf;
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAW HELPERS
// ─────────────────────────────────────────────────────────────────────────────
/** Sigue los landmarks al pixel (mejor para ojos/cejas que curvas suaves). */
function polyLinear(points, close=false) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (close) ctx.closePath();
  ctx.stroke();
}

function polySmooth(points, close=true) {
  if (points.length < 2) return;
  ctx.beginPath();
  // Catmull-Rom style via midpoints
  ctx.moveTo((points[0].x + points[1].x)/2, (points[0].y + points[1].y)/2);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i+1].x)/2;
    const my = (points[i].y + points[i+1].y)/2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  if (close) {
    const last = points[points.length-1];
    const first= points[0];
    const mx = (last.x + first.x)/2;
    const my = (last.y + first.y)/2;
    ctx.quadraticCurveTo(last.x, last.y, mx, my);
    ctx.closePath();
  } else {
    ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
  }
  ctx.stroke();
}

/** Suaviza polilínea abierta (fija extremos) — reduce zigzag en perfil. */
function laplaceSmoothOpen(points, passes = 2) {
  if (points.length < 3) return points.slice();
  let out = points.map(p => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < passes; pass++) {
    out = out.map((p, i) => {
      if (i === 0 || i === out.length - 1) return { x: p.x, y: p.y };
      return {
        x: 0.25 * out[i - 1].x + 0.5 * p.x + 0.25 * out[i + 1].x,
        y: 0.25 * out[i - 1].y + 0.5 * p.y + 0.25 * out[i + 1].y
      };
    });
  }
  return out;
}

function laplaceSmoothClosed(points, passes = 2) {
  if (points.length < 3) return points.slice();
  let out = points.map(p => ({ x: p.x, y: p.y }));
  const n = out.length;
  for (let pass = 0; pass < passes; pass++) {
    const next = [];
    for (let i = 0; i < n; i++) {
      const prev = out[(i + n - 1) % n];
      const nxt = out[(i + 1) % n];
      next.push({
        x: 0.25 * prev.x + 0.5 * out[i].x + 0.25 * nxt.x,
        y: 0.25 * prev.y + 0.5 * out[i].y + 0.25 * nxt.y
      });
    }
    out = next;
  }
  return out;
}

function polyStrokeOpen(points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

function polyStrokeClosed(points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();
}

// ─────────────────────────────────────────────────────────────────────────────
// LANDMARK INDEX SETS  (MediaPipe FaceMesh 468 + refine opcional)
// ─────────────────────────────────────────────────────────────────────────────

// TRUE outer silhouette — all 36 contour points MediaPipe provides
const SILHOUETTE = [
  10, 338,297,332,284,251,389,356,454,323,361,288,
  397,365,379,378,400,377,152,148,176,149,150,136,
  172,58,132,93,234,127,162,21,54,103,67,109
];

// Jawline only (bottom half of silhouette)
const JAWLINE = [
  172,136,150,149,176,148,152,377,400,378,379,365,397,288,361,323
];

/** Arco superior frente / línea capilar (temple–vértex–temple). */
const FOREHEAD_ARC = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397]

/**
 * Contorno submentoniano / borde mandibular inferior (papada · referencia clínica).
 * Orden aproximado siguiendo el borde entre mejilla y cuello.
 */
const SUBMENTAL_ARC = [
  234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454,
]

/** Solo el lado visible en perfil (desde vértex hasta mentón), orden frente→mentón. */
const PROFILE_OVAL_LEFT = [
  10, 109, 67, 103, 54, 21, 162, 127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152
];
const PROFILE_OVAL_RIGHT = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152
];
const JAW_PROFILE_LEFT  = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152];
const JAW_PROFILE_RIGHT = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152];

// Ojos — contorno cerrado (orden MediaPipe, sentido consistente)
const L_EYE = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7];
const R_EYE = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382];
// Pliegue palpebral (refuerzo, no cierra)
const L_EYE_CREASE = [27,28,29,30,247];
const R_EYE_CREASE = [257,258,259,260,467];

// Cejas — arco superior de la frente al puente (orden continuo, sin cruzar)
// Ojo izquierdo de la persona (índices altos): 276→…→336 (puente nasal → sien)
const L_BROW = [276,283,282,295,285,300,293,334,296,336];
// Ojo derecho de la persona: 46→…→107
const R_BROW = [46,53,52,65,55,70,63,105,66,107];
// NOSE bridge
const NOSE_BRIDGE = [168,6,197,195,5,4];
/** Perfil: dorso + columela (sin simetría frontal). */
const NOSE_PROFILE_DORSAL = [168, 6, 197, 195, 5, 4, 2];
// Nose tip + alar base
const NOSE_TIP_L  = [129,209,198,237,44,1,274,457,438,439]; // left nostril outer
const NOSE_TIP_R  = [358,294];
// Full nose bottom contour
const NOSE_BOT = [129,102,48,115,220,45,4,275,440,344,278,331,358];

// LIPS outer
const LIPS_OUTER = [
  61,185,40,39,37,0,267,269,270,409,
  291,375,321,405,314,17,84,181,91,146
];
// LIPS inner (philtrum + inner edges)
const LIPS_INNER = [
  78,191,80,81,82,13,312,311,310,415,
  308,324,318,402,317,14,87,178,88,95
];
// Mouth centerline
const MOUTH_LINE = [61,291]; // corners

function xsRangeLm(lms, indices) {
  let mn = 1;
  let mx = 0;
  for (const i of indices) {
    const x = lms[i].x;
    if (x < mn) mn = x;
    if (x > mx) mx = x;
  }
  return mx - mn;
}

/** yaw: nariz más cerca de 234 o de 454. isProfile: giro o un ojo muy comprimido (perfil). */
function getHeadPose(lms) {
  const dl = Math.abs(lms[4].x - lms[234].x);
  const dr = Math.abs(lms[454].x - lms[4].x);
  const yaw = (dr - dl) / (dr + dl + 1e-6);
  const wL = xsRangeLm(lms, L_EYE);
  const wR = xsRangeLm(lms, R_EYE);
  const m = Math.max(wL, wR, 1e-6);
  const visL = wL / m;
  const visR = wR / m;
  const isProfile = Math.abs(yaw) > 0.085 || Math.min(visL, visR) < 0.45;
  const favorL = dl <= dr;
  return { yaw, dl, dr, wL, wR, visL, visR, isProfile, favorL };
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAW ZONES
// ─────────────────────────────────────────────────────────────────────────────

function drawOval(lms, a, w, pose) {
  ctx.strokeStyle = `rgba(242,240,255,${a})`;
  ctx.lineWidth = w * 1.45;
  if (profileOn(pose)) {
    const arr = pose.favorL ? PROFILE_OVAL_LEFT : PROFILE_OVAL_RIGHT;
    polyStrokeOpen(laplaceSmoothOpen(pts(lms, arr), 2));
  } else {
    polyLinear(pts(lms, SILHOUETTE), true);
  }
}

function drawJaw(lms, a, w, pose) {
  ctx.strokeStyle = `rgba(242,240,255,${a * 0.45})`;
  ctx.lineWidth = w * 0.65;
  if (profileOn(pose)) {
    const arr = pose.favorL ? JAW_PROFILE_LEFT : JAW_PROFILE_RIGHT;
    polyStrokeOpen(laplaceSmoothOpen(pts(lms, arr), 2));
  } else {
    polyLinear(pts(lms, JAWLINE), false);
  }
}

function drawForehead(lms, a, w, pose) {
  ctx.strokeStyle = `rgba(235,245,255,${a * 0.92})`;
  ctx.lineWidth = w * 1.08;
  if (profileOn(pose)) {
    const arr = pose.favorL ? PROFILE_OVAL_LEFT.slice(0, 14) : PROFILE_OVAL_RIGHT.slice(0, 14);
    polyStrokeOpen(laplaceSmoothOpen(pts(lms, arr), 1));
  } else {
    polyLinear(pts(lms, FOREHEAD_ARC), false);
  }
}

function drawPapada(lms, a, w, pose) {
  ctx.save();
  ctx.strokeStyle = `rgba(255,230,215,${a * 0.88})`;
  ctx.lineWidth = w * 0.72;
  ctx.setLineDash([5, 4]);
  if (profileOn(pose)) {
    const arr = pose.favorL ? [234, 127, 162, 21, 54, 103, 67, 109, 151, 152, 377] : [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152];
    polyStrokeOpen(laplaceSmoothOpen(pts(lms, arr), 1));
  } else {
    polyLinear(pts(lms, SUBMENTAL_ARC), false);
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawBrows(lms, a, w, pose) {
  const sL = xsRangeLm(lms, L_BROW);
  const sR = xsRangeLm(lms, R_BROW);
  const mx = Math.max(sL, sR, 1e-6);
  ctx.strokeStyle = `rgba(242,240,255,${a})`;
  if (!pose || !pose.isProfile) {
    ctx.lineWidth = w * 1.75;
    polyLinear(pts(lms, L_BROW), false);
    polyLinear(pts(lms, R_BROW), false);
    return;
  }
  if (!profileOn(pose)) {
    ctx.lineWidth = w * 1.75 * (sL / mx);
    polyLinear(pts(lms, L_BROW), false);
    ctx.lineWidth = w * 1.75 * (sR / mx);
    polyLinear(pts(lms, R_BROW), false);
    return;
  }
  const visTh = 0.32;
  if (pose.wL >= pose.wR * visTh) {
    ctx.lineWidth = w * 1.75 * (sL / mx);
    polyStrokeOpen(laplaceSmoothOpen(pts(lms, L_BROW), 1));
  }
  if (pose.wR >= pose.wL * visTh) {
    ctx.lineWidth = w * 1.75 * (sR / mx);
    polyStrokeOpen(laplaceSmoothOpen(pts(lms, R_BROW), 1));
  }
}

function drawEyes(lms, a, w, pose) {
  const m = Math.max(pose.wL, pose.wR, 1e-6);
  ctx.strokeStyle = `rgba(242,240,255,${a})`;
  const visTh = 0.32;
  if (profileOn(pose)) {
    if (pose.wL >= pose.wR * visTh) {
      ctx.lineWidth = w * 1.05 * (pose.wL / m);
      polyStrokeClosed(laplaceSmoothClosed(pts(lms, L_EYE), 2));
    }
    if (pose.wR >= pose.wL * visTh) {
      ctx.lineWidth = w * 1.05 * (pose.wR / m);
      polyStrokeClosed(laplaceSmoothClosed(pts(lms, R_EYE), 2));
    }
  } else {
    ctx.lineWidth = w * 1.05 * (pose.wL / m);
    polyLinear(pts(lms, L_EYE), true);
    ctx.lineWidth = w * 1.05 * (pose.wR / m);
    polyLinear(pts(lms, R_EYE), true);
  }

  if (!pose.isProfile) {
    ctx.lineWidth = w * 0.42 * (pose.wL / m);
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.32})`;
    polyLinear(pts(lms, L_EYE_CREASE.slice(1, 4)), false);
    ctx.lineWidth = w * 0.42 * (pose.wR / m);
    polyLinear(pts(lms, R_EYE_CREASE.slice(1, 4)), false);
  }
}

function drawNose(lms, a, w, pose) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const bridgeTopL = pt(lms, 285);
  const bridgeTopR = pt(lms, 55);
  const alarL = pt(lms, 129);
  const alarR = pt(lms, 358);
  const tipL  = pt(lms, 102);
  const tipR  = pt(lms, 331);
  const tip   = pt(lms, 4);
  const base  = pt(lms, 2);

  const favorL = pose.favorL;

  if (profileOn(pose)) {
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.92})`;
    ctx.lineWidth = w * 0.95;
    polyStrokeOpen(laplaceSmoothOpen(pts(lms, NOSE_PROFILE_DORSAL), 2));

    ctx.lineWidth = w * 0.72;
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.78})`;
    if (favorL) {
      ctx.beginPath();
      ctx.moveTo(bridgeTopL.x, bridgeTopL.y);
      ctx.quadraticCurveTo(pt(lms, 51).x, pt(lms, 51).y, alarL.x, alarL.y);
      ctx.stroke();
      ctx.lineWidth = w * 0.88;
      ctx.strokeStyle = `rgba(242,240,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(alarL.x, alarL.y);
      ctx.quadraticCurveTo(tipL.x, tipL.y + 2, tip.x, tip.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(bridgeTopR.x, bridgeTopR.y);
      ctx.quadraticCurveTo(pt(lms, 281).x, pt(lms, 281).y, alarR.x, alarR.y);
      ctx.stroke();
      ctx.lineWidth = w * 0.88;
      ctx.strokeStyle = `rgba(242,240,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(alarR.x, alarR.y);
      ctx.quadraticCurveTo(tipR.x, tipR.y + 2, tip.x, tip.y);
      ctx.stroke();
    }

    ctx.lineWidth = w * 0.55;
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.55})`;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(pt(lms, 0).x, pt(lms, 0).y);
    ctx.stroke();

    ctx.fillStyle = `rgba(242,240,255,${a * 0.4})`;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, w * 0.38, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (pose.isProfile) {
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.9})`;
    ctx.lineWidth = w * 0.95;
    polyLinear(pts(lms, NOSE_PROFILE_DORSAL), false);

    ctx.lineWidth = w * 0.72;
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.78})`;
    if (favorL) {
      ctx.beginPath();
      ctx.moveTo(bridgeTopL.x, bridgeTopL.y);
      ctx.lineTo(pt(lms, 51).x, pt(lms, 51).y);
      ctx.lineTo(alarL.x, alarL.y);
      ctx.stroke();
      ctx.lineWidth = w * 0.88;
      ctx.strokeStyle = `rgba(242,240,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(alarL.x, alarL.y);
      ctx.quadraticCurveTo(tipL.x, tipL.y + 2, tip.x, tip.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(bridgeTopR.x, bridgeTopR.y);
      ctx.lineTo(pt(lms, 281).x, pt(lms, 281).y);
      ctx.lineTo(alarR.x, alarR.y);
      ctx.stroke();
      ctx.lineWidth = w * 0.88;
      ctx.strokeStyle = `rgba(242,240,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(alarR.x, alarR.y);
      ctx.quadraticCurveTo(tipR.x, tipR.y + 2, tip.x, tip.y);
      ctx.stroke();
    }

    ctx.lineWidth = w * 0.55;
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.55})`;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(pt(lms, 0).x, pt(lms, 0).y);
    ctx.stroke();

    ctx.fillStyle = `rgba(242,240,255,${a * 0.4})`;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, w * 0.38, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.strokeStyle = `rgba(242,240,255,${a * 0.82})`;
  ctx.lineWidth = w * 0.78;
  polyLinear(pts(lms, NOSE_BRIDGE), false);

  ctx.lineWidth = w * 0.72;
  ctx.strokeStyle = `rgba(242,240,255,${a * 0.75})`;
  ctx.beginPath();
  ctx.moveTo(bridgeTopL.x, bridgeTopL.y);
  ctx.lineTo(pt(lms, 51).x, pt(lms, 51).y);
  ctx.lineTo(alarL.x, alarL.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bridgeTopR.x, bridgeTopR.y);
  ctx.lineTo(pt(lms, 281).x, pt(lms, 281).y);
  ctx.lineTo(alarR.x, alarR.y);
  ctx.stroke();

  ctx.lineWidth = w * 0.88;
  ctx.strokeStyle = `rgba(242,240,255,${a})`;
  ctx.beginPath();
  ctx.moveTo(alarL.x, alarL.y);
  ctx.quadraticCurveTo(tipL.x, tipL.y + 3, base.x - 2, base.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(alarR.x, alarR.y);
  ctx.quadraticCurveTo(tipR.x, tipR.y + 3, base.x + 2, base.y);
  ctx.stroke();

  ctx.lineWidth = w * 0.65;
  ctx.strokeStyle = `rgba(242,240,255,${a * 0.65})`;
  ctx.beginPath();
  ctx.moveTo(alarL.x, alarL.y);
  ctx.lineTo(alarR.x, alarR.y);
  ctx.stroke();

  ctx.fillStyle = `rgba(242,240,255,${a * 0.45})`;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, w * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawLips(lms, a, w, pose) {
  ctx.strokeStyle = `rgba(242,240,255,${a})`;
  ctx.lineWidth = w * 1.15;
  if (profileOn(pose)) {
    polyStrokeClosed(laplaceSmoothClosed(pts(lms, LIPS_OUTER), 1));
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.55})`;
    ctx.lineWidth = w * 0.68;
    polyStrokeClosed(laplaceSmoothClosed(pts(lms, LIPS_INNER), 1));
    ctx.lineWidth = w * 0.5;
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.42})`;
    const ml = pose.favorL ? [61, 0, 291] : [291, 0, 61];
    polyStrokeOpen(laplaceSmoothOpen(pts(lms, ml), 1));
  } else {
    polyLinear(pts(lms, LIPS_OUTER), true);
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.55})`;
    ctx.lineWidth = w * 0.68;
    polyLinear(pts(lms, LIPS_INNER), true);
    ctx.lineWidth = w * 0.5;
    ctx.strokeStyle = `rgba(242,240,255,${a * 0.42})`;
    polyLinear(pts(lms, [37, 0, 267]), false);
  }
}

function drawGuides(lms, a, pose) {
  const browY  = (pt(lms, 70).y + pt(lms, 300).y) / 2;
  const eyeY   = (pt(lms, 159).y + pt(lms, 386).y) / 2;
  const noseY  = pt(lms, 4).y;
  const mouthY = pt(lms, 0).y;
  const chinY  = pt(lms, 152).y;
  const topY   = pt(lms, 10).y;

  const lx = pt(lms, 234).x;
  const rx = pt(lms, 454).x;
  const cx = (lx + rx) / 2;
  const nx = pt(lms, 4).x;
  const faceH = Math.max(chinY - topY, 1);
  const pad = profileOn(pose)
    ? Math.max((rx - lx) * 0.18, faceH * 0.14)
    : (rx - lx) * 0.18;

  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 0.55;

  ctx.strokeStyle = `rgba(124,92,191,${a * 0.42})`;
  ctx.beginPath();
  const vx = pose && pose.isProfile ? nx : cx;
  ctx.moveTo(vx, topY - 12);
  ctx.lineTo(vx, chinY + 14);
  ctx.stroke();

  ctx.strokeStyle = `rgba(242,240,255,${a * 0.22})`;
  [browY, eyeY, noseY, mouthY, chinY].forEach(y => {
    ctx.beginPath();
    ctx.moveTo(lx - pad, y);
    ctx.lineTo(rx + pad, y);
    ctx.stroke();
  });

  ctx.strokeStyle = `rgba(124,92,191,${a * 0.14})`;
  if (!pose || !pose.isProfile) {
    [lx, cx, rx].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, topY + 4);
      ctx.lineTo(x, chinY);
      ctx.stroke();
    });
  } else {
    [lx, nx, rx].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, topY + 4);
      ctx.lineTo(x, chinY);
      ctx.stroke();
    });
  }

  ctx.setLineDash([]);
  ctx.restore();
}

function drawMesh(lms, a) {
  ctx.save();
  const sc = typeof faceOverlayDrawOptions.strokeScale === 'number'
    ? Math.min(2.5, Math.max(0.35, faceOverlayDrawOptions.strokeScale))
    : 1
  const dotR = 1.3 * sc
  ctx.fillStyle = `rgba(124,92,191,${a*0.55})`;
  const count = Math.min(lms.length, 468);
  for (let i = 0; i < count; i++) {
    const p = pt(lms, i);
    ctx.beginPath(); ctx.arc(p.x, p.y, dotR, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function drawLabel(x, y, text, color, size = 9) {
  ctx.font = `${size}px "DM Mono", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawSkinZones(lms, a, pose) {
  const top = pt(lms, 10).y;
  const browY = (pt(lms, 70).y + pt(lms, 300).y) / 2;
  const noseY = pt(lms, 4).y;
  const mouthY = pt(lms, 0).y;
  const chinY = pt(lms, 152).y;
  const lx = pt(lms, 234).x;
  const rx = pt(lms, 454).x;
  const cx = (lx + rx) / 2;
  const pad = (rx - lx) * 0.18;
  const prof = pose && pose.isProfile;

  ctx.fillStyle = `rgba(120, 180, 255, ${0.16 * a})`;
  ctx.strokeStyle = `rgba(120, 180, 255, ${0.32 * a})`;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.rect(lx - pad, top, rx - lx + pad * 2, browY - top);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `rgba(255, 190, 120, ${0.14 * a})`;
  ctx.strokeStyle = `rgba(255, 190, 120, ${0.3 * a})`;
  ctx.beginPath();
  ctx.rect(lx - pad, browY, rx - lx + pad * 2, noseY - browY);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `rgba(120, 255, 180, ${0.12 * a})`;
  ctx.strokeStyle = `rgba(120, 255, 180, ${0.28 * a})`;
  if (!prof) {
    ctx.beginPath();
    ctx.rect(lx - pad, noseY, cx - (lx - pad), mouthY - noseY);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(cx, noseY, rx + pad - cx, mouthY - noseY);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.rect(lx - pad, noseY, rx - lx + pad * 2, mouthY - noseY);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = `rgba(255, 220, 140, ${0.14 * a})`;
  ctx.strokeStyle = `rgba(255, 220, 140, ${0.28 * a})`;
  ctx.beginPath();
  ctx.rect(lx - pad, mouthY, rx - lx + pad * 2, chinY - mouthY);
  ctx.fill();
  ctx.stroke();

  const nx = pt(lms, 4).x;
  drawLabel(prof ? nx : cx, (top + browY) / 2, prof ? 'Frente (perfil)' : 'Frente', `rgba(200,220,255,${a})`, 8);
  drawLabel(prof ? nx : cx, (browY + noseY) / 2, 'T / zona central', `rgba(255,220,180,${a})`, 0.65 * 8);
  if (!prof) {
    drawLabel((lx + cx) / 2, (noseY + mouthY) / 2, 'Mej. izq.', `rgba(180,255,200,${a})`, 8);
    drawLabel((cx + rx) / 2, (noseY + mouthY) / 2, 'Mej. der.', `rgba(180,255,200,${a})`, 8);
  } else {
    drawLabel((lx + rx) / 2, (noseY + mouthY) / 2, 'Mejilla (vista lateral)', `rgba(180,255,200,${a})`, 8);
  }
  drawLabel(cx, (mouthY + chinY) / 2, 'Perioral / mentón', `rgba(255,230,180,${a})`, 8);
}

function structureVis(i, pose) {
  if (!pose || !pose.isProfile) return 1;
  if ([168, 8, 4, 152].includes(i)) return 0.95;
  if ([33, 116, 234, 61].includes(i)) return pose.visL;
  if ([263, 345, 454, 291].includes(i)) return pose.visR;
  return 0.85;
}

function drawStructureMap(lms, a, pose) {
  const pts = [
    { i: 168, n: '1', t: 'Glabela' },
    { i: 8, n: '2', t: 'Raíz nasal' },
    { i: 4, n: '3', t: 'Punta nasal' },
    { i: 152, n: '4', t: 'Mentón' },
    { i: 234, n: '5', t: 'Áng. mand. izq' },
    { i: 454, n: '6', t: 'Áng. mand. der' },
    { i: 116, n: '7', t: 'Pómulo izq' },
    { i: 345, n: '8', t: 'Pómulo der' },
    { i: 33, n: '9', t: 'Cant. ojo izq' },
    { i: 263, n: '10', t: 'Cant. ojo der' },
    { i: 61, n: '11', t: 'Comisura izq' },
    { i: 291, n: '12', t: 'Comisura der' }
  ];
  const r0 = 5 + 1.4 * 0.5;
  pts.forEach(({ i, n, t }) => {
    const vis = structureVis(i, pose);
    if (vis < 0.12) return;
    const p = pt(lms, i);
    const r = r0 * Math.max(0.35, vis);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(124, 92, 191, ${0.55 * a * vis})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(242, 240, 255, ${a * vis})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    drawLabel(p.x, p.y - r - 2, n, `rgba(255,255,255,${a * vis})`, 8);
    drawLabel(p.x, p.y + r + 6, t, `rgba(160,160,180,${0.85 * a * vis})`, 6);
  });
}

function drawVascularRef(lms, a, pose) {
  const p61 = pt(lms, 61);
  const p291 = pt(lms, 291);
  const p4 = pt(lms, 4);
  ctx.beginPath();
  ctx.moveTo(p61.x, p61.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.lineTo(p291.x, p291.y);
  ctx.closePath();
  ctx.fillStyle = `rgba(200, 80, 80, ${0.12 * a})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 120, 120, ${0.45 * a})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const tcx = (p61.x + p291.x + p4.x) / 3;
  const tcy = (p61.y + p291.y + p4.y) / 3;
  drawLabel(tcx, tcy - 5, 'Zona de precaución (oral)', `rgba(255,180,160,${a})`, 7);
  drawLabel(tcx, tcy + 5, '/ maxilar — referencia', `rgba(255,180,160,${0.85 * a})`, 6);

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = `rgba(255, 100, 100, ${0.35 * a})`;
  ctx.lineWidth = 1;
  const j234 = pt(lms, 234);
  const j152 = pt(lms, 152);
  const j454 = pt(lms, 454);
  if (!pose || !pose.isProfile) {
    ctx.beginPath();
    ctx.moveTo(j234.x, j234.y);
    ctx.quadraticCurveTo((j234.x + j152.x) / 2, j152.y - 8, j152.x, j152.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(j454.x, j454.y);
    ctx.quadraticCurveTo((j454.x + j152.x) / 2, j152.y - 8, j152.x, j152.y);
    ctx.stroke();
  } else {
    const favorL = pose.dl <= pose.dr;
    ctx.beginPath();
    if (favorL) {
      ctx.moveTo(j234.x, j234.y);
      ctx.quadraticCurveTo((j234.x + j152.x) / 2, j152.y - 8, j152.x, j152.y);
    } else {
      ctx.moveTo(j454.x, j454.y);
      ctx.quadraticCurveTo((j454.x + j152.x) / 2, j152.y - 8, j152.x, j152.y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  drawLabel((j234.x + j454.x) / 2, j152.y - 14, 'Trayectoria aprox. (referencia)', `rgba(255,180,160,${0.7 * a})`, 6);
  drawLabel(pt(lms, 4).x, Math.min(pt(lms, 10).y, j152.y) + 10, 'No es Doppler ni mapa vascular real', `rgba(255,120,120,${0.9 * a})`, 7);
}

function cxFromLms(lms) {
  return (pt(lms, 234).x + pt(lms, 454).x) / 2;
}

function drawSilhouetteHint(lms, a) {
  ctx.save();
  ctx.strokeStyle = `rgba(242,240,255,${0.12 * a})`;
  ctx.lineWidth = 0.9;
  polyLinear(pts(lms, SILHOUETTE), true);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER LOOP
// ─────────────────────────────────────────────────────────────────────────────
/** Solo trazos de zonas (sin malla ni guías). Respeta toggles en `z`. */
function drawSketchZones(lms, a, w, pose, z) {
  if (z.oval) drawOval(lms, a, w, pose);
  if (z.forehead) drawForehead(lms, a, w, pose);
  if (z.brows) drawBrows(lms, a, w, pose);
  if (z.eyes) drawEyes(lms, a, w, pose);
  if (z.nose) drawNose(lms, a, w, pose);
  if (z.lips) drawLips(lms, a, w, pose);
  if (z.jaw) drawJaw(lms, a, w, pose);
  if (z.papada) drawPapada(lms, a, w, pose);
}

/**
 * @param {string} [exportMode] — `'sketch'` solo croquis por zonas · `'mesh'` solo malla · `'guides'` solo guías · omitir = vista completa en vivo
 */
function drawProportionSketchLayer(lms, exportMode) {
  const opts = faceOverlayDrawOptions
  const a = typeof opts.alpha === 'number' ? Math.min(1, Math.max(0.08, opts.alpha)) : 0.88
  const w = 1.4 * (typeof opts.strokeScale === 'number' ? Math.min(2.5, Math.max(0.35, opts.strokeScale)) : 1)
  const z = opts.zones || defaultFaceOverlayDrawOptions().zones

  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const pose = getHeadPose(lms);

  if (false && clinicalType !== 'facial') {
    drawSilhouetteHint(lms, a);
    if (clinicalType === 'skin') drawSkinZones(lms, a, pose);
    else if (clinicalType === 'structure') drawStructureMap(lms, a, pose);
    else if (clinicalType === 'vascular') drawVascularRef(lms, a, pose);
  } else if (exportMode === 'mesh') {
    if (opts.showMesh) drawMesh(lms, a);
  } else if (exportMode === 'guides') {
    if (z.guides) drawGuides(lms, a, pose);
  } else if (exportMode === 'sketch') {
    drawSketchZones(lms, a, w, pose, z);
  } else {
    const ms = !!opts.showMesh
    if (ms) drawMesh(lms, a);
    drawSketchZones(lms, a, w, pose, z);
    if (z.guides) drawGuides(lms, a, pose);
  }
}

function render() {
  if (!ctx) return
  ctx.clearRect(0, 0, canvasCssW, canvasCssH)

  if (R && R.multiFaceLandmarks && R.multiFaceLandmarks[0]) {
    drawProportionSketchLayer(R.multiFaceLandmarks[0]);
  }
}

/**
 * Una pasada de FaceMesh sobre una imagen ya cargada (foto capturada o archivo).
 * @returns {Promise<Array<{x:number,y:number,z?:number}>|null>}
 */
export async function detectFaceMeshOnImage(imageEl) {
  const FM = globalThis.FaceMesh
  if (typeof FM !== 'function' || !imageEl?.naturalWidth) return null
  return new Promise((resolve) => {
    const faceMesh = new FM({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    })
    faceMesh.setOptions(FACEMESH_QUALITY_OPTIONS)
    let finished = false
    let n = 0
    const done = (lm) => {
      if (finished) return
      finished = true
      try {
        faceMesh.close?.()
      } catch { /* */ }
      resolve(lm && lm.length ? lm : null)
    }
    faceMesh.onResults((res) => {
      n += 1
      const lm = res.multiFaceLandmarks?.[0]
      if (lm && lm.length) done(lm)
      else if (n >= 24) done(null)
    })
    faceMesh
      .initialize()
      .then(() => faceMesh.send({ image: imageEl }))
      .catch(() => done(null))
  })
}

/**
 * Dibuja malla + croquis (mismo aspecto que en vivo) sobre un canvas alineado a la foto con object-fit: contain.
 * @param mirrorX false para JPEG capturado del canvas (sin scaleX(-1)).
 */
export function drawMediaPipeGuideOnStillCanvas(canvasEl, landmarks, imgW, imgH, mirrorX = false) {
  if (!canvasEl || !landmarks?.length || !imgW || !imgH) return
  const rect = canvasEl.getBoundingClientRect()
  const cw = Math.max(1, rect.width)
  const ch = Math.max(1, rect.height)
  const dpr = Math.min(2.5, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  canvasEl.width = Math.floor(cw * dpr)
  canvasEl.height = Math.floor(ch * dpr)
  const ctx2 = canvasEl.getContext('2d')
  if (!ctx2) return
  ctx2.setTransform(1, 0, 0, 1, 0, 0)
  ctx2.clearRect(0, 0, canvasEl.width, canvasEl.height)
  ctx2.scale(dpr, dpr)
  if (ctx2.imageSmoothingQuality !== undefined) ctx2.imageSmoothingQuality = 'high'

  const scale = Math.min(cw / imgW, ch / imgH)
  const offsetX = (cw - imgW * scale) / 2
  const offsetY = (ch - imgH * scale) / 2
  const prevStill = stillLayout
  const prevCtx = ctx
  const prevCanvas = canvas
  stillLayout = { vw: imgW, vh: imgH, scale, offsetX, offsetY, mirrorX }
  ctx = ctx2
  canvas = { width: cw, height: ch }
  try {
    drawProportionSketchLayer(landmarks)
  } finally {
    stillLayout = prevStill
    ctx = prevCtx
    canvas = prevCanvas
  }
}

/**
 * Tres PNG a resolución de la foto: croquis (solo capas de zona activas), malla, guías.
 * Las capas respetan `setFaceOverlayOptions` actual (cejas, labios, etc.).
 */
export function exportMediapipeCaptureBundle(imageEl, landmarks, mirrorX = false) {
  const iw = imageEl.naturalWidth
  const ih = imageEl.naturalHeight
  if (!iw || !ih || !landmarks?.length) return null

  const run = (exportMode) => {
    const c = document.createElement('canvas')
    c.width = iw
    c.height = ih
    const x = c.getContext('2d')
    if (!x) return null
    x.drawImage(imageEl, 0, 0, iw, ih)
    const prevS = stillLayout
    const prevCtx = ctx
    const prevCanvas = canvas
    stillLayout = { vw: iw, vh: ih, scale: 1, offsetX: 0, offsetY: 0, mirrorX }
    ctx = x
    canvas = { width: iw, height: ih }
    try {
      drawProportionSketchLayer(landmarks, exportMode)
    } finally {
      stillLayout = prevS
      ctx = prevCtx
      canvas = prevCanvas
    }
    return c.toDataURL('image/png')
  }

  return {
    croquis: run('sketch'),
    malla: run('mesh'),
    guias: run('guides'),
  }
}


export function startFaceProportionOverlay({ video: vEl, canvas: cEl, onStatus }) {
  if (typeof FaceMesh !== "function") {
    onStatus?.("error", new Error("FaceMesh no está disponible (globalThis.FaceMesh)"))
    return { stop() {} }
  }
  video = vEl
  canvas = cEl
  ctx = canvas.getContext("2d")
  R = null
  landmarkSmoothBuf = null
  let faceMesh = null
  let renderRaf = 0
  let sendRaf = 0
  let stopped = false
  let lastVideoTime = -1

  function resize() {
    const parent = video.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    canvasCssW = w
    canvasCssH = h
    const dpr = Math.min(2.5, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    const bw = Math.max(1, Math.floor(w * dpr))
    const bh = Math.max(1, Math.floor(h * dpr))
    canvas.width = bw
    canvas.height = bh
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const c = canvas.getContext('2d')
    if (!c) return
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.scale(dpr, dpr)
    if (c.imageSmoothingQuality !== undefined) c.imageSmoothingQuality = 'high'
    ctx = c
  }

  function renderLoop() {
    if (stopped) return
    render()
    renderRaf = requestAnimationFrame(renderLoop)
  }

  async function sendLoop() {
    if (stopped) return
    try {
      if (video.readyState >= 2) {
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime
          await faceMesh.send({ image: video })
        }
      }
    } catch { /* ignore frame errors */ }
    sendRaf = requestAnimationFrame(sendLoop)
  }

  resize()
  const onResize = () => resize()
  window.addEventListener("resize", onResize)

  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  })
  faceMesh.setOptions(FACEMESH_QUALITY_OPTIONS)
  faceMesh.onResults((res) => {
    if (res.multiFaceLandmarks && res.multiFaceLandmarks[0]) {
      const blended = blendLandmarks(res.multiFaceLandmarks[0])
      R = { ...res, multiFaceLandmarks: [blended] }
      const hp = getHeadPose(blended)
      onStatus?.(hp.isProfile ? "profile" : "tracking")
    } else {
      landmarkSmoothBuf = null
      R = res
      onStatus?.("searching")
    }
  })

  let started = false
  const run = async () => {
    try {
      onStatus?.("loading")
      await faceMesh.initialize()
      started = true
      onStatus?.("ready")
      sendLoop()
      renderLoop()
    } catch (e) {
      onStatus?.("error", e)
      console.warn("[FaceMesh]", e)
    }
  }
  void run()

  return {
    stop() {
      stopped = true
      cancelAnimationFrame(renderRaf)
      cancelAnimationFrame(sendRaf)
      window.removeEventListener("resize", onResize)
      try {
        faceMesh?.close?.()
      } catch { /* */ }
      faceMesh = null
      R = null
      landmarkSmoothBuf = null
      const c = canvas.getContext("2d")
      if (c) {
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.clearRect(0, 0, canvas.width, canvas.height)
      }
    },
  }
}
