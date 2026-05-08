const devcert = require('devcert');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, 'certs');
const certFile = path.join(certDir, 'cert.pem');
const keyFile = path.join(certDir, 'key.pem');

async function generate() {
    try {
        const cert = await devcert.certificateFor('localhost');
        fs.writeFileSync(certFile, cert.cert);
        fs.writeFileSync(keyFile, cert.key);
        console.log('Certificates generated in certs/');
    } catch (e) {
        console.error('Failed:', e.message);
    }
}

generate();