const SwapBase = require('./swapBase')
const ethers = require("ethers");

class Merkly extends SwapBase {
    constructor(transactionChecker, constants, connector, config, logger) {
        super(transactionChecker)
        this.constants = constants
        this.connector = connector
        this.config = config
        this.logger = logger
    }

    async mint(wallet, merklyCount) {
        if (merklyCount.value >= this.config.maxMerklyNft) {
            this.logger.errorWithTimestamp(`Количество нфт заминченых в merkly уже превышает конфиг в размере ${this.config.maxMerklyNft} шт`)
            return false
        }

        let gwei = await this.transactionChecker.getGwei()

        while (gwei > this.config.gwei) {
            this.logger.logWithTimestamp(`Газ высокий: ${gwei} gwei`)
            await this.transactionChecker.delay(this.config.minWaitGweiUpdate,
                this.config.maxWaitGweiUpdate)

            gwei = await this.transactionChecker.getGwei()
        }

        let ethBalance = await this.connector.provider.getBalance(wallet.address)
        
        if (Number(ethBalance) - Math.floor(this.config.remainingBalanceEth * 1e18 + 0.0004 * 1e18) <= 0) {
            this.logger.errorWithTimestamp(`Недостаточно баланса для merkly минта нфт на аккаунте ${wallet.address}`)
            return false
        }

        const router = this.connector.createContractConnection(this.constants.merklyAddress,
            this.constants.merklyAbi)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let maxFee = await this.connector.provider.getBlock()
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)

        const value = Math.floor(0.0004 * 1e18)

        let nftID = await signer.nextMintId()
        
        this.logger.logWithTimestamp(`Выполняю модуль Merkly Mint nft.`)

        let retryCount = 0
        while (retryCount < this.config.retriesCount) {
            try {
                const min = 498000;
                const max = 500000;

                const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
                let response = await signer.callStatic.mint(
                    {
                        from: wallet.address,
                        nonce: nonce,
                        value: value.toString(),
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit, // gwei > 20 ? '950000' : '800000'
                    })
                if (response.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
                    retryCount++
                } else {
                    response = await signer.mint(
                    {
                        from: wallet.address,
                        nonce: nonce,
                        value: value.toString(),
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit, // gwei > 20 ? '950000' : '800000'
                    })

                    this.logger.logWithTimestamp(`Merkly mint. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}\n`)

                    const url = `https://explorer.zksync.io/tx/${response.hash}`;
                    this.connector.addMessageToBot(`✅Merkly mint succesfully <a href="${url}">link</a>`)

                    merklyCount.value++
                    await this.transactionChecker.delay(0.7, 1.3)

                    await this.bridge(wallet, nftID.toString())
                    
                    return 
                }
            } catch (error) {
                this.logger.errorWithTimestamp(`Merkly. Произошла ошибка ${error}`)
                
                retryCount++

                nftID = await signer.nextMintId()
            }
        }
    }

    async bridge(wallet, tokenID) {
        let gwei = await this.transactionChecker.getGwei()

        while (gwei > this.config.gwei) {
            this.logger.logWithTimestamp(`Газ высокий: ${gwei} gwei`)
            await this.transactionChecker.delay(this.config.minWaitGweiUpdate,
                this.config.maxWaitGweiUpdate)

            gwei = await this.transactionChecker.getGwei()
        }

        let ethBalance = await this.connector.provider.getBalance(wallet.address)

        let amountSwap = Math.floor(this.config.remainingBalanceEth * 1e18)

        if (Number(ethBalance) - Number(amountSwap) <= 0) {
            this.logger.errorWithTimestamp(`Недостаточно баланса для merkly бриджа нфт на аккаунте ${wallet.address}`)
            return
        }

        const router = this.connector.createContractConnection(this.constants.merklyAddress,
            this.constants.merklyAbi)

        let nonce = await this.connector.provider.getTransactionCount(wallet.address)
        let maxFee = await this.connector.provider.getBlock()
        let feeData = await this.connector.provider.getFeeData()

        let signer = await router.connect(wallet)

        const values = {
            202: 0.000062270967653343,
            175: 0.000012182662198032,
            173: 0.000203989521578051,
            176: 0.000089173966505655,
            159: 0.000091178613978718,
            109: 0.000214321465772126,
            112: 0.000690528783153948
        };

        const keys = Object.keys(values);
        let randomKey = keys[Math.floor(Math.random() * keys.length)];
        let randomPair = {key: randomKey, value: values[randomKey]}
        let value = Math.floor(randomPair.value * 1e18)

        const adapterParams = '0x00010000000000000000000000000000000000000000000000000000000000061a80'

        this.logger.logWithTimestamp(`Выполняю модуль Merkly Bridge nft.`)
        
        let retryCount = 0
        while (retryCount < this.config.retriesCount) {
            const min = 1071214;
            const max = 1080000;

            const gasLimit = Math.floor(Math.random() * (max - min + 1)) + min;
            try {
                let response = await signer.callStatic.sendFrom(wallet.address, randomPair.key, wallet.address.toLowerCase(), tokenID, wallet.address,
                    '0x0000000000000000000000000000000000000000', adapterParams,
                    {
                        from: wallet.address,
                        nonce: nonce,
                        value: value.toString(),
                        maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                        maxPriorityFeePerGas: feeData.gasPrice.toString(),
                        gasLimit: gasLimit, // gwei > 20 ? '950000' : '800000'
                    })
                
                if (response.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
                    retryCount++
                } else {
                    response = await signer.sendFrom(wallet.address, randomPair.key, wallet.address.toLowerCase(), tokenID, wallet.address,
                        '0x0000000000000000000000000000000000000000', adapterParams,
                        {
                            from: wallet.address,
                            nonce: nonce,
                            value: value.toString(),
                            maxFeePerGas: Math.floor(Number(feeData.gasPrice.toString())),
                            maxPriorityFeePerGas: feeData.gasPrice.toString(),
                            gasLimit: gasLimit, // gwei > 20 ? '950000' : '800000'
                        })

                    this.logger.logWithTimestamp(`Merkly bridge. Транзакция отправлена. Хэш транзакции: https://explorer.zksync.io/tx/${response.hash}\n`)

                    const url = `https://explorer.zksync.io/tx/${response.hash}`;
                    this.connector.addMessageToBot(`✅Merkly bridge succesfully <a href="${url}">link</a>`)
                    
                    return true
                }
            } catch (error) {
                this.logger.errorWithTimestamp(`Merkly bridge. Произошла ошибка ${error}`)
                await this.transactionChecker.delay(0.05, 0.15)
                
                randomKey = keys[Math.floor(Math.random() * keys.length)];
                randomPair = {key: randomKey, value: values[randomKey]}
                value = Math.floor(randomPair.value * 1e18)

                retryCount++
            }
        }
        
        return false
    }
}

module.exports = Merkly