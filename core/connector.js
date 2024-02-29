const ethers= require('ethers')
const {Contract} = require("ethers");

class Connector {
    constructor(provider, telegramBot, userId) {
        this.provider = provider
        this.botMessage = ''
        this.telegramBot = telegramBot
        this.userId = userId
    }

    createContractConnection(address, abi) {
        return new ethers.Contract(address, abi, this.provider)
    }
    
    connectWallet(privateKey) {
        return new ethers.Wallet(privateKey, this.provider)
    }
    
    addMessageToBot(message) {
        this.botMessage += message + ' \n'
    }
    
    sendMessage() {
        this.telegramBot.sendMessage(this.userId, this.botMessage, {parse_mode: "HTML"})
        this.botMessage = ''
    }
    
    createUsdcConnection(address, abi) {
        this.usdcContract = new ethers.Contract(address, abi, this.provider)
    }

    createUsdtConnection(address, abi) {
        this.usdtContract = new ethers.Contract(address, abi, this.provider)
    }

    async stopTelegramBot() {
        await this.telegramBot.stopPolling();
    }
}

module.exports = Connector