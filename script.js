const canvas = document.querySelector('#radar-canvas');
const context = canvas.getContext('2d');
const radarPanel = document.querySelector('.radar-panel');
const form = document.querySelector('#coordinate-form');
const coordinateInput = document.querySelector('#coordinate-input');
const errorMessage = document.querySelector('#input-error');
const contacts = [];
const maxRangeKm = 100;
const echoPersistenceMs = 1100;
let sweepAngle = 0;
let sweepRunning = true;
let simulationRunning = false;
let lastFrame = 0;
let lastSimulation = 0;
let lastSweepTick = 0;
let contactSequence = 1;
let canvasSize = 0;
let pixelRatio = 1;

const colors = {
  grid: 'rgba(135, 185, 132, 0.22)',
  gridStrong: 'rgba(151, 207, 141, 0.34)',
  text: 'rgba(179, 204, 177, 0.72)',
  sweep: 'rgba(164, 238, 128, 0.68)',
  echo: '#f4c879',
  echoHalo: 'rgba(244, 200, 121, 0.38)',
  field: '#122019'
};

function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date);
}

function updateClock() {
  const clock = document.querySelector('#clock');
  const updatedAt = document.querySelector('#updated-at');
  const sessionDate = document.querySelector('#session-date');
  if (clock) clock.textContent = `${formatTime()} UTC`;
  if (updatedAt) updatedAt.textContent = `ACTUALIZADO ${formatTime()}`;
  if (sessionDate) {
    sessionDate.textContent = new Intl.DateTimeFormat('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric'
    }).format(new Date()).toUpperCase();
  }
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width) return;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvasSize = bounds.width;
  canvas.width = Math.round(canvasSize * pixelRatio);
  canvas.height = Math.round(canvasSize * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  drawRadar();
}

function drawRadar() {
  if (!canvasSize) return;
  const center = canvasSize / 2;
  const radius = center * 0.88;
  context.clearRect(0, 0, canvasSize, canvasSize);
  context.save();
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = colors.field;
  context.fillRect(0, 0, canvasSize, canvasSize);

  const backgroundGlow = context.createRadialGradient(center, center, radius * 0.04, center, center, radius);
  backgroundGlow.addColorStop(0, 'rgba(68, 111, 65, 0.20)');
  backgroundGlow.addColorStop(1, 'rgba(18, 32, 24, 0.02)');
  context.fillStyle = backgroundGlow;
  context.fillRect(0, 0, canvasSize, canvasSize);

  context.strokeStyle = colors.grid;
  context.lineWidth = 1;
  for (let index = 1; index <= 4; index += 1) {
    context.beginPath();
    context.arc(center, center, radius * index / 4, 0, Math.PI * 2);
    context.stroke();
  }

  context.strokeStyle = colors.gridStrong;
  context.beginPath();
  context.moveTo(center - radius, center);
  context.lineTo(center + radius, center);
  context.moveTo(center, center - radius);
  context.lineTo(center, center + radius);
  context.stroke();

  for (let angle = 30; angle < 360; angle += 30) {
    if (angle % 90 === 0) continue;
    const radians = angle * Math.PI / 180;
    context.strokeStyle = 'rgba(135, 185, 132, 0.10)';
    context.beginPath();
    context.moveTo(center, center);
    context.lineTo(center + Math.sin(radians) * radius, center - Math.cos(radians) * radius);
    context.stroke();
  }

  drawSweep(center, radius);
  drawContacts(center, radius);
  context.restore();

  context.strokeStyle = 'rgba(169, 214, 151, 0.55)';
  context.lineWidth = 1;
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = '#a9ee87';
  context.shadowColor = 'rgba(169, 238, 135, .75)';
  context.shadowBlur = 8;
  context.beginPath();
  context.arc(center, center, 2.5, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  drawRangeLabels(center, radius);
}

function drawSweep(center, radius) {
  if (!sweepRunning) return;
  const angle = sweepAngle * Math.PI / 180;
  const gradient = context.createConicalGradient
    ? context.createConicalGradient(angle - 0.55, center, center)
    : null;
  if (gradient) {
    gradient.addColorStop(0, 'rgba(169, 238, 135, 0)');
    gradient.addColorStop(0.82, 'rgba(169, 238, 135, 0.025)');
    gradient.addColorStop(1, 'rgba(169, 238, 135, 0.20)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvasSize, canvasSize);
  } else {
    context.save();
    context.translate(center, center);
    context.rotate((sweepAngle - 1) * Math.PI / 180);
    const wedge = context.createLinearGradient(0, 0, 0, -radius);
    wedge.addColorStop(0, 'rgba(169, 238, 135, 0)');
    wedge.addColorStop(1, 'rgba(169, 238, 135, 0.15)');
    context.fillStyle = wedge;
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, radius, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.02);
    context.closePath();
    context.fill();
    context.restore();
  }
  context.strokeStyle = colors.sweep;
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(center, center);
  context.lineTo(center + Math.sin(angle) * radius, center - Math.cos(angle) * radius);
  context.stroke();
}

function drawContacts(center, radius) {
  const now = Date.now();
  for (const contact of contacts) {
    if (contact.lastDetectedAt === null) continue;
    const age = now - contact.lastDetectedAt;
    if (age >= echoPersistenceMs) continue;
    const fade = 1 - age / echoPersistenceMs;
    const angle = contact.angle * Math.PI / 180;
    const distance = contact.distance / maxRangeKm * radius;
    const x = center + Math.sin(angle) * distance;
    const y = center - Math.cos(angle) * distance;
    const pulse = 1 + Math.sin(now / 230 + contact.id) * 0.05;

    context.globalAlpha = fade;
    context.fillStyle = colors.echoHalo;
    context.beginPath();
    context.arc(x, y, 8 * pulse, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = colors.echo;
    context.shadowColor = colors.echo;
    context.shadowBlur = 11;
    context.beginPath();
    context.arc(x, y, 2.6, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.globalAlpha = fade * 0.7;
    context.strokeStyle = colors.echo;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, 5.5 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
  }
}

function drawRangeLabels(center, radius) {
  context.fillStyle = colors.text;
  context.font = '8px "DM Mono", monospace';
  context.textAlign = 'left';
  context.textBaseline = 'bottom';
  for (let index = 1; index <= 4; index += 1) {
    const y = center - radius * index / 4;
    context.fillText(`${index * 25}`, center + 4, y - 2);
  }
}

function updateContacts() {
  const count = String(contacts.length).padStart(2, '0');
  document.querySelector('#contact-count').textContent = count;
  document.querySelector('#contact-counter').textContent = count;

  if (!contacts.length) {
    document.querySelector('#contact-list').innerHTML = '<div class="empty-state"><span class="empty-crosshair" aria-hidden="true">⊕</span><span>Sin ecos registrados</span><small>Los nuevos contactos aparecerán aquí</small></div>';
    document.querySelector('#last-echo').innerHTML = '— <small>—</small>';
    document.querySelector('#last-echo-time').textContent = 'sin detecciones';
    return;
  }

  const [latest, ...remaining] = contacts;
  document.querySelector('#last-echo').innerHTML = `${String(latest.angle).padStart(3, '0')}° <small>${latest.distance} km</small>`;
  document.querySelector('#last-echo-time').textContent = `eco ${latest.label} · ${latest.time}`;
  const list = document.querySelector('#contact-list');
  list.replaceChildren(...[latest, ...remaining].slice(0, 8).map((contact) => {
    const row = document.createElement('div');
    row.className = 'contact-item';
    row.innerHTML = `<span class="contact-symbol" aria-hidden="true">⌖</span><span><span class="contact-primary"><span class="contact-id">${contact.label}</span><span class="contact-coordinate">${String(contact.angle).padStart(3, '0')}°</span></span><span class="contact-time">${contact.time} UTC · SEÑAL CONFIRMADA</span></span><span class="contact-distance">${contact.distance} km</span>`;
    return row;
  }));
}

function registerContact(angle, distance) {
  const contact = {
    id: contactSequence,
    label: `E-${String(contactSequence).padStart(3, '0')}`,
    angle,
    distance,
    time: formatTime(),
    createdAt: Date.now(),
    lastDetectedAt: null
  };
  contactSequence += 1;
  contacts.unshift(contact);
  updateContacts();
  drawRadar();
}

function parseCoordinate(rawValue) {
  const match = rawValue.trim().match(/^([+-]?\d+(?:[.,]\d+)?)\s*[,;\s]\s*([+-]?\d+(?:[.,]\d+)?)$/);
  if (!match) return { error: 'Formato inválido. Escribe ángulo, distancia. Ejemplo: 045, 32.' };
  const angle = Number(match[1].replace(',', '.'));
  const distance = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(angle) || !Number.isFinite(distance)) return { error: 'Introduce valores numéricos válidos.' };
  if (angle < 0 || angle > 360) return { error: 'El ángulo debe estar entre 0° y 360°.' };
  if (distance <= 0 || distance > maxRangeKm) return { error: 'La distancia debe ser mayor que 0 y no superar 100 km.' };
  return { angle: angle % 360, distance: Math.round(distance * 10) / 10 };
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const result = parseCoordinate(coordinateInput.value);
  if (result.error) {
    errorMessage.textContent = result.error;
    coordinateInput.setAttribute('aria-invalid', 'true');
    coordinateInput.focus();
    return;
  }
  errorMessage.textContent = '';
  coordinateInput.removeAttribute('aria-invalid');
  registerContact(result.angle, result.distance);
  coordinateInput.value = '';
  coordinateInput.focus();
});

coordinateInput.addEventListener('input', () => {
  errorMessage.textContent = '';
  coordinateInput.removeAttribute('aria-invalid');
});

document.querySelector('#random-button').addEventListener('click', () => {
  const angle = Math.floor(Math.random() * 360);
  const distance = Math.floor(Math.random() * 92) + 5;
  registerContact(angle, distance);
});

document.querySelector('#clear-button').addEventListener('click', () => {
  contacts.length = 0;
  updateContacts();
  drawRadar();
});

document.querySelector('#simulation-toggle').addEventListener('click', (event) => {
  simulationRunning = !simulationRunning;
  const button = event.currentTarget;
  button.setAttribute('aria-checked', String(simulationRunning));
  document.querySelector('#simulation-copy').textContent = simulationRunning ? 'Emitiendo ecos cada 2 s' : 'Genera ecos aleatorios';
});

radarPanel.addEventListener('dblclick', () => {
  sweepRunning = !sweepRunning;
  radarPanel.classList.toggle('paused', !sweepRunning);
  const sweepState = document.querySelector('#sweep-state');
  const systemStatus = document.querySelector('#system-status');
  if (sweepState) sweepState.textContent = sweepRunning ? 'ACTIVO' : 'PAUSA';
  if (systemStatus) systemStatus.textContent = sweepRunning ? 'SISTEMA ACTIVO' : 'BARRIDO EN PAUSA';
  drawRadar();
});

function animate(timestamp) {
  if (timestamp - lastFrame > 45) {
    lastFrame = timestamp;
    if (timestamp - lastSweepTick > 1000) {
      lastSweepTick = timestamp;
      const activeContacts = contacts.filter((contact) => Date.now() - contact.createdAt < 90000);
      if (activeContacts.length !== contacts.length) {
        contacts.splice(0, contacts.length, ...activeContacts);
        updateContacts();
      }
    }
    if (sweepRunning) {
      const previousAngle = sweepAngle;
      sweepAngle = (sweepAngle + 1.25) % 360;
      const crossedContact = (contact) => previousAngle < sweepAngle
        ? contact.angle > previousAngle && contact.angle <= sweepAngle
        : contact.angle > previousAngle || contact.angle <= sweepAngle;
      const detectionTime = Date.now();
      for (const contact of contacts) {
        if (crossedContact(contact)) contact.lastDetectedAt = detectionTime;
      }
      document.querySelector('#radar-readout').innerHTML = `AZ ${String(Math.round(sweepAngle)).padStart(3, '0')}° <span>·</span> 100 km`;
    }
    if (simulationRunning && timestamp - lastSimulation > 2000) {
      lastSimulation = timestamp;
      registerContact(Math.floor(Math.random() * 360), Math.floor(Math.random() * 95) + 5);
    }
    drawRadar();
  }
  requestAnimationFrame(animate);
}

new ResizeObserver(resizeCanvas).observe(canvas);
window.addEventListener('resize', resizeCanvas);
updateClock();
setInterval(updateClock, 1000);
resizeCanvas();
requestAnimationFrame(animate);
