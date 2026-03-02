const { createClient } = require('@supabase/supabase-js');

// Récupération des clés secrètes depuis GitHub Actions (Secrets)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const efoyToken = process.env.EFOY_TOKEN;

// Initialisation du lien avec la base de données
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncData() {
    console.log("🚀 Démarrage de la synchronisation...");

    // 1. Lecture de la liste des appareils dans la table 'efoy_devices'
    const { data: deviceList, error: devErr } = await supabase.from('efoy_devices').select('serial_number');
    
    if (devErr) {
        console.error("❌ Erreur de lecture de la liste des appareils :", devErr.message);
        return; 
    }

    // Transformation des données Supabase en un simple tableau de numéros de série
    const devices = deviceList ? deviceList.map(d => d.serial_number) : [];
    
    if (devices.length === 0) {
        console.log("⚠️ Aucun appareil à synchroniser dans la base de données.");
        return;
    }

    console.log(`📡 ${devices.length} EFOY trouvés. Début de la collecte...`);

    // 2. Boucle sur chaque EFOY pour récupérer les données actuelles
    for (const sn of devices) {
        try {
            // Appel API pour la télémesure (Puissance, Voltage, Température...)
            const response = await fetch(`https://api.public.efoy-cloud.com/v1/devices/${sn}`, {
                headers: { 'Authorization': `Bearer ${efoyToken}` }
            });

            if (!response.ok) {
                console.error(`❌ Erreur API EFOY pour ${sn}: Code HTTP ${response.status}`);
                continue;
            }

            const data = await response.json();
            const telemetry = data.latestTelemetry || {};

            // Appel API pour l'état des cartouches (Fuel)
            const cartResponse = await fetch(`https://api.public.efoy-cloud.com/v1/devices/${sn}/cartridges`, {
                headers: { 'Authorization': `Bearer ${efoyToken}` }
            });
            
            let fuel = 0;
            if (cartResponse.ok) {
                const cartData = await cartResponse.json();
                fuel = cartData.totalFuelPercent || 0;
            }

            // 3. Sauvegarde d'un nouveau point d'historique dans 'efoy_history'
            const { error } = await supabase
                .from('efoy_history')
                .insert({
                    serial_number: sn,
                    power: telemetry.powerOutput || 0,
                    current: telemetry.chargingCurrent || 0,
                    fuel: fuel,
                    voltage: telemetry.voltageBattery || 0,
                    temperature: telemetry.efoyTemperature || 0
                });

            if (error) {
                console.error(`❌ Erreur de sauvegarde Supabase pour ${sn}:`, error.message);
            } else {
                console.log(`✅ Historique sauvegardé avec succès pour ${sn}`);
            }

        } catch (err) {
            console.error(`⚠️ Erreur générale lors du traitement de ${sn}:`, err.message);
        }
    }
    console.log("🏁 Synchronisation terminée !");
}

syncData();
