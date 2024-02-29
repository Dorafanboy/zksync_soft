const ethers= require("ethers");
const SwapBase = require('./swapBase')
const axios = require("axios");

class SyncSwap extends SwapBase {
    constructor(transactionChecker, constants, connector, config, logger) {
        super(transactionChecker)
        this.constants = constants
        this.connector = connector
        this.config = config
        this.logger = logger
    }
    
    async makeSwap(wallet, isEth){
        let gwei = await this.transactionChecker.getGwei()

        while (gwei > this.config.gwei) {
            this.logger.logWithTimestamp(`Газ высокий: ${gwei} gwei`)
            await this.transactionChecker.delay(this.config.minWaitGweiUpdate,
                this.config.maxWaitGweiUpdate)

            gwei = await this.transactionChecker.getGwei()
        }
        
        const classicPoolFactory=
            this.connector.createContractConnection(this.constants.syncSwapPoolFactoryAddress,
                this.constants.poolFactoryAbi)

        const poolAddress = 
            await classicPoolFactory.getPool(this.constants.usdcContractAddress,
                this.constants.syncSwapWethAddress)

        if (poolAddress === ethers.constants.AddressZero) {
            throw Error('Не существует такого пула')
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
            this.logger.errorWithTimestamp(`SyncSwap. Недостаточно баланса на аккаунте ${wallet.address} для свапа 
            ${isEth ? 'из ETH' : 'из USDC'}`)
            return false
        }

        let value = Math.floor(Number(amountToSwap))
        
        const withdrawMode= 1
        
        const swapData = ethers.utils.defaultAbiCoder.encode(
            ["address", "address", "uint8"],
            [isEth ? this.constants.syncSwapWethAddress : this.constants.usdcContractAddress,
                wallet.address, withdrawMode],
        )

        const steps = [{
            pool: poolAddress,
            data: swapData,
            callback: ethers.constants.AddressZero,
            callbackData: '0x',
        }]
        
        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)

        let numberStr = value.toString()

        let modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)

        let modifiedNumber = parseInt(modifiedNumberStr)

        const paths = [{
            steps: steps,
            tokenIn: isEth ? ethers.constants.AddressZero : this.constants.usdcContractAddress,
            amountIn: modifiedNumber.toString(),
        }]
        
        const getAmountRouter= this.connector.createContractConnection(this.constants.spaceRouterAddress,
            this.constants.spaceRouterAbi)

        const router= this.connector.createContractConnection(this.constants.syncSwapRouterAddress,
            this.constants.routerAbi)
        
        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let maxFee = await this.connector.provider.getBlock()
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)
        let response

        let getAmountOut = await getAmountRouter.functions.getAmountsOut(modifiedNumber.toString(),
            [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress])
        
        let bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()
        
        if (isEth === false) {
            this.logger.logWithTimestamp(`Выполняю модуль SyncSwap USDC -> ETH`)
            let allowance = await usdcSigner.functions.allowance(wallet.address, this.constants.syncSwapRouterAddress)
            
            if (allowance.toString() < modifiedNumber) {
                let usdcApprove = await usdcSigner.approve(this.constants.syncSwapRouterAddress,
                    usdcBalance,{ maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                        maxPriorityFeePerGas: feeData.gasPrice})

                this.logger.logWithTimestamp(`Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`)
            }

            await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)

            getAmountOut = await getAmountRouter.functions.getAmountsOut(modifiedNumber.toString(),
                [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress])

            bigNumberValue = ethers.BigNumber.from(getAmountOut.amounts[1]._hex).toNumber()
            
            nonce++
        }
        
        try {
            const min = isEth ? 850000 : 850000;
            const max = isEth ? 900000 : 900000;

            const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
            
            response = await signer.swap(paths, Math.floor(bigNumberValue / 1.1), maxFee.timestamp + 1200,
                {
                    from: wallet.address,
                    nonce: nonce,
                    value: isEth ? modifiedNumber.toString() : 0,
                    maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                    maxPriorityFeePerGas: feeData.gasPrice.toString(),
                    gasLimit: gasLimit,
                })

            this.logger.logWithTimestamp(`SyncSwap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
        ${isEth ? 'SWAP: ETH->USDC на сумму: ' + parseFloat(modifiedNumber / 1e18).toFixed(numbersCount) + ' ETH\n'
                : 'SWAP: USDC->ETH на сумму: ' + parseFloat(modifiedNumber / 1e6).toFixed(6) + ' USDC\n' }`)

            const url = `https://explorer.zksync.io/tx/${response.hash}`
            this.connector.addMessageToBot(`✅SyncSwap: swap ${isEth ? (modifiedNumber / 1e18).toFixed(18 - numbersCount) + ' ETH => USDC'
                : (modifiedNumber / 1e6).toFixed(6) + ' USDC => ETH'} <a href="${url}">link</a>`)
            
            return true
        } catch (error) {
            this.logger.errorWithTimestamp(`SyncSwap. Произошла ошибка ${error.reason}`)
        }
        
        return false
    }
    
    async addLiquidity(wallet, isEth) {
        this.logger.logWithTimestamp(`Выполняю модуль SyncSwap Add Liquidity`)

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
                (this.config.maxStableLiquidityValue - this.config.minStableLiquidityValue)
                + parseFloat(this.config.minStableLiquidityValue)
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
            this.logger.errorWithTimestamp(`Недостаточно баланса для свапа ${isEth ? 'ETH' : 'USDC'} на аккаунте ${wallet.address}`)
            return false
        }

        let value = Math.floor(Number(amountToSwap))
        
        const classicPoolFactory=
            this.connector.createContractConnection(this.constants.syncSwapPoolFactoryAddress,
                this.constants.poolFactoryAbi)

        const poolAddress = await classicPoolFactory.getPool(this.constants.syncSwapWethAddress, 
            this.constants.usdcContractAddress)

        if (poolAddress === ethers.constants.AddressZero) {
            throw Error('Pool not exists');
        }

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let feeData = await this.connector.provider.getFeeData()

        const router= this.connector.createContractConnection(this.constants.syncSwapRouterAddress,
            this.constants.routerAbi)

        let signer = await router.connect(wallet) 

        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)

        let numberStr = value.toString()

        let modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)

        let modifiedNumber = parseInt(modifiedNumberStr)

        const req = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=ethereum%2Cusd&vs_currencies=usd", {
            headers: {
                'User-Agent': this.transactionChecker.userAgent.toString()
            }
        });

        let resp = req.data.ethereum.usd
        let modifiedString = modifiedNumber / 1e6 / resp
        let ethAmount = Math.floor(modifiedString * 1e18)

        let numberStrEth = ethAmount.toString()

        let modifiedNumberStrEth = numberStrEth.slice(0, -8) + "0".repeat(8)

        let modifiedNumberEth = parseInt(modifiedNumberStrEth)
        
        let decoder = new ethers.utils.AbiCoder()
        
        let data = decoder.encode(
            ["address"],
            [wallet.address]
        )

        let usdcApprove = await usdcSigner.approve(this.constants.syncSwapRouterAddress,
            ethers.BigNumber.from(usdcBalance).toNumber(), { maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                maxPriorityFeePerGas: feeData.gasPrice})

        this.logger.logWithTimestamp(`SyncSwap. Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`)
        
        const tokenInputs = [
            { token: this.constants.usdcContractAddress, amount: ethers.BigNumber.from(modifiedNumber) },
            { token: ethers.constants.AddressZero, amount: ethAmount },
        ]
        
        nonce++

        await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)

        let retryCount = 0
        let response
        
        while (retryCount < this.config.retriesCount) {
            try {
                 response = await signer.callStatic.addLiquidity2(poolAddress, tokenInputs, data, 0, ethers.constants.AddressZero, "0x", 
                    {
                        from: wallet.address,
                        nonce: nonce,
                        value: ethAmount,
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: '1200000',
                    })

                if (response.reason == ("INSUFFICIENT_OUTPUT_AMOUNT")) {
                    retryCount++;
                } else {
                    response = await signer.addLiquidity2(poolAddress, tokenInputs, data, 0, ethers.constants.AddressZero, "0x", 
                        {
                            from: wallet.address,
                            nonce: nonce,
                            value: ethAmount,
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: '1200000',
                        })
                    
                    this.logger.logWithTimestamp(`SyncSwap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}
        Добавил в пул ликвидности ${(ethAmount / 1e18).toFixed(8)} ETH + ${(modifiedNumber / 1e6).toFixed(6)} USDC\n'`)

                    const url = `https://explorer.zksync.io/tx/${response.hash}`

                    this.connector.addMessageToBot(`✅SyncSwap: add liquidity ${(ethAmount / 1e18).toFixed(8)} ETH + ${(modifiedNumber / 1e6).toFixed(6)} USDC <a href="${url}">link</a>`)
                    return true
                }
            } catch (error) {
                this.logger.errorWithTimestamp(`SyncSwap. Произошла ошибка ${error}`)
                await this.transactionChecker.delay(0.05, 0.1)
                amountToSwap = getAmountToSwap.call(this) * coef
                amountSwap = Math.floor((this.config.remainingBalanceEth * 1e18) + (amountToSwap))

                if (isEth ? Number(ethBalance) - Number(amountSwap) <= 0 :
                    Number(usdcBalance) - Number(amountToSwap) <= 0) {
                    this.logger.errorWithTimestamp(`Недостаточно баланса для свапа на аккаунте ${wallet.address}`)
                    return false
                }

                value = Math.floor(Number(amountToSwap))
                numberStr = value.toString()
                modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount)
                modifiedNumber = parseInt(modifiedNumberStr)

                numberStrEth = ethAmount.toString()

                modifiedNumberStrEth = numberStrEth.slice(0, -8) + "0".repeat(8)

                modifiedNumberEth = parseInt(modifiedNumberStrEth)

                retryCount++
            }
        }
    }
}

module.exports = SyncSwap