const ethers= require('ethers')
const TelegramApi = require("node-telegram-bot-api");

class Initializer {
    constructor(rpcUrl, telegramBotToken) {
        this.provider = new ethers.providers.JsonRpcProvider(rpcUrl)
        this.telegramBot = new TelegramApi(telegramBotToken, {polling: true})
    }
}

module.exports = Initializer