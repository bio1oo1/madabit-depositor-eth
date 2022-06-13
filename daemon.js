
var db = require('./src/db');
var lib = require('./src/lib');
var config = require('./src/config');
var Web3 = require('web3');
var async = require('async');

var ethUrl;
if (config.PRODUCTION === config.PRODUCTION_LOCAL) ethUrl = config.ETH_URL_LOCAL;
if (config.PRODUCTION === config.PRODUCTION_LINUX) ethUrl = config.ETH_URL_LINUX;
if (config.PRODUCTION === config.PRODUCTION_WINDOWS) ethUrl = config.ETH_URL_WINDOWS;

let provider = new Web3.providers.HttpProvider(ethUrl);
const web3 = new Web3(provider);

console.log('eth daemon connected to geth-rpc : [', ethUrl, ']');
lib.log('info', 'eth daemon connected to geth-rpc : [', ethUrl, ']');

var lastBlockNumber = null;

blockLoop();

/* initialization and calling of main loop */
function scheduleBlockLoop () {
    setTimeout(blockLoop, 10000); // trigger the main loop after 20s
}

/* main loop */
function blockLoop () {
    db.getLastBlock(function (err, lastBlockInfo) {
        if (err) {
            console.log('error - blockLoop - getLastBlock   error:', err);
            return scheduleBlockLoop();
        }

        db.loadCompanyETHInfo(function (err, destInfo) {
            if (err) {
                console.log('error - blockLoop - loadCompanyETHInfo   error:', err);
                return scheduleBlockLoop();
            }

            lastBlockNumber = lastBlockInfo.height;
            lastBlockNumber++;

            var companyAddress = destInfo.addr.toLowerCase();
            processBlock(companyAddress, lastBlockNumber, function (err, nCurrentBlockNumber) {
                if (err) {
                    if (err === 'LAST_BLOCK') {
                        console.log('nothing to do. current block number:', nCurrentBlockNumber);
                    } else {
                        console.log('error - processBlock   last block number:', lastBlockNumber, '   error:', err);
                    }

                    return scheduleBlockLoop();
                }

                console.log('block processed - ', lastBlockNumber, '/', nCurrentBlockNumber);
                blockLoop();
            });
        });
    });
}

function processBlock (destAccount, lastBlockNumber, callback) {
    web3.eth.getBlockNumber(function (err, nCurrentBlockNumber) {
        if (err) {
            console.log('error - getBlockNumber :', err);
            return callback(err);
        }

        // console.log('CurrentBlockNumber :', nCurrentBlockNumber);
        if (nCurrentBlockNumber <= lastBlockNumber) {
            // console.log('same block.');
            return callback('LAST_BLOCK', nCurrentBlockNumber);
        }

        web3.eth.getBlock(lastBlockNumber, function (err, objBlockInfo) {
            if (err) {
                console.log('error - getBlock :', err);
                return callback(err);
            }

            var blockHash = objBlockInfo.hash;
            web3.eth.getBlockTransactionCount(lastBlockNumber, function (err, nTransactionCount) {
                if (err) {
                    console.log('error - getBlockTransactionCount - lastBlockNumber:' + lastBlockNumber + '   error:' + err);
                    return callback(err);
                }

                // console.log('BlockTransactionCount :', nTransactionCount);

                var txIds = [];
                for (var nId = 0; nId < nTransactionCount; nId++) {
                    txIds[nId] = nId;
                }

                var tasks = [];
                txIds.forEach(function (txId) {
                    tasks.push(function (callback) {
                        processTransaction(destAccount, lastBlockNumber, txId, callback);
                    });
                });

                async.series(tasks, function (err) {
                    if (err) { return callback(err); }

                    db.insertBlock(lastBlockNumber, blockHash, function (err) {
                        if (err) {
                            console.log('error - db.insertBlock - lastBlockNumber:' + lastBlockNumber + '   error:' + err);
                            return callback(err);
                        }

                        // console.log('block processed - blockNumber:' + lastBlockNumber);

                        return callback(null, nCurrentBlockNumber);
                    });
                });
            });
        });
    });
}

// ************************************************************************************************
function processTransaction (destAccount, nBlockNumber, nTxIndex, callback) {

    // console.log('transaction : blockNumber:', nBlockNumber, '   txId:', nTxIndex);

    web3.eth.getTransactionFromBlock(nBlockNumber, nTxIndex, function (err, objTransaction) {
        if (err) {
            // console.log('error - getBlockTransactionCount - nBlockNumber:' + nBlockNumber + '   TransactionIndex:' + nTxIndex + '   error:' + err);
            return callback(err);
        }

        if (objTransaction === null) {
            // console.log('error - getBlockTransactionCount - Transaction:null');
            return callback(err);
        }

        if (objTransaction.to === null) {
            // console.log('error - getBlockTransactionCount - to:null');
            return callback(err);
        }

        var destination = objTransaction.to.toLowerCase();
        if (destination !== destAccount) {
            // console.log('error - getBlockTransactionCount - not our transaction.   to:' + destination + '   destAccount:' + destAccount);
            return callback(err);
        }

        var amountFinney = parseInt(web3.fromWei(objTransaction.value, 'finney'));

        if (amountFinney === 0) {
            // console.log('error - getBlockTransactionCount - value:0');
            return callback(err);
        }

        db.checkUserId(objTransaction.from, amountFinney, objTransaction.hash, function (err, res) {
            if (err) {
                console.log('db.checkUserId - err   from:', objTransaction.from, '   to:', destination, '   value(finney):', amountFinney);
                return callback(err);
            }

            console.log('objTransaction   from:', objTransaction.from, '   to:', destination, '   value(finney):', amountFinney);
            return callback(null);
        });
    });
}
