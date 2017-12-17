var Bitcoin = require('bitcoinjs-lib');
var counterparty = require('counterparty-promise');
var bip39 = require('bip39');
var coininfo = require('coininfo');
var mona = coininfo('MONA').toBitcoinJS();
mona.messagePrefix = '';
mona.dustThreshold = 0;

const WATANABE = 100000000;
const btcToken = 'MONAPARTY';
const burnAddress = '1MonapartyMMMMMMMMMMMMMMMMMQ3QJNm';

const monaToken = 'XMP';
const monaTokenSupply = 2730320.72307;

// RPC接続情報
var monaOptions = {
  port: 4000,
  host: 'localhost',
  user: 'rpc',
  pass: 'rpc'
};


var btcOptions = {
  port: 4000,
  host: 'public.coindaddy.io',
  user: 'rpc',
  pass: '1234'
};

var mnemonic = process.env.MNEMONIC;
var seed = bip39.mnemonicToSeed(mnemonic, '');
var m = Bitcoin.HDNode.fromSeedBuffer(seed, mona);
var d = m.derive("m/22'/0'/0'/0/0");
var pk = d.privKey.toWIF(mona)
var address = d.privKey.pub.getAddress(mona);

var monaClient = new counterparty.Client(monaOptions);
var btcClient = new counterparty.Client(btcOptions);

const getDistributionQuantity = (burnedQuantity, icoTokenSupply) => Math.floor(burnedQuantity / icoTokenSupply * 100.0 * monaTokenSupply * 100000000.0);

Promise.all([
  btcClient.getSupply({asset: btcToken}),
  btcClient.getSends({ filters: [
    { field: 'destination', op: '==', value: burnAddress },
    { field: 'status', op: '==', value: 'valid' }
  ]})
]).then(result => {
  const destinations = {}
  const icoTokenSupply = result[0];
  result[1]
    .map(x => {
      try {
        Bitcoin.Address.fromBase58Check(x.memo);

        if (!destinations[x.memo]) {
          destinations[x.memo] = 0;
        }
        destinations[x.memo] += getDistributionQuantity(x.quantity, icoTokenSupply);
      } catch (e) {
        console.error(e);
      }
    });
  const promises = Object.keys(destinations).map(x => Promise.all([
    monaClient.getSends({ filters: [
      { field: 'source', op: '==', value: address.toString() },
      { field: 'destination', op: '==', value: x },
      { field: 'status', op: '==', value: 'valid' }
    ]}),
    Promise.resolve(x),
    Promise.resolve(destinations[x])
  ]).then(result => {
    const sent = (result[0][0]) ?
      sent = result[0].map(x => x.quantity).reduce((x, y) => x + y) : 0;
    const destination = result[1];
    const distribution = result[2];
    const send = distribution - sent;
    console.log(destination + ' ' + distribution + ' - ' + sent + ' = ' + send);
    return (send > 0) ?
      monaClient.createSend({source: address.toString(), destination: destination, asset: monaToken, quantity: send, use_enhanced_send: true, fee: 225000}).catch(console.error) :
      Promise.resolve();
  }));
  return Promise.all(promises);
}).then(results => results.filter(x => x !== undefined).
  map(x => {
    const key = Bitcoin.ECKey.fromWIF(pk, mona);
    const tx  = Bitcoin.Transaction.fromHex(x);
    tx.sign(0, key);
    return tx.toHex().toString();
  })
).then(console.dir).catch(console.error);
