var productLocal = 'LOCAL';
var productLinux = 'LINUX';
var productWindows = 'WINDOWS';

module.exports = {

    // PRODUCTION: productLocal,
    // PRODUCTION: productLinux,
    PRODUCTION: productWindows,

    PRODUCTION_LOCAL: productLocal,
    PRODUCTION_LINUX: productLinux,
    PRODUCTION_WINDOWS: productWindows,

    ETH_URL_LOCAL: 'http://localhost:8545', // eth rpc url for local - developmennt
    ETH_URL_LINUX: 'http://localhost:8545', // eth rpc url for linux server - test
    ETH_URL_WINDOWS: 'http://localhost:8545', // eth rpc url for windows server - production

    DATABASE_URL_LOCAL: 'postgres://postgres:123456@localhost/bustabitdb', // database url for local developmennt
    DATABASE_URL_LINUX: 'postgres://postgres:123456@47.75.43.93/bustabitdb', // database url for linux server - test
    DATABASE_URL_WINDOWS: 'postgres://postgres:bmUgswMNVK9n4J7S@172.17.0.6/bustabitdb' // database url for windows server - production
};
