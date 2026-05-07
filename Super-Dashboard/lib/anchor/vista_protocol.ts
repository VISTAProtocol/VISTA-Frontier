/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/vista_protocol.json`.
 */
export type VistaProtocol = {
  "address": "4Jp9E68gcEMUXTwtm7suQ5wKq6U9jDRK4KPuRs6fReCM",
  "metadata": {
    "name": "vistaProtocol",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Vista Protocol — attention monetization core program"
  },
  "instructions": [
    {
      "name": "depositCampaign",
      "docs": [
        "Advertiser deposits USDC into a fresh campaign vault.",
        "`campaign_id` is a 32-byte unique identifier (e.g. keccak256 hash from off-chain)."
      ],
      "discriminator": [
        147,
        204,
        221,
        179,
        194,
        103,
        247,
        152
      ],
      "accounts": [
        {
          "name": "advertiser",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "campaignId"
              }
            ]
          }
        },
        {
          "name": "campaignVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "campaignId"
              }
            ]
          }
        },
        {
          "name": "campaignVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "campaignId"
              }
            ]
          }
        },
        {
          "name": "advertiserToken",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "campaignId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "ratePerSecond",
          "type": "u64"
        },
        {
          "name": "duration",
          "type": "u64"
        }
      ]
    },
    {
      "name": "endStream",
      "docs": [
        "Closes the session and mints a soulbound receipt PDA to the viewer."
      ],
      "discriminator": [
        50,
        224,
        219,
        223,
        210,
        199,
        162,
        115
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "session.session_id",
                "account": "session"
              }
            ]
          }
        },
        {
          "name": "campaign",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "campaign.campaign_id",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "receiptCounter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116,
                  95,
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "receipt_counter.next_id",
                "account": "receiptCounter"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "userVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "receiptCounter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116,
                  95,
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "oracle",
          "type": "pubkey"
        },
        {
          "name": "vistaWallet",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "refundCampaign",
      "docs": [
        "Advertiser pulls remaining budget back and ends the campaign."
      ],
      "discriminator": [
        232,
        19,
        109,
        7,
        229,
        33,
        157,
        226
      ],
      "accounts": [
        {
          "name": "advertiser",
          "writable": true,
          "signer": true
        },
        {
          "name": "campaign",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "campaign.campaign_id",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "campaignVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "campaign.campaign_id",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "campaignVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign.campaign_id",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "advertiserToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "setOracle",
      "discriminator": [
        186,
        128,
        81,
        104,
        74,
        79,
        18,
        224
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "oracle",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setVistaWallet",
      "discriminator": [
        36,
        148,
        232,
        0,
        208,
        254,
        46,
        176
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "vistaWallet",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "startStream",
      "discriminator": [
        12,
        48,
        99,
        2,
        49,
        101,
        104,
        196
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "campaign",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "campaignId"
              }
            ]
          }
        },
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "sessionId"
              }
            ]
          }
        },
        {
          "name": "userWallet"
        },
        {
          "name": "publisherWallet"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "sessionId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "campaignId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "tickStream",
      "docs": [
        "Oracle verifies attention seconds; we deduct from the campaign vault",
        "and split into the user pool (vault) plus protocol fee."
      ],
      "discriminator": [
        57,
        86,
        251,
        99,
        195,
        61,
        126,
        180
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "session",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "session.session_id",
                "account": "session"
              }
            ]
          }
        },
        {
          "name": "campaign",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "campaign.campaign_id",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "campaignVaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "campaign.campaign_id",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "campaignVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  97,
                  109,
                  112,
                  97,
                  105,
                  103,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign.campaign_id",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "userVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vistaWalletToken",
          "writable": true
        },
        {
          "name": "userBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "session.user_wallet",
                "account": "session"
              }
            ]
          }
        },
        {
          "name": "publisherBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "session.publisher_wallet",
                "account": "session"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "secondsElapsed",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "User or publisher pulls their accumulated balance to their own USDC ATA."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "beneficiary",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "userBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "beneficiary"
              }
            ]
          }
        },
        {
          "name": "userVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "vaultAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "beneficiaryToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "campaign",
      "discriminator": [
        50,
        40,
        49,
        11,
        157,
        220,
        229,
        192
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "receipt",
      "discriminator": [
        39,
        154,
        73,
        106,
        80,
        102,
        145,
        153
      ]
    },
    {
      "name": "receiptCounter",
      "discriminator": [
        252,
        91,
        128,
        19,
        180,
        153,
        30,
        93
      ]
    },
    {
      "name": "session",
      "discriminator": [
        243,
        81,
        72,
        115,
        214,
        188,
        72,
        144
      ]
    },
    {
      "name": "userBalance",
      "discriminator": [
        187,
        237,
        208,
        146,
        86,
        132,
        29,
        191
      ]
    }
  ],
  "events": [
    {
      "name": "campaignCreated",
      "discriminator": [
        9,
        98,
        69,
        61,
        53,
        131,
        64,
        152
      ]
    },
    {
      "name": "campaignEnded",
      "discriminator": [
        56,
        96,
        87,
        206,
        66,
        159,
        9,
        213
      ]
    },
    {
      "name": "credited",
      "discriminator": [
        142,
        248,
        247,
        7,
        241,
        250,
        230,
        55
      ]
    },
    {
      "name": "oracleSet",
      "discriminator": [
        115,
        135,
        7,
        243,
        213,
        60,
        174,
        119
      ]
    },
    {
      "name": "receiptMinted",
      "discriminator": [
        100,
        166,
        3,
        33,
        2,
        189,
        140,
        144
      ]
    },
    {
      "name": "streamEnded",
      "discriminator": [
        212,
        151,
        139,
        17,
        232,
        190,
        110,
        107
      ]
    },
    {
      "name": "streamStarted",
      "discriminator": [
        163,
        233,
        127,
        17,
        191,
        151,
        90,
        40
      ]
    },
    {
      "name": "streamTick",
      "discriminator": [
        175,
        4,
        146,
        49,
        99,
        227,
        114,
        112
      ]
    },
    {
      "name": "vistaWalletSet",
      "discriminator": [
        123,
        113,
        215,
        146,
        2,
        16,
        45,
        38
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "zeroAddress",
      "msg": "Zero address provided"
    },
    {
      "code": 6001,
      "name": "zeroAmount",
      "msg": "Amount must be > 0"
    },
    {
      "code": 6002,
      "name": "zeroRate",
      "msg": "Rate must be > 0"
    },
    {
      "code": 6003,
      "name": "zeroDuration",
      "msg": "Duration must be > 0"
    },
    {
      "code": 6004,
      "name": "zeroSeconds",
      "msg": "Seconds elapsed must be > 0"
    },
    {
      "code": 6005,
      "name": "notAdmin",
      "msg": "Caller is not the admin"
    },
    {
      "code": 6006,
      "name": "notOracle",
      "msg": "Caller is not the oracle"
    },
    {
      "code": 6007,
      "name": "notAdvertiser",
      "msg": "Caller is not the campaign advertiser"
    },
    {
      "code": 6008,
      "name": "notOwner",
      "msg": "Caller is not the balance owner"
    },
    {
      "code": 6009,
      "name": "campaignNotActive",
      "msg": "Campaign is not active"
    },
    {
      "code": 6010,
      "name": "campaignExhausted",
      "msg": "Campaign budget exhausted"
    },
    {
      "code": 6011,
      "name": "campaignMismatch",
      "msg": "Campaign id does not match"
    },
    {
      "code": 6012,
      "name": "sessionNotActive",
      "msg": "Session is not active"
    },
    {
      "code": 6013,
      "name": "insufficientBudget",
      "msg": "Insufficient remaining budget"
    },
    {
      "code": 6014,
      "name": "nothingToRefund",
      "msg": "Nothing to refund"
    },
    {
      "code": 6015,
      "name": "nothingToWithdraw",
      "msg": "Nothing to withdraw"
    },
    {
      "code": 6016,
      "name": "wrongVistaWallet",
      "msg": "Vista wallet token account owner mismatch"
    },
    {
      "code": 6017,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "campaign",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaignId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "advertiser",
            "type": "pubkey"
          },
          {
            "name": "totalBudget",
            "type": "u64"
          },
          {
            "name": "remainingBudget",
            "type": "u64"
          },
          {
            "name": "ratePerSecond",
            "type": "u64"
          },
          {
            "name": "duration",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultAuthorityBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "campaignCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaignId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "advertiser",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "ratePerSecond",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "campaignEnded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaignId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "refundedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "vistaWallet",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultAuthorityBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "credited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "sessionId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "campaignId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "role",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "oracleSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracle",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "receipt",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tokenId",
            "type": "u64"
          },
          {
            "name": "sessionId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "userWallet",
            "type": "pubkey"
          },
          {
            "name": "advertiser",
            "type": "pubkey"
          },
          {
            "name": "campaignId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "publisherWallet",
            "type": "pubkey"
          },
          {
            "name": "secondsVerified",
            "type": "u64"
          },
          {
            "name": "usdcPaid",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "receiptCounter",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nextId",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "receiptMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "tokenId",
            "type": "u64"
          },
          {
            "name": "sessionId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "campaignId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "secondsVerified",
            "type": "u64"
          },
          {
            "name": "usdcPaid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "session",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sessionId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "campaignId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "userWallet",
            "type": "pubkey"
          },
          {
            "name": "publisherWallet",
            "type": "pubkey"
          },
          {
            "name": "secondsVerified",
            "type": "u64"
          },
          {
            "name": "totalPaid",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "startedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "streamEnded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sessionId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "secondsVerified",
            "type": "u64"
          },
          {
            "name": "totalPaid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "streamStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sessionId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "campaignId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "userWallet",
            "type": "pubkey"
          },
          {
            "name": "publisherWallet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "streamTick",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sessionId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "userWallet",
            "type": "pubkey"
          },
          {
            "name": "publisherWallet",
            "type": "pubkey"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "userAmount",
            "type": "u64"
          },
          {
            "name": "publisherAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "userBalance",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vistaWalletSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vistaWallet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "usdcMint",
      "type": "pubkey",
      "value": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    }
  ]
};
