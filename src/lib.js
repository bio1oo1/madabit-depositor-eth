var fs = require('fs');

exports.log = function (strMark, strMsg) {
    var today = new Date();
    var dd = today.getDate();
    var mm = today.getMonth() + 1;
    var yyyy = today.getFullYear();

    if (dd < 10) dd = '0' + dd;
    if (mm < 10) mm = '0' + mm;

    /// //////////////////////////////////////////////////////////////////////
    var strDir = './log';
    if (!fs.existsSync(strDir)) {
        fs.mkdirSync(strDir);
    }

    var strFile = strDir + '/e_' + yyyy + mm + dd + '.log';
    if (fs.existsSync(strFile) === false) {
        fs.closeSync(fs.openSync(strFile, 'w'));
    }

    /// ///
    var strLocalTime = today.toLocaleString();
    strMsg = strLocalTime + ' : ' + strMark + ' : ' + strMsg + '\r\n';
    fs.appendFile(strFile, strMsg, function (err) {
        if (err) return console.log(strFile, ':', strMark, ':', err);
    });
};
