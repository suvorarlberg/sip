import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const evSrc = require('eventsource');
// Holt zielsicher die Funktion, egal wie Node.js das Paket verpackt hat:
global.EventSource = evSrc.default || evSrc.EventSource || evSrc;

import PocketBase from 'pocketbase';

const URL = 'https://api.sip.schuelerunion-vorarlberg.at';
const CLIENTS = 100; // Anzahl der simulierten Laptops im Saal

console.log(`Starte Härtetest mit ${CLIENTS} Verbindungen...`);

for (let i = 1; i <= CLIENTS; i++) {
    setTimeout(async () => {
        const pb = new PocketBase(URL);
        try {
            await pb.collection('sip_state').subscribe('*', function (e) {
                console.log(`[Client ${i}] Update empfangen:`, e.action);
            });
            console.log(`[Client ${i}] Verbunden und wartet auf Updates.`);
        } catch (error) {
            console.error(`[Client ${i}] Fehler bei der Verbindung.`);
        }
    }, i * 50); 
}
