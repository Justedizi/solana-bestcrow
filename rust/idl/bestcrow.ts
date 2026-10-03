/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bestcrow.json`.
 */
export type Bestcrow = {
  "address": "EousWVK2cePYb9zvv1oWSca4VNdRQqYef8CsxQ6BL57R",
  "metadata": {
    "name": "bestcrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Milestone crowdfunding escrow for Solana"
  },
  "instructions": [
    {
      "name": "cancelCampaign",
      "discriminator": [
        66,
        10,
        32,
        138,
        122,
        36,
        134,
        202
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "campaign"
          ]
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claimRefund",
      "discriminator": [
        15,
        16,
        30,
        161,
        255,
        228,
        97,
        60
      ],
      "accounts": [
        {
          "name": "caller",
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "writable": true
        },
        {
          "name": "backer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "quoteMint",
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          },
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "walletToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "wallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closeBacker",
      "discriminator": [
        179,
        215,
        44,
        252,
        50,
        239,
        29,
        8
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "writable": true
        },
        {
          "name": "backer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createCampaign",
      "discriminator": [
        111,
        131,
        187,
        98,
        160,
        193,
        114,
        244
      ],
      "accounts": [
        {
          "name": "creator",
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
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "args.campaignId"
              }
            ]
          }
        },
        {
          "name": "daoBinding",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  111,
                  45,
                  98,
                  105,
                  110,
                  100,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "metaDao"
              }
            ]
          }
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "baseMint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          }
        },
        {
          "name": "creatorToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "metaDao"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createCampaignArgs"
            }
          }
        }
      ]
    },
    {
      "name": "expireMilestone",
      "discriminator": [
        63,
        248,
        117,
        14,
        49,
        79,
        240,
        230
      ],
      "accounts": [
        {
          "name": "caller",
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "proposal"
        }
      ],
      "args": []
    },
    {
      "name": "finalizeFunding",
      "discriminator": [
        129,
        81,
        184,
        191,
        58,
        224,
        149,
        90
      ],
      "accounts": [
        {
          "name": "caller",
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "pledge",
      "discriminator": [
        235,
        47,
        156,
        254,
        0,
        88,
        212,
        142
      ],
      "accounts": [
        {
          "name": "wallet",
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "backer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "quoteMint",
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          },
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "walletToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "wallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "creator"
        },
        {
          "name": "creatorToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
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
      "name": "resolveMilestone",
      "discriminator": [
        183,
        234,
        132,
        97,
        208,
        35,
        45,
        117
      ],
      "accounts": [
        {
          "name": "caller",
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "proposal"
        },
        {
          "name": "quoteMint",
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          },
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "creator"
        },
        {
          "name": "creatorToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "submitEvidence",
      "discriminator": [
        12,
        169,
        228,
        194,
        229,
        31,
        44,
        39
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true,
          "relations": [
            "campaign"
          ]
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "proposal"
        }
      ],
      "args": [
        {
          "name": "evidenceHash",
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
      "name": "sweepDust",
      "discriminator": [
        9,
        49,
        242,
        88,
        156,
        84,
        109,
        15
      ],
      "accounts": [
        {
          "name": "caller",
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "creator"
        },
        {
          "name": "quoteMint",
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          },
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "creatorToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "withdrawPledge",
      "discriminator": [
        87,
        206,
        176,
        206,
        78,
        59,
        5,
        98
      ],
      "accounts": [
        {
          "name": "wallet",
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
                "path": "campaign.creator",
                "account": "campaign"
              },
              {
                "kind": "account",
                "path": "campaign.campaignId",
                "account": "campaign"
              }
            ]
          }
        },
        {
          "name": "backer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  99,
                  107,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "quoteMint",
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "campaign"
              }
            ]
          },
          "relations": [
            "campaign"
          ]
        },
        {
          "name": "walletToken",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "wallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "backer",
      "discriminator": [
        199,
        128,
        179,
        190,
        2,
        66,
        118,
        252
      ]
    },
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
      "name": "daoBinding",
      "discriminator": [
        38,
        212,
        48,
        162,
        139,
        142,
        38,
        197
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
      "name": "campaignFinalized",
      "discriminator": [
        219,
        169,
        142,
        66,
        105,
        67,
        124,
        255
      ]
    },
    {
      "name": "contributionChanged",
      "discriminator": [
        113,
        36,
        167,
        65,
        198,
        208,
        190,
        101
      ]
    },
    {
      "name": "evidenceSubmitted",
      "discriminator": [
        13,
        123,
        197,
        44,
        231,
        117,
        168,
        53
      ]
    },
    {
      "name": "fundsMoved",
      "discriminator": [
        45,
        213,
        142,
        27,
        233,
        76,
        210,
        8
      ]
    },
    {
      "name": "milestoneResolved",
      "discriminator": [
        187,
        22,
        126,
        26,
        156,
        84,
        105,
        7
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidTerms",
      "msg": "Invalid campaign terms"
    },
    {
      "code": 6001,
      "name": "invalidCampaignState",
      "msg": "Campaign is not in the required state"
    },
    {
      "code": 6002,
      "name": "invalidMilestoneState",
      "msg": "Milestone is not in the required state"
    },
    {
      "code": 6003,
      "name": "fundingEnded",
      "msg": "Funding period has ended"
    },
    {
      "code": 6004,
      "name": "fundingOpen",
      "msg": "Funding period has not ended"
    },
    {
      "code": 6005,
      "name": "goalExceeded",
      "msg": "Campaign goal would be exceeded"
    },
    {
      "code": 6006,
      "name": "zeroAmount",
      "msg": "Amount must be positive"
    },
    {
      "code": 6007,
      "name": "wrongParticipant",
      "msg": "Wrong creator or backer account"
    },
    {
      "code": 6008,
      "name": "deadlinePassed",
      "msg": "Deadline has passed"
    },
    {
      "code": 6009,
      "name": "deadlineOpen",
      "msg": "Deadline has not passed"
    },
    {
      "code": 6010,
      "name": "wrongMilestone",
      "msg": "Wrong milestone or MetaDAO proposal"
    },
    {
      "code": 6011,
      "name": "arithmetic",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6012,
      "name": "insufficientEscrow",
      "msg": "Escrow balance is insufficient"
    },
    {
      "code": 6013,
      "name": "refundUnavailable",
      "msg": "Refund is not available"
    },
    {
      "code": 6014,
      "name": "alreadyClaimed",
      "msg": "Refund already claimed"
    },
    {
      "code": 6015,
      "name": "refundsOutstanding",
      "msg": "Refunds are still outstanding"
    },
    {
      "code": 6016,
      "name": "emptyEvidence",
      "msg": "Evidence hash must be nonzero"
    },
    {
      "code": 6017,
      "name": "receiptStillNeeded",
      "msg": "Account is still needed for funding or refund"
    },
    {
      "code": 6018,
      "name": "invalidMetaDaoAccount",
      "msg": "MetaDAO account has an unexpected owner, discriminator, or layout"
    },
    {
      "code": 6019,
      "name": "invalidMarketBinding",
      "msg": "MetaDAO DAO and proposal are not bound to this campaign"
    },
    {
      "code": 6020,
      "name": "invalidProposalState",
      "msg": "MetaDAO proposal is not in the required state"
    },
    {
      "code": 6021,
      "name": "marketStillLive",
      "msg": "MetaDAO market is still live"
    },
    {
      "code": 6022,
      "name": "invalidTokenAccount",
      "msg": "Token mint, vault, or recipient account does not match the campaign"
    }
  ],
  "types": [
    {
      "name": "backer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "claimed",
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
      "name": "campaign",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "campaignId",
            "type": "u64"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "metaDao",
            "type": "pubkey"
          },
          {
            "name": "goal",
            "type": "u64"
          },
          {
            "name": "totalRaised",
            "type": "u64"
          },
          {
            "name": "escrowBalance",
            "type": "u64"
          },
          {
            "name": "totalReleased",
            "type": "u64"
          },
          {
            "name": "initialRelease",
            "type": "u64"
          },
          {
            "name": "refundPool",
            "type": "u64"
          },
          {
            "name": "refundDenominator",
            "type": "u64"
          },
          {
            "name": "refundedAmount",
            "type": "u64"
          },
          {
            "name": "fundingDeadline",
            "type": "i64"
          },
          {
            "name": "marketTimeoutSecs",
            "type": "i64"
          },
          {
            "name": "metadataHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "currentMilestone",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "campaignStatus"
              }
            }
          },
          {
            "name": "backerCount",
            "type": "u32"
          },
          {
            "name": "refundClaimCount",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "milestones",
            "type": {
              "vec": {
                "defined": {
                  "name": "milestone"
                }
              }
            }
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
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "goal",
            "type": "u64"
          },
          {
            "name": "fundingDeadline",
            "type": "i64"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "metaDao",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "campaignFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "succeeded",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "campaignStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "funding"
          },
          {
            "name": "active"
          },
          {
            "name": "failed"
          },
          {
            "name": "terminated"
          },
          {
            "name": "completed"
          }
        ]
      }
    },
    {
      "name": "contributionChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "backer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "withdrawn",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "createCampaignArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaignId",
            "type": "u64"
          },
          {
            "name": "goal",
            "type": "u64"
          },
          {
            "name": "initialRelease",
            "type": "u64"
          },
          {
            "name": "fundingDeadline",
            "type": "i64"
          },
          {
            "name": "marketTimeoutSecs",
            "type": "i64"
          },
          {
            "name": "metadataHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "milestones",
            "type": {
              "vec": {
                "defined": {
                  "name": "milestoneInput"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "daoBinding",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "dao",
            "type": "pubkey"
          },
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "evidenceSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "milestoneIndex",
            "type": "u8"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "evidenceHash",
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
      "name": "fundsMoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "refund",
            "type": "bool"
          },
          {
            "name": "mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "milestone",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "dueAt",
            "type": "i64"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "evidenceHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "submittedAt",
            "type": "i64"
          },
          {
            "name": "marketDeadline",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "milestoneStatus"
              }
            }
          }
        ]
      }
    },
    {
      "name": "milestoneInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "dueAt",
            "type": "i64"
          },
          {
            "name": "proposal",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "milestoneResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "campaign",
            "type": "pubkey"
          },
          {
            "name": "milestoneIndex",
            "type": "u8"
          },
          {
            "name": "approved",
            "type": "bool"
          },
          {
            "name": "terminated",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "milestoneStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "reviewing"
          },
          {
            "name": "passed"
          },
          {
            "name": "rejected"
          }
        ]
      }
    }
  ]
};
