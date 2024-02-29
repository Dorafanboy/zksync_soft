const SwapBase = require('./swapBase')
const ethers = require("ethers");

class Ezkalibur extends SwapBase {
    constructor(transactionChecker, constants, connector, config, logger) {
        super(transactionChecker)
        this.constants = constants
        this.connector = connector
        this.config = config
        this.logger = logger
    }

    async makeSwap(wallet, isEth) {
        let gwei = await this.transactionChecker.getGwei()

        while (gwei > this.config.gwei) {
            this.logger.logWithTimestamp(`Газ высокий: ${gwei} gwei`)
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

        let usdcSigner = await this.connector.usdcContract.connect(wallet)

        let usdcBalance = await usdcSigner.balanceOf(wallet.address)
        
        if (isEth ? Number(ethBalance) - Number(amountToSwap) <= Math.floor((this.config.remainingBalanceEth * 1e18)) :
            Number(usdcBalance) - Number(amountToSwap) <= 0) {          
            this.logger.errorWithTimestamp(`Ezkalibur. Недостаточно баланса на аккаунте ${wallet.address} для свапа 
            ${isEth ? 'из ETH' : 'из USDC'}`)
            return false
        }
        
        let value = Math.floor(Number(amountToSwap))
        
        const router= this.connector.createContractConnection(this.constants.ezkaliburRouterAddress,
            this.constants.ezkaliburRouterAbi)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let maxFee = await this.connector.provider.getBlock()
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)
        
        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)        
        
        let numberStr = value.toString();

        let modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount);

        let modifiedNumber = parseInt(modifiedNumberStr);
        
        if (isEth === false) {
            this.logger.logWithTimestamp(`Выполняю модуль Ezkalibur. USDC -> ETH`)
            
            let allowance = await usdcSigner.functions.allowance(wallet.address, this.constants.ezkaliburRouterAddress)
            
            if (allowance.toString() <= modifiedNumber) {
                let usdcApprove = await usdcSigner.approve(this.constants.ezkaliburRouterAddress,
                    ethers.BigNumber.from(usdcBalance).toNumber(), { maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                        maxPriorityFeePerGas: feeData.gasPrice})

                this.logger.logWithTimestamp(`Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`)
            }

            await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)
            
            try {
                const min = 900000;
                const max = 920000;

                const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                
                const response = await signer.swapExactTokensForETHSupportingFeeOnTransferTokens
                (modifiedNumber, 0, [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress],
                    wallet.address, wallet.address, parseInt(maxFee.timestamp.toString() + "90"),
                    {
                        from: wallet.address,
                        value: isEth ? value.toString() : 0,
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit,
                    },)

                this.logger.logWithTimestamp(`Ezkalibur swap.Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                SWAP ${(Math.floor(modifiedNumber) / 1e6)} USDC->ETH\n`)

                const url = `https://explorer.zksync.io/tx/${response.hash}`
                this.connector.addMessageToBot(`✅EzkaliburSwap: swap ${Math.floor(modifiedNumber) / 1e6} USDC => ETH <a href="${url}">link</a>`)
                
                return true
            } catch (error) {
                this.logger.errorWithTimestamp(`EzkaliburSwap. Произошла ошибка ${error.reason}`)
            }

            return false
        }

        this.logger.logWithTimestamp(`Выполняю модуль Ezkalibur. ETH -> USDC`)

        try {
            let getAmountOut = await signer.functions.getAmountsOut(modifiedNumber.toString(),
                [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress])

            const bigNumberValue = ethers.BigNumber.from(getAmountOut[0][1]._hex).toNumber()

            let amountMin = bigNumberValue > 0 ? Math.floor(bigNumberValue / 1000000) * 1000000 : 0

            const min = 715000;
            const max = 730000;

            const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;

            let response = await signer.swapExactETHForTokensSupportingFeeOnTransferTokens
            (amountMin, [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress], wallet.address,
                wallet.address, parseInt(maxFee.timestamp.toString() + "90"),
                {
                    from: wallet.address,
                    nonce: nonce,
                    value: isEth ? modifiedNumber.toString() : 0,
                    maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                    maxPriorityFeePerGas: feeData.gasPrice.toString(),
                    gasLimit: gasLimit,
                }, )

            this.logger.logWithTimestamp(`EzKalibur swap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
            SWAP ${parseFloat(modifiedNumber / 1e18).toFixed(numbersCount)} ETH -> USDC\n`)

            const url = `https://explorer.zksync.io/tx/${response.hash}`;
            this.connector.addMessageToBot(`✅EzkaliburSwap: swap ${parseFloat(modifiedNumber / 1e18).toFixed(18 - numbersCount)} ETH => USDC <a href="${url}">link</a>`)
            
            return true
        } catch (error) {
            this.logger.errorWithTimestamp(`EzkaliburSwap. Произошла ошибка ${error.reason}`)
        }

        return false
    }
}

module.exports = Ezkalibur