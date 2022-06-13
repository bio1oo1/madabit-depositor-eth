// postgresql API
var assert = require('better-assert');
var async = require('async');
var pg = require('pg');
var config = require('./config');
var lib = require('./lib');
var sendEmail = require('./sendEmail');

var databaseUrl;
if (config.PRODUCTION === config.PRODUCTION_LOCAL) databaseUrl = config.DATABASE_URL_LOCAL;
if (config.PRODUCTION === config.PRODUCTION_LINUX) databaseUrl = config.DATABASE_URL_LINUX;
if (config.PRODUCTION === config.PRODUCTION_WINDOWS) databaseUrl = config.DATABASE_URL_WINDOWS;

console.log('eth daemon connected to db : [', databaseUrl, ']');
lib.log('info', 'eth daemon connected to db : [' + databaseUrl + ']');

pg.types.setTypeParser(20, function (val) { // parse int8 as an integer
    return val === null ? null : parseInt(val);
});

// callback is called with (err, client, done)
function connect (callback) {
    return pg.connect(databaseUrl, callback);
}

function query (query, params, callback) {
    // third parameter is optional
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }

    connect(function (err, client, done) {
        if (err) return callback(err);
        client.query(query, params, function (err, result) {
            done();
            if (err) {
                return callback(err);
            }
            callback(null, result);
        });
    });
}

// runner takes (client, callback)

// callback should be called with (err, data)
// client should not be used to commit, rollback or start a new transaction

function getClient (runner, callback) {
    connect(function (err, client, done) {
        if (err) return callback(err);

        function rollback (err) {
            client.query('ROLLBACK', done);
            callback(err);
        }

        client.query('BEGIN', function (err) {
            if (err) { return rollback(err); }

            runner(client, function (err, data) {
                if (err) { return rollback(err); }

                client.query('COMMIT', function (err) {
                    if (err) { return rollback(err); }

                    done();
                    callback(null, data);
                });
            });
        });
    });
}

/**
 * connect to the database
 * @param callback      callback is called with (err, client, done)
 */
exports.getClient = function (callback) {
    var client = new pg.Client(databaseUrl);

    client.connect(function (err) {
        if (err) return callback(err);

        callback(null, client);
    });
};

/**********************************************************************
 * get last block from blocks table
 * @param callback
 */
exports.getLastBlock = function (callback) {
    // get a eth block with the highest height value
    query('SELECT * FROM eth_blocks ORDER BY height DESC LIMIT 1', function (err, results) {
        if (err) { // db error
            return callback(err);
        }

        if (results.rows.length === 0) {
            return callback(null, { height: 0, hash: '0x41941023680923e0fe4d74a34bdac8141f2540e3ae90623718e47d66d1ca4a2d' }); // genesis block
        }

        assert(results.rows.length === 1);// check LIMIT 1 : db error
        callback(null, results.rows[0]); // int4:height  text:hash from db:blocks
    });
};

/* insert block number and its hash value to the database */
exports.insertBlock = function (height, hash, callback) {
    query('INSERT INTO eth_blocks(height, hash) VALUES($1, $2)', [height, hash], function (err) {
        if (err) return callback(err);
        return callback(null);
    });
};

/* add deposit to a user account updating the balance of the user in database */
function addDeposit (userId, txid, amount_finney, callback) {
    // check the amount_finney is a number variable
    assert(typeof amount_finney === 'number');

    var exchange_rate = {};
    var game_points;

    // read the exchange rates between different currencies
    var sql = "SELECT * FROM common WHERE strkey LIKE 'rate_%'";
    query(sql, function (e, r) {
        if (e) { return callback(e); }
        for (var i = 0; i < r.rows.length; i++) {
            exchange_rate[r.rows[i].strkey] = r.rows[i].strvalue;
        }
        if (exchange_rate.rate_BTC_USD === null ||
            exchange_rate.rate_ETH_USD === null ||
            exchange_rate.rate_USD_bit === null) return callback('[MY ERROR]: Cannot get the exchange rate values.');

        // calculate the gaming points according to the exchange rates from the database
        game_points = Math.round(amount_finney * exchange_rate.rate_ETH_USD * exchange_rate.rate_USD_bit / 10);

        getClient(function (client, callback) {
            async.parallel([
                // add a record to funding table in the database
                function (callback) {
                    // calculate the max id of funding table
                    // add the deposit information to funding table
                    client.query('INSERT INTO fundings(user_id, amount, deposit_txid, description, baseunit, currency) ' +
                        "VALUES($1, $2, $3, 'ETH Deposit', $4, 'ETH')",
                    [userId, game_points, txid, amount_finney / 1000], callback);
                },
                // update the balance of users table in database
                function (callback) {
                    client.query("UPDATE users SET balance_satoshis = balance_satoshis + $1 WHERE id = $2 AND username != 'madabit' AND username != 'staff'",
                        [game_points, userId], callback);
                }],
            callback);
        }, function (err) {
            // error handling
            if (err) {
                if (err.code === '23505') { // constraint violation
                    console.log('error - deposit constraint violation - user_id:' + userId + '   transaction:' + txid);
                    lib.log('error', 'deposit constraint violation - user_id:' + userId + '   transaction:' + txid);
                    return callback(null);
                }

                console.log('[INTERNAL_ERROR] could not save - user_id:' + userId + '   transaction:' + txid + '   error:' + err);
                lib.log('error', '[INTERNAL_ERROR] could not save - user_id:' + userId + '   transaction:' + txid + '   error:' + err);
                return callback(err);
            }

            return callback(null);
        });

        console.log('deposit success from user_id:' + userId + '   amount(finney):' + amount_finney);
        lib.log('success', 'deposit success from user_id:' + userId + '   amount(finney):' + amount_finney);
    });
};

/* get the user id given the address and update the balance of the user */
exports.checkUserId = function (from, value, hashes, callback) {
    query('SELECT user_id FROM eth_deposit_src WHERE eth_addr = $1', [from], function (err, res) {
        if (err) return callback(err);

        console.log('transaction to this company detected - from ethereum account:' + from);
        lib.log('info', 'transaction to this company detected - from ethereum account:' + from);
        if (res.rows.length === 0) {
        	console.log('Unknown deposit source address: ' + from);
        	console.log('deposite amount to the company wallet: ' + value + ' finney');
        	lib.log('info', 'Unknown deposit source address: ' + from);
        	lib.log('info', 'deposite amount to the company wallet: ' + value + ' finney');
            return callback(null);
        }

        // determine the user id who made this deposit
        var userid = res.rows[0].user_id;

        // add the deposit value to the balance of the user detected
        addDeposit(userid, hashes, value, function (error, result) {
            if (error) return callback(error);

            var param = {};
            query("SELECT strvalue FROM common WHERE strkey='company_mail'", function (err, res) {
                if (err)
                    param.company_mail = '';
                if (res.rowCount === 0)
                    param.company_mail = '';
                else
                    param.company_mail = res.rows[0].strvalue;

                query("SELECT strvalue FROM common WHERE strkey='mail_password'", function (err, res) {
                    if (err)
                        param.mail_password = '';
                    if (res.rowCount === 0)
                        param.mail_password = '';
                    else
                        param.mail_password = res.rows[0].strvalue;

                    query("SELECT strvalue FROM common WHERE strkey = 'contactus_email'", function (err, res) {
                        if (err)
                            param.contact_us_email = '';
                        if (res.rowCount === 0)
                            param.contact_us_email = '';
                        param.contact_us_email = rows[0]['strvalue'];
                        param.amount = value / 1000;
                        sendEmail.sendDepositNotifyMail(param, function (err) {
                            return callback(null, result);
                        });
                    });
                });
            });
        });
    });
};

/* load the ethereum address and password of the game site from database */
exports.loadCompanyETHInfo = function (callback) {
    var addr, pass;
    var retval = {};

    // read the ethereum address of game site
    var sql = "SELECT strvalue FROM common WHERE strkey='eth_address'";
    query(sql, function (error, result) {
        if (error) return callback(error);
        addr = result.rows[0].strvalue;

        // read the password for the ethereum account
        sql = "SELECT strvalue FROM common WHERE strkey='eth_password'";
        query(sql, function (err, res) {
            if (err) return callback(err);
            pass = res.rows[0].strvalue;

            // return the load result using callback function
            retval['addr'] = addr.toLowerCase();
            retval['pass'] = pass;
            return callback(null, retval);
        });
    });
};
