// ============================================================
// 📱 ASSIST WhatsApp Webhook Server (FULL FIXED VERSION)
// ============================================================

const express = require("express");
const fetch = require("node-fetch");

const app = express();

app.use(express.json());

// ============================================================
// CONFIG
// ============================================================

const CONFIG = {
    phoneNumberId: process.env.ID || "1158072170724432",
    accessToken: process.env.TOKEN || "EAAOS2aPmhzYBR5dGgAiTkz5nH5JOoheHnvI45lmOJiF3rnZA1cL6CR3POy3s6gI9mk1lxq3bjtOiBixhSvvFAxcbR6ut6kp2dZArnw3yk7r4TlqRpBbmMzV4YVAmVuFLZCTQ3bN7neJsZAiR6pNqZBmcQWP2341T59RvpG4hJnk4WfqIb5QLvZCYm40H17zXLNQQZDZD",
    verifyToken: process.env.VERIFY || "assist123",
    businessPhone: process.env.PHONE || "919038899962"
};

console.log("====================================");
console.log("🚀 ASSIST WhatsApp Started");
console.log("Phone Number ID:", CONFIG.phoneNumberId);
console.log("Business Phone :", CONFIG.businessPhone);
console.log("====================================");

// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {

    res.json({
        status: "running",
        phone: CONFIG.businessPhone,
        phoneNumberId: CONFIG.phoneNumberId,
        time: new Date()
    });

});

// ============================================================
// WEBHOOK VERIFY
// ============================================================

app.get("/webhook", (req, res) => {

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("Webhook Verification Request");

    if (mode === "subscribe" && token === CONFIG.verifyToken) {

        console.log("Webhook Verified");

        return res.status(200).send(challenge);

    }

    res.status(200).send("Webhook Active");

});

// ============================================================
// RECEIVE MESSAGE
// ============================================================

app.post("/webhook", async (req, res) => {

    console.log("====================================");
    console.log("Incoming Webhook");
    console.log(JSON.stringify(req.body, null, 2));

    try {

        if (
            req.body.entry &&
            req.body.entry[0].changes &&
            req.body.entry[0].changes[0].value.messages
        ) {

            const message = req.body.entry[0].changes[0].value.messages[0];

            const from = message.from;

            const text = message.text ? message.text.body : "";

            console.log("Message From :", from);
            console.log("Message Text :", text);

            const reply = processMessage(text);

            console.log("Reply:");
            console.log(reply);

            await sendWhatsAppMessage(from, reply);

        }

    } catch (err) {

        console.error(err);

    }

    res.sendStatus(200);

});

// ============================================================
// PROCESS MESSAGE
// ============================================================

function processMessage(msg) {

    msg = msg.toLowerCase().trim();

    if (msg == "hi" || msg == "hello" || msg == "help") {

        return `👋 Welcome to Auto Spares Solution!

Send Part Number like

0357

or

Price 0357

or

Stock 0357`;

    }

    const data = [

        {
            part: "0357",
            desc: "Clutch Plate Alto",
            price: 425,
            stock: 18
        },

        {
            part: "0358",
            desc: "Brake Pad Swift",
            price: 550,
            stock: 12
        },

        {
            part: "A40778820",
            desc: "Engine Mounting",
            price: 890,
            stock: 5
        }

    ];

    const found = data.filter(x =>
        x.part.toLowerCase().includes(msg) ||
        x.desc.toLowerCase().includes(msg)
    );

    if (found.length > 0) {

        let reply = "🔍 Product Found\n\n";

        found.forEach(p => {

            reply +=
                "Part : " + p.part +
                "\nDescription : " + p.desc +
                "\nPrice : ₹" + (p.price * 1.18).toFixed(2) +
                "\nStock : " + p.stock +
                "\n\n";

        });

        return reply;

    }

    return "Sorry, product not found.";

}

// ============================================================
// SEND WHATSAPP MESSAGE
// ============================================================

async function sendWhatsAppMessage(to, message) {

    const url =
        `https://graph.facebook.com/v23.0/${CONFIG.phoneNumberId}/messages`;

    console.log("Sending Message...");

    const payload = {

        messaging_product: "whatsapp",

        to: to,

        type: "text",

        text: {

            body: message

        }

    };

    console.log("Payload:");
    console.log(JSON.stringify(payload, null, 2));

    try {

        const response = await fetch(url, {

            method: "POST",

            headers: {

                Authorization: `Bearer ${CONFIG.accessToken}`,

                "Content-Type": "application/json"

            },

            body: JSON.stringify(payload)

        });

        const result = await response.json();

        console.log("====================================");
        console.log("META RESPONSE");
        console.log(JSON.stringify(result, null, 2));
        console.log("====================================");

        if (!response.ok) {

            console.log("Meta returned an error.");

        } else {

            console.log("✅ Message Sent Successfully");

        }

        return result;

    } catch (err) {

        console.log(err);

    }

}

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log("====================================");
    console.log("Server Running On Port", PORT);
    console.log("====================================");

});
