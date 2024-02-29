const SwapBase = require('./swapBase')
const ethers = require("ethers");

class Orbiter extends SwapBase {
    constructor(transactionChecker, constants, connector, config) {
        super(transactionChecker)
        this.constants = constants
        this.connector = connector
        this.config = config
    }

    async makeBridge(wallet, isEth) {
        let gwei = await this.transactionChecker.getGwei()

        while (gwei > this.config.gwei) {
            console.log(`Газ высокий: ${gwei} gwei`)
            await this.transactionChecker.delay(this.config.minWaitGweiUpdate,
                this.config.maxWaitGweiUpdate)

            gwei = await this.transactionChecker.getGwei()
        }

        function getAmountToSwap() {
            return isEth ? Math.random() * (this.config.maxEthSwapValue - this.config.minEthSwapValue)
                + parseFloat(this.config.minEthSwapValue) : Math.random() *
                (this.config.maxStableSwapValue - this.config.minStableSwapValue)
                + parseFloat(this.config.minStableSwapValue)
        }

        let coef = isEth ? 1e18 : 1e6
        let amountToSwap = getAmountToSwap.call(this) * coef

        let ethBalance = await this.connector.provider.getBalance(wallet.address)

        let usdcContract = this.connector.createContractConnection(this.constants.usdcContractAddress,
            this.constants.usdcAbi)

        let usdcSigner = await usdcContract.connect(wallet)

        let usdcBalance = await usdcSigner.balanceOf(wallet.address)

        let amountSwap= Math.floor((this.config.remainingBalanceEth * 1e18) + (amountToSwap))

        if (isEth ? Number(ethBalance) - Number(amountSwap) <= 0 :
            Number(usdcBalance) - Number(amountToSwap) <= 0) {
            console.log(`Недостаточно баланса для свапа на аккаунте ${wallet.address}`)
            return
        }

        const value = Math.floor(Number(amountToSwap))

        const router= this.connector.createContractConnection(this.constants.orbiterAddress,
            this.constants.eralendAbi)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)

        console.log(value)
        
        let newLastDigits = '9003'; 

        let modifiedNumberStr = value.toString().slice(0, -4) + newLastDigits;

        let modifiedNumber = parseFloat(modifiedNumberStr);
        let addition = 0.0012 * 1e18;
        let result = modifiedNumber + addition;

        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)
        
        let response

        try {
            response = await signer.callStatic.transfer(this.constants.orbiterAddress, result,
                {
                    from: wallet.address,
                    nonce: nonce,
                    value: modifiedNumber,
                    gasLimit: '400000', // gwei > 20 ? '950000' : '800000' 
                })
            
            if (response.reason == ("INSUFFICIENT_OUTPUT_AMOUNT")) {
                console.log("lol")
            } else {
                console.log(`Транзакция отправлена. Хэш транзакциии: https://explorer.zksync.io/tx/${response.hash}. 
        ${isEth ? 'SWAP: ETH->USDC на сумму: ' + parseFloat(value / 1e18).toFixed(18) + ' ETH'
                    : 'SWAP: USDC->ETH на сумму: ' + parseFloat(amountToSwap).toFixed(6) + 'USDC' }`
                    .trim())

                const url = `https://explorer.zksync.io/tx/${response.hash}`
                this.connector.addMessageToBot(`✅Orbiter: bridge ${parseFloat(result / 1e18).toFixed(numbersCount)} ETH <a href="${url}">link</a>`)
                // console.log(response.data)
            }
            
        } catch (error) {
            console.error("Ошибка при вызове mint:", error);
        }
    }
}

module.exports = Orbiter