const { createClient } = require('@supabase/supabase-js');

// === VOS CLÉS EN DUR POUR LE ROBOT ===
const SUPABASE_URL = "https://upyglxubsynbsukrfqca.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVweWdseHVic3luYnN1a3JmcWNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NjkyNzQsImV4cCI6MjA4ODA0NTI3NH0.EaZrLBr7v-LW2vsO3SIUeE49Z076_HR7vmEI_Si87Uc";
const EFOY_TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJiYTBiYmY3NC1lMWY0LTQwOWMtYThmNC0wMmE2Mjc0MmNjZDIiLCJpYXQiOjE3NzEyNDg2NTksImF1ZCI6WyJodHRwczovL2FwaS5wdWJsaWMuZWZveS1jbG91ZC5jb20vIl0sImV4cCI6MTc3NjI5MDQwMH0.p4V6ui-vcIPt9EZ0M-ds_BSUTDSkmFfIKPwV_U0T5HVm2dWWIrX9E23rFX0BApe9ea3XXY921Ub7WQwoDJ7DxQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncData() {
    console.log("🚀 Démarrage de la synchronisation...");

    // 1. Lecture de la liste des EFOY depuis votre base
    const { data: deviceList, error: devErr } = await supabase.from('efoy_devices').select('serial_number');
    
    if (devErr) {
        console.error("❌ Erreur de lecture de la liste des appareils :", devErr.message);
        return; 
    }

    const devices = deviceList ? deviceList.map(d => d.serial_number) : [];
    
    if (devices.length === 0) {
        console.log("⚠️ Aucun appareil à synchroniser dans la base de données. Ajoutez-en un depuis l'interface web.");
        return;
    }

    console.log(`📡 ${devices.length} EFOY trouvé(s). Début de la collecte...`);

    // 2. Interrogation API et Sauvegarde
    for (const sn of devices) {
        try {
            const response = await fetch(`https://api.public.efoy-cloud.com/v1/devices/${sn}`, {
                headers: { 'Authorization': `Bearer ${EFOY_TOKEN}` }
            });

            if (!response.ok) {
                console.error(`❌ Erreur API EFOY pour ${sn}: Code ${response.status}`);
                continue;
            }

            const data = await response.json();
            const telemetry = data.latestTelemetry || {};

            const cartResponse = await fetch(`https://api.public.efoy-cloud.com/v1/devices/${sn}/cartridges`, {
                headers: { 'Authorization': `Bearer ${EFOY_TOKEN}` }
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
                console.error(`❌ Erreur Supabase (efoy_history) pour ${sn}:`, error.message);
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
