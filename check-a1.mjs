// Surveillance des fermetures de l'A1 entre l'échangeur A104 (Gonesse) et Creil.
// Source : TomTom Traffic (temps réel). Alertes : ntfy (iPhone).
// Lancé toutes les 5 minutes par GitHub Actions (.github/workflows/a1.yml).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CONFIG = {
  // Zone surveillée [ouest, sud, est, nord] : de l'A104 (Gonesse) jusqu'après la sortie 9.
  bbox: [2.42, 48.975, 2.75, 49.36],
  route: 'A1',
  fichierEtat: 'state.json',
};

const { TOMTOM_KEY, NTFY_TOPIC, TEST, MOCK_FILE, DRY_RUN } = process.env;
console.log(`Longueur de la clé TomTom : ${(TOMTOM_KEY ?? '').length} caractères (attendu : 32)`);

// ---------- Récupération des incidents ----------

async function recupererIncidents() {
  if (MOCK_FILE) return JSON.parse(readFileSync(MOCK_FILE, 'utf8')).incidents ?? [];

  const champs = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,'
    + 'magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,'
    + 'length,delay,roadNumbers}}}';
  const url = 'https://api.tomtom.com/traffic/services/5/incidentDetails'
    + `?key=${TOMTOM_KEY}&bbox=${CONFIG.bbox.join(',')}`
    + `&fields=${encodeURIComponent(champs)}&language=fr-FR&timeValidityFilter=present`;

  const rep = await fetch(url);
  if (!rep.ok) throw new Error(`TomTom a répondu ${rep.status} : ${await rep.text()}`);
  return (await rep.json()).incidents ?? [];
}

// ---------- Filtrage : uniquement les fermetures de l'A1 ----------

const CATEGORIE_ROUTE_FERMEE = 8;

export function fermeturesA1(incidents) {
  return incidents.filter(({ properties: p }) => {
    const surA1 = (p.roadNumbers ?? []).some(r => r.replace(/\s/g, '').toUpperCase() === CONFIG.route);
    const fermee = p.iconCategory === CATEGORIE_ROUTE_FERMEE
      || (p.events ?? []).some(e => e.iconCategory === CATEGORIE_ROUTE_FERMEE);
    return surA1 && fermee;
  });
}

// Le sens se déduit de la géométrie : vers le nord = vers Creil/Lille.
export function sens(incident) {
  const c = incident.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2 || !Array.isArray(c[0])) return 'sens inconnu';
  const latDebut = c[0][1];
  const latFin = c[c.length - 1][1];
  return latFin > latDebut ? 'Paris → Creil / Lille' : 'Lille / Creil → Paris';
}

const heure = iso => iso
  ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit' })
  : null;

export function messageFermeture(incident) {
  const p = incident.properties;
  const lignes = [
    `Entre : ${p.from ?? '?'}`,
    `Et : ${p.to ?? '?'}`,
    `Sens : ${sens(incident)}`,
  ];
  const motif = (p.events ?? []).map(e => e.description).filter(Boolean).join(', ');
  if (motif) lignes.push(`Motif : ${motif}`);
  if (p.length) lignes.push(`Longueur : ${(p.length / 1000).toFixed(1)} km`);
  if (heure(p.startTime)) lignes.push(`Depuis : ${heure(p.startTime)}`);
  if (heure(p.endTime)) lignes.push(`Fin prévue : ${heure(p.endTime)}`);
  return { titre: '🚧 A1 FERMÉE', texte: lignes.join('\n'), priorite: 5, tags: ['rotating_light'] };
}

export function messageReouverture(ancien) {
  return {
    titre: '✅ A1 rouverte',
    texte: `Entre : ${ancien.from ?? '?'}\nEt : ${ancien.to ?? '?'}\nSens : ${ancien.sens}`,
    priorite: 3,
    tags: ['white_check_mark'],
  };
}

// ---------- Envoi ntfy ----------

async function envoyer({ titre, texte, priorite, tags }) {
  if (DRY_RUN) {
    console.log(`[NOTIF] ${titre}\n${texte}\n`);
    return;
  }
  // Publication JSON : gère correctement les accents et emojis.
  const rep = await fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: NTFY_TOPIC, title: titre, message: texte, priority: priorite, tags }),
  });
  if (!rep.ok) throw new Error(`ntfy a répondu ${rep.status} : ${await rep.text()}`);
}

// ---------- Programme principal ----------

function lireEtat() {
  if (!existsSync(CONFIG.fichierEtat)) return { actives: {} };
  return JSON.parse(readFileSync(CONFIG.fichierEtat, 'utf8'));
}

async function main() {
  if (!NTFY_TOPIC && !DRY_RUN) throw new Error('NTFY_TOPIC manquant');

  if (TEST === 'true') {
    await envoyer({ titre: '🔔 Test alerte A1', texte: 'Les notifications fonctionnent. Vous serez prévenus si l\'A1 ferme entre Gonesse et Creil.', priorite: 4, tags: ['bell'] });
    console.log('Notification de test envoyée.');
    return;
  }

  if (!TOMTOM_KEY && !MOCK_FILE) throw new Error('TOMTOM_KEY manquant');

  const etat = lireEtat();
  const fermetures = fermeturesA1(await recupererIncidents());
  const actives = {};

  for (const inc of fermetures) {
    const p = inc.properties;
    actives[p.id] = { from: p.from, to: p.to, sens: sens(inc) };
    if (!etat.actives[p.id]) await envoyer(messageFermeture(inc));
  }

  for (const [id, ancien] of Object.entries(etat.actives)) {
    if (!actives[id]) await envoyer(messageReouverture(ancien));
  }

  // La date du jour garantit au moins un commit par jour, pour que GitHub
  // ne désactive pas la surveillance après 60 jours sans activité.
  const jour = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  writeFileSync(CONFIG.fichierEtat, JSON.stringify({ jour, actives }, null, 2) + '\n');
  console.log(`${fermetures.length} fermeture(s) en cours sur l'A1.`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
