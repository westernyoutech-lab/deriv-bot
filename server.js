const WebSocket = require('ws');
const http = require('http'); // Built-in Node HTTP module

// Credentials read securely from Render Environment Variables
const appId = "33UinfoTB9UxIygsat44q"; 
const token = process.env.DERIV_TOKEN; // Read privately from Render
const stake = 10;
const duration = 5; // 5 ticks (standard and fully supported on Volatility Indices!)

let lastTickPrice = null;

// Start a simple HTTP server so Render's health check passes instantly
const port = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running\n');
});
server.listen(port, () => {
    console.log(`HTTP port listener active on port ${port}`);
});

async function startCloudBot() {
    console.log("Starting server-side Deriv v2 cloud bot...");
    
    if (!token) {
        console.error("Error: DERIV_TOKEN environment variable is missing on Render!");
        return;
    }

    console.log("Resolving trading accounts...");

    try {
        // Step 1: Query Accounts from REST API
        const accountsRes = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
            method: 'GET',
            headers: {
                'Deriv-App-ID': appId,
                'Authorization': `Bearer ${token}`
            }
        });

        if (!accountsRes.ok) {
            const errText = await accountsRes.text();
            throw new Error(`Account query failed: ${errText}`);
        }

        const accountsData = await accountsRes.json();
        const accounts = accountsData.data;

        if (!accounts || accounts.length === 0) {
            throw new Error("No Options accounts detected on this profile.");
        }

        const selectedAccount = accounts[0];
        const accountId = selectedAccount.account_id;
        console.log(`Account successfully resolved: ${accountId}`);

        console.log("Requesting authentication OTP...");

        // Step 2: Request WebSocket URL via OTP
        const otpRes = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`, {
            method: 'POST',
            headers: {
                'Deriv-App-ID': appId,
                'Authorization': `Bearer ${token}`
            }
        });

        if (!otpRes.ok) {
            const errText = await otpRes.text();
            throw new Error(`OTP retrieval failed: ${errText}`);
        }

        const otpData = await otpRes.json();
        const wsUrl = otpData.data.url;

        console.log("Connecting to Deriv WebSocket on the cloud...");

        // Step 3: Connect WebSocket
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            console.log("Cloud WebSocket connected! Subscribing to Volatility indices...");
            ws.send(JSON.stringify({ ticks: "R_75" }));
            ws.send(JSON.stringify({ ticks: "R_100" }));
        });

        ws.on('message', (data) => {
            const response = JSON.parse(data);
            
            if (response.msg_type === 'tick') {
                const tick = response.tick;
                console.log(`[${tick.symbol}] Live Price: ${tick.quote}`);
                evaluateStrategy(ws, tick);
            }

            if (response.msg_type === 'buy') {
                if (response.error) {
                    console.log(`[Trade Error] Failed to execute: ${response.error.message}`);
                } else {
                    console.log(`[Executed] Trade placed! Contract ID: ${response.buy.contract_id}`);
                }
            }
        });

        ws.on('close', () => {
            console.log("Cloud connection closed. Reconnecting in 10 seconds...");
            setTimeout(startCloudBot, 10000);
        });

        ws.on('error', (err) => {
            console.error("WebSocket connection encountered an error:", err.message);
        });

    } catch (error) {
        console.error("Bot experienced an execution error:", error.message);
        console.log("Retrying connection handshake in 15 seconds...");
        setTimeout(startCloudBot, 15000);
    }
}

// Basic placeholder strategy rules
function evaluateStrategy(ws, tick) {
    const currentPrice = tick.quote;
    if (!lastTickPrice) {
        lastTickPrice = currentPrice;
        return;
    }

    // Simplified Rise/Fall example trigger
    if (currentPrice > lastTickPrice) {
        executeCloudTrade(ws, tick.symbol, 'CALL');
    }

    lastTickPrice = currentPrice;
}

// Placed directly over the authenticated WebSocket connection
function executeCloudTrade(ws, symbol, contractType) {
    const req = {
        buy: "1", // Corrected to string "1" (NOT integer 1) to pass schema validation
        price: stake,
        parameters: {
            amount: stake,
            basis: 'stake',
            contract_type: contractType,
            currency: 'USD',
            duration: parseInt(duration),
            duration_unit: 't', // Ticks are fully supported on Volatility Indices via WebSocket!
            symbol: symbol
        }
    };
    ws.send(JSON.stringify(req));
}

// Start the server bot
startCloudBot();
