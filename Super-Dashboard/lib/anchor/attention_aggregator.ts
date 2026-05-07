/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/attention_aggregator.json`.
 */
export type AttentionAggregator = {
  "address": "6MJxBMfkocuzdbR5wJRvh31BAVPrUmk454yB9HnwvXtH",
  "metadata": {
    "name": "attentionAggregator",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Vista attention aggregator — multi-oracle consensus + slashing"
  },
  "instructions": [
    {
      "name": "aggregateResults",
      "docs": [
        "Permissionless. Closes the submission window, finds outliers (deviation",
        "> deviation_bps from mean), and CPIs into:",
        "- oracle_registry::slash_oracle for each outlier",
        "- vista_protocol::drain_validator_pool to move validator pool USDC",
        "into the registry's RewardVault",
        "- oracle_registry::credit_reward for each honest oracle (split equally)",
        "",
        "remaining_accounts layout:",
        "[oracle_node_0, oracle_node_1, ...] in the SAME ORDER as",
        "`attention_session.submissions[0..submissions_count]`."
      ],
      "discriminator": [
        86,
        23,
        164,
        118,
        152,
        4,
        86,
        153
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  103,
                  114,
                  101,
                  103,
                  97,
                  116,
                  111,
                  114,
                  95,
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
          "name": "aggregatorSigner",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  103,
                  114,
                  101,
                  103,
                  97,
                  116,
                  111,
                  114,
                  95,
                  115,
                  105,
                  103,
                  110,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "attentionSession",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  116,
                  116,
                  101,
                  110,
                  116,
                  105,
                  111,
                  110,
                  95,
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
          "name": "oracleRegistryProgram"
        },
        {
          "name": "registry"
        },
        {
          "name": "vistaProtocolProgram"
        },
        {
          "name": "validatorPoolVault",
          "writable": true
        },
        {
          "name": "validatorPoolAuthority"
        },
        {
          "name": "rewardVault",
          "writable": true
        },
        {
          "name": "tokenProgram"
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
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  103,
                  114,
                  101,
                  103,
                  97,
                  116,
                  111,
                  114,
                  95,
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
          "name": "aggregatorSigner",
          "docs": [
            "vista_protocol and oracle_registry. Stored solely to bind the bump."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  103,
                  114,
                  101,
                  103,
                  97,
                  116,
                  111,
                  114,
                  95,
                  115,
                  105,
                  103,
                  110,
                  101,
                  114
                ]
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
      "args": [
        {
          "name": "vistaProtocol",
          "type": "pubkey"
        },
        {
          "name": "oracleRegistry",
          "type": "pubkey"
        },
        {
          "name": "minQuorum",
          "type": "u8"
        },
        {
          "name": "deviationBps",
          "type": "u16"
        },
        {
          "name": "windowSeconds",
          "type": "i64"
        }
      ]
    },
    {
      "name": "submitVerification",
      "discriminator": [
        30,
        19,
        8,
        156,
        126,
        43,
        28,
        175
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
                  97,
                  103,
                  103,
                  114,
                  101,
                  103,
                  97,
                  116,
                  111,
                  114,
                  95,
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
          "name": "oracleNode",
          "docs": [
            "owner == config.oracle_registry and that the data shows active=true."
          ]
        },
        {
          "name": "attentionSession",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  116,
                  116,
                  101,
                  110,
                  116,
                  105,
                  111,
                  110,
                  95,
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
          "name": "sessionId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "score",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "aggregatorConfig",
      "discriminator": [
        22,
        93,
        40,
        145,
        98,
        97,
        67,
        143
      ]
    },
    {
      "name": "attentionSession",
      "discriminator": [
        91,
        216,
        219,
        45,
        192,
        143,
        43,
        106
      ]
    }
  ],
  "events": [
    {
      "name": "outlierDetected",
      "discriminator": [
        172,
        71,
        137,
        104,
        104,
        219,
        97,
        22
      ]
    },
    {
      "name": "sessionAggregated",
      "discriminator": [
        81,
        187,
        185,
        49,
        194,
        244,
        145,
        195
      ]
    },
    {
      "name": "verificationSubmitted",
      "discriminator": [
        168,
        0,
        119,
        21,
        185,
        123,
        43,
        57
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidScore",
      "msg": "Invalid score (must be 0-100)"
    },
    {
      "code": 6001,
      "name": "quorumTooLow",
      "msg": "Quorum must be at least 2"
    },
    {
      "code": 6002,
      "name": "invalidDeviation",
      "msg": "Deviation must be <= 10000 bps"
    },
    {
      "code": 6003,
      "name": "invalidWindow",
      "msg": "Window seconds must be > 0"
    },
    {
      "code": 6004,
      "name": "sessionMismatch",
      "msg": "Session id mismatch"
    },
    {
      "code": 6005,
      "name": "alreadySettled",
      "msg": "Session already settled"
    },
    {
      "code": 6006,
      "name": "windowExpired",
      "msg": "Submission window has expired"
    },
    {
      "code": 6007,
      "name": "alreadySubmitted",
      "msg": "Oracle has already submitted for this session"
    },
    {
      "code": 6008,
      "name": "maxSubmissionsReached",
      "msg": "Maximum submissions reached for this session"
    },
    {
      "code": 6009,
      "name": "notReadyToAggregate",
      "msg": "Either window must expire or quorum must be reached before aggregation"
    },
    {
      "code": 6010,
      "name": "insufficientSubmissions",
      "msg": "Need at least 2 submissions to aggregate"
    },
    {
      "code": 6011,
      "name": "remainingAccountsMismatch",
      "msg": "remaining_accounts length must equal submissions_count"
    },
    {
      "code": 6012,
      "name": "wrongRegistry",
      "msg": "Wrong oracle_registry program owns this OracleNode"
    },
    {
      "code": 6013,
      "name": "oracleNodeMalformed",
      "msg": "OracleNode account data is malformed"
    },
    {
      "code": 6014,
      "name": "tokenAccountMalformed",
      "msg": "Token account data is malformed"
    }
  ],
  "types": [
    {
      "name": "aggregatorConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "vistaProtocol",
            "type": "pubkey"
          },
          {
            "name": "oracleRegistry",
            "type": "pubkey"
          },
          {
            "name": "minQuorum",
            "type": "u8"
          },
          {
            "name": "deviationBps",
            "type": "u16"
          },
          {
            "name": "windowSeconds",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "signerBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "attentionSession",
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
            "name": "windowStart",
            "type": "i64"
          },
          {
            "name": "submissionsCount",
            "type": "u8"
          },
          {
            "name": "submissions",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "oracleSubmission"
                  }
                },
                16
              ]
            }
          },
          {
            "name": "isSettled",
            "type": "bool"
          },
          {
            "name": "consensusScore",
            "type": "u8"
          },
          {
            "name": "consensusReached",
            "type": "bool"
          },
          {
            "name": "settledAt",
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
      "name": "oracleSubmission",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "score",
            "type": "u8"
          },
          {
            "name": "submittedAt",
            "type": "i64"
          },
          {
            "name": "isOutlier",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "outlierDetected",
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
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "score",
            "type": "u8"
          },
          {
            "name": "consensus",
            "type": "u8"
          },
          {
            "name": "slashedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "sessionAggregated",
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
            "name": "consensusScore",
            "type": "u8"
          },
          {
            "name": "consensusReached",
            "type": "bool"
          },
          {
            "name": "honestCount",
            "type": "u8"
          },
          {
            "name": "slashedCount",
            "type": "u8"
          },
          {
            "name": "perOracleReward",
            "type": "u64"
          },
          {
            "name": "settledAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "verificationSubmitted",
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
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "score",
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
