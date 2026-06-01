// MINIMAL TEST VERSION - Just to check if script loads
(function() {
    console.log("TEST: Script loaded");
    alert("✅ Dealer Intelligence script loaded successfully!");
    
    window.DealerIntelligence = {
        runFullAnalysis: async function() {
            console.log("TEST: runFullAnalysis called");
            alert("Analysis running...");
            return {
                offersGenerated: 0,
                highDiscountOffers: 0,
                lowStockAlerts: 0,
                areasAnalysed: 0,
                offers: []
            };
        },
        exportOffersCSV: function() { return null; },
        generateWhatsAppMessage: function() { return "Test message"; }
    };
    
    window.addEventListener('load', async () => {
        console.log("TEST: Window loaded");
        alert("Window loaded, running analysis...");
        await window.DealerIntelligence.runFullAnalysis();
    });
})();
