import assert from 'node:assert/strict';
import test from 'node:test';
import { web3 } from '@anchor-lang/core';
import {
  decodeUpgradeableProgramDataAddress,
  decodeUpgradeAuthority,
  deriveConfigPda,
  parseArgs,
} from './devnet-v2-common.js';

const { Keypair, PublicKey } = web3;

test('parseArgs separates value options from boolean flags', () => {
  const parsed = parseArgs(['--rpc', 'https://example.invalid', '--execute']);
  assert.equal(parsed.options.get('--rpc'), 'https://example.invalid');
  assert.equal(parsed.flags.has('--execute'), true);
});

test('upgradeable-loader state decoding extracts addresses', () => {
  const programDataAddress = Keypair.generate().publicKey;
  const authority = Keypair.generate().publicKey;
  const program = Buffer.alloc(36);
  program.writeUInt32LE(2, 0);
  programDataAddress.toBuffer().copy(program, 4);
  assert.equal(decodeUpgradeableProgramDataAddress(program).toBase58(), programDataAddress.toBase58());

  const programData = Buffer.alloc(45);
  programData.writeUInt32LE(3, 0);
  programData[12] = 1;
  authority.toBuffer().copy(programData, 13);
  assert.equal(decodeUpgradeAuthority(programData)?.toBase58(), authority.toBase58());
  programData[12] = 0;
  assert.equal(decodeUpgradeAuthority(programData), null);
});

test('ProtocolConfigV2 PDA uses the config-v2 seed', () => {
  const programId = new PublicKey('74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG');
  const expected = PublicKey.findProgramAddressSync([Buffer.from('config-v2')], programId)[0];
  assert.equal(deriveConfigPda(programId).toBase58(), expected.toBase58());
});
