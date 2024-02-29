const fs = require("fs")

class Constants {
    constructor() {
        this.rpcUrl = 'https://rpc.ankr.com/zksync_era' //https://rpc.ankr.com/zksync_era  https://zksync-era.rpc.thirdweb.com https://zksync.getblock.io/9b1ba88d-f3eb-4420-aa5d-3a4f73654891/mainnet/
        
        this.usdcContractAddress = "0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4"
        this.usdtContractAddress = '0x493257fD37EDB34451f62EDf8D2a0C418852bA4C'
        this.syncSwapWethAddress = "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91"
        this.syncSwapPoolFactoryAddress= '0xf2DAd89f2788a8CD54625C60b55cD3d2D0ACa7Cb'
        this.syncSwapRouterAddress = '0x2da10A1e27bF85cEdD8FFb1AbBe97e53391C0295'
        this.muteSwapRouterAddress = '0x8B791913eB07C32779a16750e3868aA8495F5964'
        this.spaceRouterAddress = '0xbE7D1FD1f6748bbDefC4fbaCafBb11C6Fc506d1d'
        this.zkSwapRouterAddress = '0x18381c0f738146Fb694DE18D1106BdE2BE040Fa4'
        this.fiwooSwapRouterAddress = '0xfd505702b37Ae9b626952Eb2DD736d9045876417'
        this.testAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
        this.ezkaliburRouterAddress = '0x498f7bB59c61307De7dEA005877220e4406470e9'
        this.eralendAddress = '0x22D8b71599e14F20a49a397b88c1C878c86F5579'
        this.velocoreRouterAddress = '0xF29Eb540eEba673f8Fb6131a7C7403C8e4C3f143'
        this.pancakeRouterAddress = '0xf8b59f3c3Ab33200ec80a8A58b2aA5F5D2a8944C'
        this.pancakeFactoryAddress = '0x1BB72E0CbbEA93c08f535fc7856E0338D7F7a8aB'
        this.pancakeQuoterAddress = '0x3d146FcE6c1006857750cBe8aF44f76a28041CCc'
        this.zksyncBridgeAddress = '0x32400084C286CF3E17e7B677ea9583e60a000324'
        this.maverickRouterAddress = '0x39E098A153Ad69834a9Dac32f0FCa92066aD03f4'
        this.merklyAddress = '0x6dd28C2c5B91DD63b4d4E78EcAC7139878371768'
        
        this.orbiterAddress = '0xE4eDb277e41dc89aB076a1F049f4a3EfA700bCE8'
        
        let rawData = fs.readFileSync('abis/usdc_abi.json')
        this.usdcAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/usdt_abi.json')
        this.usdtAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/router.json')
        this.routerAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/pool_factory.json')
        this.poolFactoryAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/pool_abi.json')
        this.poolAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/mute_router_abi.json')
        this.muteRouterAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/space_router_abi.json')
        this.spaceRouterAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/zkswap_router_abi.json')
        this.zkswapRouterAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/fiwooswap_router_abi.json')
        this.fiwooswapRouterAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/ezkalibur_router_abi.json')
        this.ezkaliburRouterAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/eralend_abi.json')
        this.eralendAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/velocore_router_abi.json')
        this.velocoreAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/pancake_factory_abi.json')
        this.pancakeFactoryAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/pancake_quoter_abi.json')
        this.pancakeQuoterAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/pancake_router_abi.json')
        this.pancakeRouterAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/bridge_abi.json')
        this.zkSyncBridgeAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/maverick_abi.json')
        this.maverickAbi = JSON.parse(rawData)

        rawData = fs.readFileSync('abis/merkly_abi.json')
        this.merklyAbi = JSON.parse(rawData)
    }
}

module.exports = Constants