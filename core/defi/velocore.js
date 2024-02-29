const SwapBase = require("./swapBase");
const ethers = require("ethers");

class Velocore extends SwapBase {
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

        let usdcContract = this.connector.createContractConnection(this.constants.usdcContractAddress,
            this.constants.usdcAbi)

        let usdcSigner = await usdcContract.connect(wallet)

        let usdcBalance = await usdcSigner.balanceOf(wallet.address)
        
        if (isEth ? Number(ethBalance) - Number(amountToSwap) <= Math.floor((this.config.remainingBalanceEth * 1e18)) :
            Number(usdcBalance) - Number(amountToSwap) <= 0) {
            this.logger.errorWithTimestamp(`Velocore. Недостаточно баланса на аккаунте ${wallet.address} для свапа 
            ${isEth ? 'из ETH' : 'из USDC'}`)
            return false
        }

        let value = Math.floor(Number(amountToSwap))

        const router = this.connector.createContractConnection(this.constants.velocoreRouterAddress,
            this.constants.velocoreAbi)

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
            this.logger.logWithTimestamp(`Выполняю модуль VelocoreSwap. USDC -> ETH`)
            let allowance = await usdcSigner.functions.allowance(wallet.address, this.constants.velocoreRouterAddress)

            if (allowance.toString() <= modifiedNumber) {
                let usdcApprove = await usdcSigner.approve(this.constants.velocoreRouterAddress,
                    ethers.BigNumber.from(usdcBalance).toNumber(), {
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                        maxPriorityFeePerGas: feeData.gasPrice
                    })

                this.logger.logWithTimestamp(`Апрув USDC прошел успешно. Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`.trim())
                
                nonce++
            }

            let getAmountOut = await signer.getAmountOut(modifiedNumber.toString(),
                this.constants.usdcContractAddress, this.constants.syncSwapWethAddress)

            let bigNumberValue = Math.floor(getAmountOut.amount.toNumber() * 0.9)

            let retryCount = 0
            while (retryCount < this.config.retriesCount) {
                try {
                    const min = 820000;
                    const max = 845000;

                    const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                    let response = await signer.callStatic.swapExactTokensForETH(
                        modifiedNumber, bigNumberValue, [[this.constants.usdcContractAddress, this.constants.syncSwapWethAddress, false]], wallet.address,
                        parseInt(maxFee.timestamp.toString() + "1200"),
                        {
                            from: wallet.address,
                            nonce: nonce,
                            value: 0,
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: gasLimit, // gwei > 20 ? '950000' : '800000'
                        })

                    if (response.reason == ("INSUFFICIENT_OUTPUT_AMOUNT")) {
                        retryCount++
                    } else {
                        response = await signer.swapExactTokensForETH(
                            modifiedNumber, bigNumberValue, [[this.constants.usdcContractAddress, this.constants.syncSwapWethAddress, false]], wallet.address,
                            parseInt(maxFee.timestamp.toString() + "1200"),
                            {
                                from: wallet.address,
                                nonce: nonce,
                                value: 0,
                                maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                                maxPriorityFeePerGas: feeData.gasPrice.toString(),
                                gasLimit: gasLimit, // gwei > 20 ? '950000' : '800000'
                            })

                        this.logger.logWithTimestamp(`Velocore. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                    SWAP ${(Math.floor(modifiedNumber) / 1e6)} USDC->ETH\n`)

                        const url = `https://explorer.zksync.io/tx/${response.hash}`
                        this.connector.addMessageToBot(`✅Velocore: swap ${Math.floor(modifiedNumber) / 1e6} USDC => ETH <a href="${url}">link</a>`)

                        return true
                    }
                } catch (error) {
                    this.logger.errorWithTimestamp(`Velocore. Произошла ошибка ${error}`)
                    await this.transactionChecker.delay(0.05, 0.15)
                    retryCount++

                    amountToSwap = getAmountToSwap.call(this) * coef

                    while (Number(usdcBalance) - Number(amountToSwap) <= 0) {
                        amountToSwap = getAmountToSwap.call(this) * coef
                    }

                    value = Math.floor(Number(amountToSwap))
                    
                    numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
                        + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
                        + this.config.minSymbolsStableCount)

                    numberStr = value.toString();

                    modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount);

                    modifiedNumber = parseInt(modifiedNumberStr);

                    getAmountOut = await signer.getAmountOut(modifiedNumber.toString(),
                        this.constants.usdcContractAddress, this.constants.syncSwapWethAddress)

                    bigNumberValue = Math.floor(getAmountOut.amount.toNumber() * 0.9)
                }
            }
            
            return false
        }

        let getAmountOut = await signer.getAmountOut(modifiedNumber.toString(),
            this.constants.syncSwapWethAddress, this.constants.usdcContractAddress)

        let bigNumberValue = Math.floor(getAmountOut.amount.toNumber() * 0.9)

        this.logger.logWithTimestamp(`Выполняю модуль VelocoreSwap. ETH -> USDC`)

        let retryCount = 0
        while (retryCount < this.config.retriesCount) {
            try {
                const min = 820000;
                const max = 845000;

                const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                let response = await signer.callStatic.swapExactETHForTokens(
                    bigNumberValue, [[this.constants.syncSwapWethAddress, this.constants.usdcContractAddress, false]], wallet.address,
                    parseInt(maxFee.timestamp.toString() + "1200"),
                    {
                        from: wallet.address,
                        nonce: nonce,
                        value: isEth ? modifiedNumber.toString() : 0,
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit, // gwei > 20 ? '950000' : '800000'
                    })

                if (response.reason == ("INSUFFICIENT_OUTPUT_AMOUNT")) {
                    retryCount++
                } else {
                    response = await signer.swapExactETHForTokens(
                        bigNumberValue, [[this.constants.syncSwapWethAddress, this.constants.usdcContractAddress, false]], wallet.address,
                        parseInt(maxFee.timestamp.toString() + "1200"),
                        {
                            from: wallet.address,
                            nonce: nonce,
                            value: isEth ? modifiedNumber.toString() : 0,
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: gasLimit, // gwei > 20 ? '950000' : '800000'
                        })

                    this.logger.logWithTimestamp(`Velocore. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
                 SWAP ${parseFloat(modifiedNumber / 1e18).toFixed(numbersCount)} ETH->USDC\n`)

                    const url = `https://explorer.zksync.io/tx/${response.hash}`
                    this.connector.addMessageToBot(`✅Velocore: swap ${parseFloat(modifiedNumber / 1e18).toFixed(18 - numbersCount)} ETH => USDC <a href="${url}">link</a>`)

                    return true
                }
            } catch (error) {
                this.logger.errorWithTimestamp(`Velocore. Произошла ошибка ${error}`)
                await this.transactionChecker.delay(0.05, 0.15)
                retryCount++

                amountToSwap = getAmountToSwap.call(this) * coef

                while (Number(ethBalance) - Number(amountToSwap) <= 0) {
                    amountToSwap = getAmountToSwap.call(this) * coef
                }

                value = Math.floor(Number(amountToSwap))

                numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
                    + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
                    + this.config.minSymbolsStableCount)

                numberStr = value.toString();

                modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount);

                modifiedNumber = parseInt(modifiedNumberStr);

                getAmountOut = await signer.getAmountOut(modifiedNumber.toString(),
                    this.constants.syncSwapWethAddress, this.constants.usdcContractAddress)

                bigNumberValue = Math.floor(getAmountOut.amount.toNumber() * 0.9)

                getAmountOut = await signer.getAmountOut(modifiedNumber.toString(),
                    this.constants.syncSwapWethAddress, this.constants.usdcContractAddress)

                bigNumberValue = Math.floor(getAmountOut.amount.toNumber() * 0.9)
            }
        }
        
        return false
    }
}

module.exports = Velocore