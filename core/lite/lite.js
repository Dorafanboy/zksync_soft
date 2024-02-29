const zksync = require('zksync')
const ethers = require('ethers')
const pinataSDK = require('@pinata/sdk')
const fs = require('fs')
const bs58 = require('bs58')

class Lite {
    constructor(connector) {
        this.connector = connector
    }
    
    async mintNFT(privateKey) {
        const pinata = new pinataSDK('fff44b5debee829605ab',
            'f51c682fd8c7f206690d26435f34c9e3fe2939131c06dba61c1855dba665463f')

        pinata.testAuthentication().then((result) => {
            const readFile = fs.createReadStream('./photos/2.jpg')

            const options = {
                pinataMetadata: {
                    name: 'test.png'
                },

                pinataOptions: {
                    cidVersion: 0,
                }
            }

            pinata.pinFileToIPFS(readFile, options).then(async (result) => {
                let syncProvider = await zksync.getDefaultProvider('mainnet')
                const ethersProvider = ethers.getDefaultProvider('mainnet')

                let wallet = new ethers.Wallet(privateKey, ethersProvider)
                const syncWallet = await zksync.Wallet.fromEthSigner(wallet, syncProvider)

                let isSigning = await syncWallet.isSigningKeySet()

                if (isSigning === false) {
                    if ((await syncWallet.getAccountId()) == undefined) {
                        throw new Error('Unknown account');
                    }

                    const changePubkey = await syncWallet.setSigningKey({
                        feeToken: 'ETH',
                        ethAuthType: 'ECDSA'
                    })

                    await changePubkey.awaitReceipt();
                }

                const address = syncWallet.address();
                const fee = await syncProvider.getTransactionFee(
                    "MintNFT",
                    address,
                    'ETH'
                )

                const cidBytes2 = bs58.decode(result.IpfsHash)
                const hashBytes = cidBytes2.slice(2)

                const contentHash = '0x' + Array.from(hashBytes)
                    .map(byte => byte.toString(16).padStart(2, '0')).join('')

                const nft = await syncWallet.mintNFT({
                    recipient: syncWallet.address(),
                    contentHash,
                    feeToken: 'ETH',
                    fee: ethers.BigNumber.from(fee.totalFee._hex.toString()).toNumber()
                })
                
                const hash = nft.txHash.toString().replace("sync-tx:", "0x")
                console.log("Нфт на lite заминчена. Хэш: " + 'https://zkscan.io/explorer/transactions/' + hash)
            })
        })
    }
}

module.exports = Lite
