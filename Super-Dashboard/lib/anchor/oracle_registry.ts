/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/oracle_registry.json`.
 */
export type OracleRegistry = {
  "address": "Arf7oEFm7jjaUXYW8of4moy553kczWXxdtf1bDSRpynn",
  "metadata": {
    "name": "oracleRegistry",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Vista oracle registry — staking, rewards, and slashing"
  },
  "instructions": [
    {
      "name": "claimRewards",
      "discriminator": [
        4,
        144,
        132,
        71,
        116,
        23,
        151,
        80
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "oracleNode",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  110,
                  111,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "oracle"
              }
            ]
          }
        },
        {
          "name": "rewardVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
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
          "name": "rewardAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
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
          "name": "oracleToken",
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
      "name": "creditReward",
      "docs": [
        "Adds to oracle's claimable USDC reward balance. Only callable via CPI",
        "by the attention_aggregator (after it has deposited the corresponding",
        "USDC into the RewardVault)."
      ],
      "discriminator": [
        46,
        66,
        65,
        169,
        234,
        253,
        134,
        14
      ],
      "accounts": [
        {
          "name": "aggregatorSigner",
          "docs": [
            "the instruction handler against `registry.attention_aggregator`."
          ],
          "signer": true
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "oracleNode",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  110,
                  111,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "oracle_node.oracle",
                "account": "oracleNode"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "amount",
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
        }
      ]
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
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "stakeAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
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
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
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
          "name": "rewardAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
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
          "name": "rewardVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
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
          "name": "attentionAggregator",
          "type": "pubkey"
        },
        {
          "name": "minStake",
          "type": "u64"
        },
        {
          "name": "slashBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "registerOracle",
      "discriminator": [
        176,
        200,
        234,
        37,
        199,
        129,
        164,
        111
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "oracleNode",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  110,
                  111,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "oracle"
              }
            ]
          }
        },
        {
          "name": "oracleToken",
          "writable": true
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
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
          "name": "stakeAmount",
          "type": "u64"
        },
        {
          "name": "endpointUrl",
          "type": "string"
        }
      ]
    },
    {
      "name": "setAttentionAggregator",
      "discriminator": [
        34,
        175,
        174,
        41,
        87,
        15,
        253,
        71
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "attentionAggregator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "slashOracle",
      "docs": [
        "Reduces an oracle's stake. Only callable via CPI by the",
        "attention_aggregator program (verified through the aggregator_signer PDA)."
      ],
      "discriminator": [
        69,
        85,
        18,
        20,
        205,
        99,
        149,
        145
      ],
      "accounts": [
        {
          "name": "aggregatorSigner",
          "docs": [
            "the instruction handler against `registry.attention_aggregator`."
          ],
          "signer": true
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "oracleNode",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  110,
                  111,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "oracle_node.oracle",
                "account": "oracleNode"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unregisterOracle",
      "discriminator": [
        194,
        227,
        34,
        162,
        109,
        68,
        241,
        230
      ],
      "accounts": [
        {
          "name": "oracle",
          "signer": true
        },
        {
          "name": "oracleNode",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  110,
                  111,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "oracle"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "withdrawStake",
      "discriminator": [
        153,
        8,
        22,
        138,
        105,
        176,
        87,
        66
      ],
      "accounts": [
        {
          "name": "oracle",
          "writable": true,
          "signer": true
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "oracleNode",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
                  101,
                  95,
                  110,
                  111,
                  100,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "oracle"
              }
            ]
          }
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
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
          "name": "stakeAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
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
          "name": "oracleToken",
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
      "name": "oracleNode",
      "discriminator": [
        195,
        27,
        202,
        198,
        19,
        15,
        47,
        144
      ]
    },
    {
      "name": "registry",
      "discriminator": [
        47,
        174,
        110,
        246,
        184,
        182,
        252,
        218
      ]
    }
  ],
  "events": [
    {
      "name": "aggregatorSet",
      "discriminator": [
        229,
        188,
        27,
        217,
        5,
        98,
        99,
        82
      ]
    },
    {
      "name": "oracleRegistered",
      "discriminator": [
        97,
        225,
        241,
        71,
        180,
        49,
        38,
        60
      ]
    },
    {
      "name": "oracleSlashed",
      "discriminator": [
        30,
        99,
        31,
        243,
        134,
        150,
        17,
        111
      ]
    },
    {
      "name": "oracleUnregistered",
      "discriminator": [
        37,
        195,
        75,
        143,
        206,
        96,
        241,
        111
      ]
    },
    {
      "name": "rewardCredited",
      "discriminator": [
        21,
        16,
        94,
        56,
        44,
        11,
        160,
        202
      ]
    },
    {
      "name": "rewardsClaimed",
      "discriminator": [
        75,
        98,
        88,
        18,
        219,
        112,
        88,
        121
      ]
    },
    {
      "name": "stakeWithdrawn",
      "discriminator": [
        33,
        120,
        159,
        58,
        140,
        255,
        174,
        79
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notAdmin",
      "msg": "Caller is not the admin"
    },
    {
      "code": 6001,
      "name": "notOracleOwner",
      "msg": "Caller is not the oracle owner"
    },
    {
      "code": 6002,
      "name": "notAggregator",
      "msg": "Caller is not the attention_aggregator program signer"
    },
    {
      "code": 6003,
      "name": "stakeBelowMinimum",
      "msg": "Stake amount is below the configured minimum"
    },
    {
      "code": 6004,
      "name": "alreadyInactive",
      "msg": "Oracle is already inactive"
    },
    {
      "code": 6005,
      "name": "stillActive",
      "msg": "Oracle is still active — must unregister first"
    },
    {
      "code": 6006,
      "name": "lockupActive",
      "msg": "Stake lockup is still in effect"
    },
    {
      "code": 6007,
      "name": "endpointTooLong",
      "msg": "Endpoint URL is too long (max 200 chars)"
    },
    {
      "code": 6008,
      "name": "invalidSlashBps",
      "msg": "Invalid slash basis points (must be <= 10000)"
    },
    {
      "code": 6009,
      "name": "nothingToWithdraw",
      "msg": "Nothing to withdraw"
    },
    {
      "code": 6010,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6011,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "aggregatorSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "attentionAggregator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "oracleNode",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "endpointUrl",
            "type": "string"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "rewardBalance",
            "type": "u64"
          },
          {
            "name": "reputation",
            "type": "i64"
          },
          {
            "name": "totalSubmissions",
            "type": "u64"
          },
          {
            "name": "totalSlashes",
            "type": "u64"
          },
          {
            "name": "registeredAt",
            "type": "i64"
          },
          {
            "name": "unregisteredAt",
            "type": "i64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "oracleRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "endpointUrl",
            "type": "string"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "oracleSlashed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "amount",
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
      "name": "oracleUnregistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "registry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "attentionAggregator",
            "type": "pubkey"
          },
          {
            "name": "minStake",
            "type": "u64"
          },
          {
            "name": "slashBps",
            "type": "u16"
          },
          {
            "name": "totalNodes",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "stakeAuthorityBump",
            "type": "u8"
          },
          {
            "name": "rewardAuthorityBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "rewardCredited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "amount",
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
          }
        ]
      }
    },
    {
      "name": "rewardsClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "amount",
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
      "name": "stakeWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
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
