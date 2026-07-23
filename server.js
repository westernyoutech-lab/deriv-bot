const WebSocket = require('ws');

// Credentials automatically pre-configured
const appId = "33UinfoTB9UxIygsat44q"; 
const token = "pat_97a4d5c569acbac8da72fa9696456aa00f357573fcc1cf11b51adce0f954761d"; 
const stake = 10;
const duration = 5; 

let lastTickPrice = null;

async function startCloudBot() {
    console.log("Starting server-side Deriv v2 cloud bot...");
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
            const errData = await accountsRes.json();
            const errMsg = errData.errors?.[0]?.message || accountsRes.statusText;
            throw new Error(`Account query failed: ${errMsg}`);
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
            const errData = await otpRes.json();
            const errMsg = errData.errors?.[0]?.message || otpRes.statusText;
            throw new Error(`OTP retrieval failed: ${errMsg}`);
        }

        const otpData = await otpRes.json();
        const wsUrl = otpData.data.url;

        console.log("Connecting to Deriv WebSocket on the cloud...");

        // Step 3: Connect WebSocket
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            console.log("Cloud WebSocket connected! Subscribing to market symbols...");
            ws.send(JSON.stringify({ ticks: "BOOM1000" }));
            ws.send(JSON.stringify({ ticks: "CRASH1000" }));
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

function executeCloudTrade(ws, symbol, contractType) {
    const req = {
        buy: "1", // Corrected to string format to resolve the parameters error
        price: stake,
        parameters: {
            amount: stake,
            basis: 'stake',
            contract_type: contractType,
            currency: 'USD',
            duration: parseInt(duration),
            duration_unit: 't',
            symbol: symbol
        }
    };
    ws.send(JSON.stringify(req));
}

// Start the server bot
startCloudBot();
