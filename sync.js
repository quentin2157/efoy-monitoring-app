const { createClient } = require('@supabase/supabase-js');

// Récupération des clés secrètes depuis GitHub
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const efoyToken = process.env.EFOY_TOKEN;

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncData() {
    console.log("🚀 Démarrage de la synchronisation...");

    // 1. Le robot lit la liste des EFOY depuis votre base Supabase
    const { data: deviceList, error: devErr } = await supabase.from('efoy_devices').select('serial_number');
    
    if (devErr) {
        console.error("❌ Erreur de lecture de la liste des appareils :", devErr.message);
        return; 
    }

    const devices = deviceList ? deviceList.map(d => d.serial_number) : [];
    
    if (devices.length === 0) {
        console.log("⚠️ Aucun appareil à synchroniser dans la base de données.");
        return;
    }

    console.log(`📡 ${devices.length} EFOY trouvés. Début de la collecte...`);

    // 2. Pour chaque EFOY, on interroge l'API et on sauvegarde l'historique
    for (const sn of devices) {
        try {
            const response = await fetch(`https://api.public.efoy-cloud.com/v1/devices/${sn}`, {
                headers: { 'Authorization': `Bearer ${efoyToken}` }
            });

            if (!response.ok) {
                console.error(`❌ Erreur EFOY pour ${sn}: Code ${response.status}`);
                continue;
            }

            const data = await response.json();
            const telemetry = data.latestTelemetry || {};

            const cartResponse = await fetch(`https://api.public.efoy-cloud.com/v1/devices/${sn}/cartridges`, {
                headers: { 'Authorization': `Bearer ${efoyToken}` }
            });
            let fuel = 0;
            if (cartResponse.ok) {
                const cartData = await cartResponse.json();
                fuel = cartData.totalFuelPercent || 0;
            }

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
                console.error(`❌ Erreur Sauvegarde Supabase pour ${sn}:`, error.message);
            } else {
                console.log(`✅ Historique sauvegardé avec succès pour ${sn}`);
            }

        } catch (err) {
            console.error(`⚠️ Erreur générale pour ${sn}:`, err.message);
        }
    }
    console.log("🏁 Synchronisation terminée !");
}

syncData();
