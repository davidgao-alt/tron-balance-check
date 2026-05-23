# from web3 import Web3
# from datetime import datetime
# import pytz
# import time
# import json

# ERC20_ABI = [
#     {
#         "constant": True,
#         "inputs": [],
#         "name": "totalSupply",
#         "outputs": [{"name": "", "type": "uint256"}],
#         "type": "function",
#     }
# ]

# CHAINS = {

#     "Ethereum": {
#         "rpc": "https://ethereum-rpc.publicnode.com",
#         "address": "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7",
#     },

#     "Arbitrum": {
#         "rpc": "https://arbitrum-one-rpc.publicnode.com",
#         "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
#     },

#     "Optimism": {
#         "rpc": "https://optimism-rpc.publicnode.com",
#         "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
#     },

#     "Manta": {
#         "rpc": "https://pacific-rpc.manta.network/http",
#         "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
#     },

#     "Mode": {
#         "rpc": "https://mainnet.mode.network",
#         "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
#     },

#     "Blast": {
#         "rpc": "https://rpc.blast.io",
#         "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
#     },

#     "Scroll": {
#         "rpc": "https://rpc.scroll.io",
#         "address": "0x65421ba909200b81640d98B979d07487C9781B66",
#     },

#     "Base": {
#         "rpc": "https://base-rpc.publicnode.com",
#         "address": "0x1Bc71130A0e39942a7658878169764Bbd8A45993",
#     },

#     "Linea": {
#         "rpc": "https://rpc.linea.build",
#         "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
#     },

#     "X Layer": {
#         "rpc": "https://rpc.xlayer.tech",
#         "address": "0x1B3a9A689Ba7555F9D7984D7Ad4025574Ed5A0f9",
#     },

#     "zkSync": {
#         "rpc": "https://mainnet.era.zksync.io",
#         "address": "0x6bE2425C381eb034045b527780D2Bf4E21AB7236",
#     },

#     "Zircuit": {
#         "rpc": "https://mainnet.zircuit.com",
#         "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
#     },

#     "Swellchain": {
#         "rpc": "https://swell-mainnet.alt.technology",
#         "address": "0xc3eACf0612346366Db554C991D7858716db09f58",
#     },

#     "Hemi": {
#         "rpc": "https://rpc.hemi.network/rpc",
#         "address": "0xc3eACf0612346366Db554C991D7858716db09f58",
#     },

#     "Berachain": {
#         "rpc": "https://rpc.berachain.com",
#         "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
#     },

#     "Sonic": {
#         "rpc": "https://rpc.soniclabs.com",
#         "address": "0xd75787bA9ABa324420d522BdA84c08c87e5099b1",
#     },

#     "HyperEVM": {
#         "rpc": "https://rpc.hyperliquid.xyz/evm",
#         "address": "0xa321D2A72DB265c04d5C1318Ed69a719681bBAdE",
#     },

#     "Unichain": {
#         "rpc": "https://unichain-rpc.publicnode.com",
#         "address": "0xc3eACf0612346366Db554C991D7858716db09f58",
#     },

#     "TAC": {
#         "rpc": "https://rpc.tac.build",
#         "address": "0x9eCaf80c1303CCA8791aFBc0AD405c8a35e8d9f1",
#     },

#     "Avalanche": {
#         "rpc": "https://api.avax.network/ext/bc/C/rpc",
#         "address": "0xc430c78Da6E4AF49bD115F0329D154Bb135f1363",
#     },

#     "Ink": {
#         "rpc": "https://rpc-gel.inkonchain.com",
#         "address": "0xc3eACf0612346366Db554C991D7858716db09f58",
#     },

#     "Plasma": {
#         "rpc": "https://rpc.plasma.to",
#         "address": "0x9eCaf80c1303CCA8791aFBc0AD405c8a35e8d9f1",
#     },

#     "Stable": {
#         "rpc": "https://rpc.stable.xyz",
#         "address": "0x9eCaf80c1303CCA8791aFBc0AD405c8a35e8d9f1",
#     },

#     "Mantle": {
#         "rpc": "https://rpc.mantle.xyz",
#         "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
#     },
# }

# hkt = pytz.timezone("Asia/Hong_Kong")

# current_time = datetime.now(hkt)

# results = []

# for chain, config in CHAINS.items():

#     try:

#         w3 = Web3(
#             Web3.HTTPProvider(config["rpc"])
#         )

#         if not w3.is_connected():

#             results.append({
#                 "timestamp_hkt":
#                     current_time.strftime(
#                         "%Y-%m-%d %H:%M:%S"
#                     ),

#                 "chain": chain,

#                 "rpc":
#                     config["rpc"],

#                 "address":
#                     config["address"],

#                 "status":
#                     "rpc_failed"
#             })

#             continue

#         contract = w3.eth.contract(
#             address=Web3.to_checksum_address(
#                 config["address"]
#             ),
#             abi=ERC20_ABI,
#         )

#         raw_supply = (
#             contract.functions
#             .totalSupply()
#             .call()
#         )

#         total_supply = (
#             raw_supply / 1e18
#         )

#         results.append({

#             "timestamp_hkt":
#                 current_time.strftime(
#                     "%Y-%m-%d %H:%M:%S"
#                 ),

#             "chain":
#                 chain,

#             "rpc":
#                 config["rpc"],

#             "address":
#                 config["address"],

#             "raw_supply":
#                 str(raw_supply),

#             "total_supply":
#                 total_supply,

#             "status":
#                 "success",
#         })

#     except Exception as e:

#         results.append({

#             "timestamp_hkt":
#                 current_time.strftime(
#                     "%Y-%m-%d %H:%M:%S"
#                 ),

#             "chain":
#                 chain,

#             "rpc":
#                 config["rpc"],

#             "address":
#                 config["address"],

#             "status":
#                 "error",

#             "error":
#                 str(e),
#         })

#     time.sleep(1)

# print(json.dumps(results))

from web3 import Web3
from datetime import datetime
import pytz
import time
import json


# ---------------------------------------------------
# ERC20 ABI
# ---------------------------------------------------

ERC20_ABI = [
    {
        "constant": True,
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function",
    }
]


# ---------------------------------------------------
# ACTIVE CHAINS ONLY
# ---------------------------------------------------

CHAINS = {

    "Ethereum": {
        "rpc": "https://ethereum-rpc.publicnode.com",
        "address": "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7",
    },

    "Arbitrum": {
        "rpc": "https://arbitrum-one-rpc.publicnode.com",
        "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
    },

    "Base": {
        "rpc": "https://base-rpc.publicnode.com",
        "address": "0x1Bc71130A0e39942a7658878169764Bbd8A45993",
    },

    "Linea": {
        "rpc": "https://rpc.linea.build",
        "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
    },

    "Mantle": {
        "rpc": "https://rpc.mantle.xyz",
        "address": "0x4186BFC76E2E237523CBC30FD220FE055156b41F",
    },

    "Avalanche": {
        "rpc": "https://api.avax.network/ext/bc/C/rpc",
        "address": "0xc430c78Da6E4AF49bD115F0329D154Bb135f1363",
    },

    "Ink": {
        "rpc": "https://rpc-gel.inkonchain.com",
        "address": "0xc3eACf0612346366Db554C991D7858716db09f58",
    },
}


# ---------------------------------------------------
# TIMEZONE
# ---------------------------------------------------

hkt = pytz.timezone("Asia/Hong_Kong")

current_time = datetime.now(hkt)

results = []


# ---------------------------------------------------
# LOOP
# ---------------------------------------------------

for chain, config in CHAINS.items():

    try:

        print(f"\nChecking {chain}...")

        w3 = Web3(
            Web3.HTTPProvider(
                config["rpc"],
                request_kwargs={
                    "timeout": 10
                }
            )
        )

        # -------------------------
        # RPC CHECK
        # -------------------------

        if not w3.is_connected():

            print(f"{chain} RPC FAILED")

            results.append({

                "timestamp_hkt":
                    current_time.strftime(
                        "%Y-%m-%d %H:%M:%S"
                    ),

                "chain":
                    chain,

                "rpc":
                    config["rpc"],

                "address":
                    config["address"],

                "status":
                    "rpc_failed"
            })

            continue

        # -------------------------
        # CONTRACT
        # -------------------------

        contract = w3.eth.contract(

            address=Web3.to_checksum_address(
                config["address"]
            ),

            abi=ERC20_ABI,
        )

        # -------------------------
        # TOTAL SUPPLY
        # -------------------------

        raw_supply = (
            contract.functions
            .totalSupply()
            .call()
        )

        total_supply = raw_supply / 1e18

        print(
            f"{chain} total supply: "
            f"{total_supply:,.2f} rsETH"
        )

        results.append({

            "timestamp_hkt":
                current_time.strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),

            "chain":
                chain,

            "rpc":
                config["rpc"],

            "address":
                config["address"],

            "raw_supply":
                str(raw_supply),

            "total_supply":
                total_supply,

            "status":
                "success",
        })

    except Exception as e:

        print(f"{chain} ERROR")
        print(str(e))

        results.append({

            "timestamp_hkt":
                current_time.strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),

            "chain":
                chain,

            "rpc":
                config["rpc"],

            "address":
                config["address"],

            "status":
                "error",

            "error":
                str(e),
        })

    # -------------------------
    # SMALL DELAY
    # -------------------------

    time.sleep(1)


# ---------------------------------------------------
# FINAL OUTPUT
# ---------------------------------------------------

print("\nFINAL RESULTS:\n")

print(
    json.dumps(
        results,
        indent=2
    )
)