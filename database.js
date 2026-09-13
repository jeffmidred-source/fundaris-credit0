const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data.json');

function ensureDb() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({
      contactSubmissions: [],
      loanApplications: [],
      users: [],
      verificationUploads: [],
      chatMessages: [],
      siteSettings: {
        contactEmail: 'fundariscredit0@gmail.com',
        contactPhone: '+14375007180',
        currency: 'USD'
      },
      depositWallets: [
        { method: 'paypal', label: 'PayPal', address: 'paypal@fundariscredit.com', note: 'Use your PayPal email to deposit into your FUNDARIS CREDIT account.' },
        { method: 'bank_transfer', label: 'International Bank Transfer', address: 'Bank: Global Treasury Services\nAccount Name: FUNDARIS CREDIT\nAccount Number: 0012345678\nSWIFT: GTSUS33', note: 'Use these details to complete a secure international transfer.' },
        { method: 'bitcoin', label: 'Bitcoin', address: 'bc1qfundariscreditbitcoinwallet', note: 'BTC wallet address for Bitcoin deposits.' },
        { method: 'usdt', label: 'USDT (TRC20)', address: 'TQf9gk7rR1x2Qm6J9d4Hyr7mYV7K6u5Wde', note: 'USDT wallet address for TRC20 deposits.' },
        { method: 'eth', label: 'ETH', address: '0x8D7eF925B7D9f2508D5d39b7e7C5f5c0d4a6Ee0F', note: 'ERC20 ETH wallet address for ETH deposits.' },
        { method: 'tron', label: 'TRON', address: 'TQf9gk7rR1x2Qm6J9d4Hyr7mYV7K6u5Wde', note: 'TRON wallet address for TRX deposits.' }
      ]
    }, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(dbPath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return {
      contactSubmissions: parsed.contactSubmissions || [],
      loanApplications: parsed.loanApplications || [],
      users: parsed.users || [],
      verificationUploads: parsed.verificationUploads || [],
      chatMessages: parsed.chatMessages || [],
      siteSettings: parsed.siteSettings || {
        contactEmail: 'fundariscredit0@gmail.com',
        contactPhone: '+14375007180',
        currency: 'USD'
      },
      depositWallets: parsed.depositWallets || []
    };
  } catch (error) {
    return {
      contactSubmissions: [],
      loanApplications: [],
      users: [],
      verificationUploads: [],
      chatMessages: [],
      siteSettings: {
        contactEmail: 'fundariscredit0@gmail.com',
        contactPhone: '+14375007180',
        currency: 'USD'
      },
      depositWallets: []
    };
  }
}

function writeDb(data) {
  ensureDb();
  const tempPath = `${dbPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, dbPath);
}

module.exports = { readDb, writeDb, dbPath };

