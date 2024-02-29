const SwapBase = require('./swapBase')
const ethers = require("ethers");

class Maverick extends SwapBase {
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
        
        const walletSigner = wallet.connect(this.connector.provider)

        if (isEth ? Number(ethBalance) - Number(amountToSwap) <= Math.floor((this.config.remainingBalanceEth * 1e18)) :
            Number(usdcBalance) - Number(amountToSwap) <= 0) {
            this.logger.errorWithTimestamp(`Maverick. Недостаточно баланса на аккаунте ${wallet.address} для свапа 
            ${isEth ? 'из ETH' : 'из USDC'}`)
            return false
        }

        let value = Math.floor(Number(amountToSwap))

        const router= this.connector.createContractConnection(this.constants.maverickRouterAddress,
            this.constants.maverickAbi)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let maxFee = await this.connector.provider.getBlock()
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)

        const signerKalibur= this.connector.createContractConnection(this.constants.ezkaliburRouterAddress,
            this.constants.ezkaliburRouterAbi)

        let numbersCount = isEth ? Math.floor(Math.random() * (this.config.maxSymbolsEthCount - this.config.minSymbolsEthCount)
            + this.config.minSymbolsEthCount) : Math.floor(Math.random() * (this.config.maxSymbolsStableCount - this.config.minSymbolsStableCount)
            + this.config.minSymbolsStableCount)

        let numberStr = value.toString();

        let modifiedNumberStr = numberStr.slice(0, -numbersCount) + "0".repeat(numbersCount);

        let modifiedNumber = parseInt(modifiedNumberStr);

        if (isEth === false) {
            this.logger.logWithTimestamp(`Выполняю модуль MaverickSwap. USDC -> ETH`)
            
            let allowance = await usdcSigner.functions.allowance(wallet.address, this.constants.maverickRouterAddress)

            if (allowance.toString() <= modifiedNumber) {
                let usdcApprove = await usdcSigner.approve(this.constants.maverickRouterAddress,
                    ethers.BigNumber.from(usdcBalance).toNumber(), {
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice)),
                        maxPriorityFeePerGas: feeData.gasPrice
                    })

                this.logger.logWithTimestamp(`Апрув USDC прошел успешно.Хэш транзакции: https://explorer.zksync.io/tx/${usdcApprove.hash}`
                    .trim())
            }

            await this.transactionChecker.delay(this.config.minApproveDelay, this.config.maxApproveDelay)

            let getAmountOut = await signerKalibur.functions.getAmountsOut(modifiedNumber.toString(),
                [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress])

            let bigNumberValue = ethers.BigNumber.from(getAmountOut[0][1]._hex).toNumber()
            nonce = await this.connector.provider.getTransactionCount(wallet.address)

            const usdcEthPath = '0x3355df6d4c9c3035724fd0e3914de96a5a83aaf441c8cf74c27554a8972d3bf3d2bd4a14d8b604ab5aea5775959fbc2557cc8789bc1bf90a239d9a91'

            let callData = [router.interface.encodeFunctionData('exactInput', [[
                usdcEthPath,
                '0x0000000000000000000000000000000000000000',
                maxFee.timestamp + 1200,
                modifiedNumber,
                Math.floor(bigNumberValue * 0.9)
            ]
            ])
            ]

            callData.push(router.interface.encodeFunctionData('unwrapWETH9', [
                0,
                wallet.address
            ]))

            let multicallData = router.interface.encodeFunctionData('multicall', [callData])

            let retryCount = 0
            while (retryCount < this.config.retriesCount) {
                const min = 780000;
                const max = 800000;

                const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                try {
                    let args = {
                        to: this.constants.maverickRouterAddress,
                        from: wallet.address,
                        value: 0,
                        nonce: nonce,
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit,
                        data: multicallData
                    }

                    let tx = await walletSigner.sendTransaction(args)

                    this.logger.logWithTimestamp(`Maverick swap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${tx.hash}
                 SWAP ${(Math.floor(modifiedNumber) / 1e6)} USDC->ETH\n`)

                    const url = `https://explorer.zksync.io/tx/${tx.hash}`;
                    this.connector.addMessageToBot(`✅Maverick: swap ${parseFloat(modifiedNumber / 1e6).toFixed(6)} USDC => ETH <a href="${url}">link</a>`)

                    return true
                } catch (error) {
                    this.logger.errorWithTimestamp(`Maverick. Произошла ошибка. ${error}`)
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
                    
                    getAmountOut = await signerKalibur.functions.getAmountsOut(modifiedNumber.toString(),
                        [this.constants.usdcContractAddress, this.constants.syncSwapWethAddress])

                    bigNumberValue = ethers.BigNumber.from(getAmountOut[0][1]._hex).toNumber()
                    
                    callData = [router.interface.encodeFunctionData('exactInput', [[
                        usdcEthPath,
                        '0x0000000000000000000000000000000000000000',
                        maxFee.timestamp + 1200,
                        modifiedNumber,
                        Math.floor(bigNumberValue * 0.9)
                    ]
                    ])
                    ]

                    callData.push(router.interface.encodeFunctionData('unwrapWETH9', [
                        0,
                        wallet.address
                    ]))

                    multicallData = router.interface.encodeFunctionData('multicall', [callData])
                }
            }
            
            return false
        }

        this.logger.logWithTimestamp(`Выполняю модуль MaverickSwap. ETH -> USDC`)

        let getAmountOut = await signerKalibur.functions.getAmountsOut(modifiedNumber.toString(),
            [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress])

        let bigNumberValue = ethers.BigNumber.from(getAmountOut[0][1]._hex).toNumber()
        
        const ethUsdcPath = '0x5aea5775959fbc2557cc8789bc1bf90a239d9a9141c8cf74c27554a8972d3bf3d2bd4a14d8b604ab3355df6d4c9c3035724fd0e3914de96a5a83aaf4'
        
        let callData = [router.interface.encodeFunctionData('exactInput', [[
            ethUsdcPath,
            wallet.address,
            maxFee.timestamp + 1200,
            modifiedNumber,
            Math.floor(bigNumberValue * 0.9)
        ]
        ])
        ]
        
        callData.push('0x12210e8a')

        let multicallData = router.interface.encodeFunctionData('multicall', [callData])

        let retryCount = 0
        while (retryCount < this.config.retriesCount) {
            const min = 780000;
            const max = 800000;

            const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
            
            try {
                let args = {
                    to: this.constants.maverickRouterAddress,
                    from: wallet.address,
                    value: modifiedNumber,
                    maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                    maxPriorityFeePerGas: feeData.gasPrice.toString(),
                    gasLimit: gasLimit,
                    data: multicallData
                }

                let tx = await walletSigner.sendTransaction(args)

                this.logger.logWithTimestamp(`Maverick swap. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${tx.hash}
            SWAP ${parseFloat(modifiedNumber / 1e18).toFixed(numbersCount)} ETH->USDC\n`)

                const url = `https://explorer.zksync.io/tx/${tx.hash}`;
                this.connector.addMessageToBot(`✅Maverick: swap ${parseFloat(modifiedNumber / 1e18).toFixed(18 - numbersCount)} ETH => USDC <a href="${url}">link</a>`)
                
                return true
            } catch (error) {
                this.logger.errorWithTimestamp(`Maverick. Произошла ошибка ${error}`)
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

                getAmountOut = await signerKalibur.functions.getAmountsOut(modifiedNumber.toString(),
                    [this.constants.syncSwapWethAddress, this.constants.usdcContractAddress])

                bigNumberValue = ethers.BigNumber.from(getAmountOut[0][1]._hex).toNumber()
                
                callData = [router.interface.encodeFunctionData('exactInput', [[
                    ethUsdcPath,
                    wallet.address,
                    maxFee.timestamp + 1200,
                    modifiedNumber,
                    Math.floor(bigNumberValue * 0.9)
                ]
                ])
                ]

                callData.push('0x12210e8a')

                multicallData = router.interface.encodeFunctionData('multicall', [callData])
            }
        }
        
        return false
    }
}

module.exports = Maverick