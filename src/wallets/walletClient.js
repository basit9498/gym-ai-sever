

const { initiateDeveloperControlledWalletsClient } = require("@circle-fin/developer-controlled-wallets");

const walletClient = async () => {
    try {
        const client = await initiateDeveloperControlledWalletsClient({
            apiKey: process.env.CIRCLE_API_KEY,
            entitySecret: process.env.CIRCLE_ENTITY_SECRET,
        });
        return client;
    } catch (error) {
        console.error(error);
    }
}

const createWalletSet = async (name,client) => {
    try {
        const walletSet = await client.createWalletSet({ name });
        return walletSet;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

module.exports = {
    walletClient,
    createWalletSet,
}