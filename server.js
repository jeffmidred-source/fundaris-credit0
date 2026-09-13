const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { readDb, writeDb } = require('./database');
const { sendNotificationEmail } = require('./email-service');
const { initSqlDatabase, addContactSubmission, addLoanApplication, getAllSubmissions, getAllApplications } = require('./sql-service');
const { saveSubmission, getSubmissions } = require('./mongo-service');
const { sendSmtpEmail } = require('./smtp-service');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'kumasi';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DB_MODE = process.env.DB_MODE || 'sqlite';
const ALLOWED_STATUSES = ['Pending review', 'Under review', 'Approved', 'Rejected'];
const verificationDocs = ['id_card', 'proof_of_address', 'bank_statement', 'passport_photo'];
const withdrawalMethods = ['bank_transfer', 'bitcoin', 'usdt', 'eth', 'tron'];
const depositMethods = ['paypal', 'bank_transfer', 'bitcoin', 'usdt', 'eth', 'tron'];
const DEFAULT_DEPOSIT_WALLETS = [
  { method: 'paypal', label: 'PayPal', address: 'paypal@fundariscredit.com', note: 'Use your PayPal email to deposit into your FUNDARIS CREDIT account.' },
  { method: 'bank_transfer', label: 'International Bank Transfer', address: 'Bank: Global Treasury Services\nAccount Name: FUNDARIS CREDIT\nAccount Number: 0012345678\nSWIFT: GTSUS33', note: 'Use these details to complete a secure international transfer.' },
  { method: 'bitcoin', label: 'Bitcoin', address: 'bc1qfundariscreditbitcoinwallet', note: 'BTC wallet address for Bitcoin deposits.' },
  { method: 'usdt', label: 'USDT (TRC20)', address: 'TQf9gk7rR1x2Qm6J9d4Hyr7mYV7K6u5Wde', note: 'USDT wallet address for TRC20 deposits.' },
  { method: 'eth', label: 'ETH', address: '0x8D7eF925B7D9f2508D5d39b7e7C5f5c0d4a6Ee0F', note: 'ERC20 ETH wallet address for ETH deposits.' },
  { method: 'tron', label: 'TRON', address: 'TQf9gk7rR1x2Qm6J9d4Hyr7mYV7K6u5Wde', note: 'TRON wallet address for TRX deposits.' }
];
const DEFAULT_SITE_SETTINGS = {
  contactEmail: 'fundariscredit0@gmail.com',
  contactPhone: '+14375007180',
  currency: 'USD'
};

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

const ADMIN_PASSWORD_HASH = hashValue(ADMIN_PASSWORD);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function getDb() {
  const db = readDb();
  if (!Array.isArray(db.depositWallets) || db.depositWallets.length === 0) {
    db.depositWallets = DEFAULT_DEPOSIT_WALLETS;
    writeDb(db);
  }
  if (!Array.isArray(db.chatMessages)) {
    db.chatMessages = [];
    writeDb(db);
  }
  if (!db.siteSettings || !db.siteSettings.contactEmail || !db.siteSettings.contactPhone || !db.siteSettings.currency) {
    db.siteSettings = { ...DEFAULT_SITE_SETTINGS, ...(db.siteSettings || {}) };
    writeDb(db);
  }
  return db;
}

function sanitizeString(value) {
  return String(value || '').trim();
}

function normalizedEmail(value) {
  return sanitizeString(value).toLowerCase();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'FUNDARIS CREDIT', database: DB_MODE });
});

app.get('/api/startup-status', (req, res) => {
  res.json({
    success: true,
    service: 'FUNDARIS CREDIT',
    productionReady: false,
    note: 'Prototype is running with JSON storage and email placeholders pending SMTP integration.'
  });
});

app.get('/api/site-settings', (req, res) => {
  const db = getDb();
  res.json({
    success: true,
    data: {
      contactEmail: db.siteSettings?.contactEmail || DEFAULT_SITE_SETTINGS.contactEmail,
      contactPhone: db.siteSettings?.contactPhone || DEFAULT_SITE_SETTINGS.contactPhone,
      currency: db.siteSettings?.currency || DEFAULT_SITE_SETTINGS.currency
    }
  });
});

app.post('/api/admin/site-settings', (req, res) => {
  const { adminUsername, adminPassword, contactEmail, contactPhone, currency } = req.body || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const cleanEmail = sanitizeString(contactEmail).toLowerCase();
  const cleanPhone = sanitizeString(contactPhone);
  const cleanCurrency = sanitizeString(currency || 'USD').toUpperCase();

  if (!cleanEmail || !cleanPhone) {
    return res.status(400).json({ success: false, message: 'Please provide both a contact email and phone number.' });
  }

  const db = getDb();
  db.siteSettings = {
    contactEmail: cleanEmail,
    contactPhone: cleanPhone,
    currency: cleanCurrency || 'USD'
  };
  writeDb(db);

  return res.json({
    success: true,
    message: 'Contact information updated successfully.',
    data: db.siteSettings
  });
});

app.post('/api/contact', (req, res) => {
  const { name, email, phone, message } = req.body || {};
  const cleanName = sanitizeString(name);
  const cleanEmail = sanitizeString(email).toLowerCase();
  const cleanPhone = sanitizeString(phone);
  const cleanMessage = sanitizeString(message);

  if (!cleanName || !cleanEmail || !cleanPhone || !cleanMessage) {
    return res.status(400).json({
      success: false,
      message: 'Please provide your name, email, phone number, and message.'
    });
  }

  const createdAt = new Date().toISOString();
  const db = getDb();
  const submission = {
    id: (db.contactSubmissions.at(-1)?.id || 0) + 1,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    message: cleanMessage,
    createdAt
  };

  db.contactSubmissions.push(submission);
  writeDb(db);

  if (DB_MODE === 'sqlite') {
    addContactSubmission({
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      message: cleanMessage,
      createdAt
    }).catch(() => {});
  }

  if (DB_MODE === 'mongo') {
    saveSubmission('contact_submissions', {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      message: cleanMessage,
      createdAt
    }).catch(() => {});
  }

  sendNotificationEmail({
    to: process.env.SMTP_TO || process.env.ADMIN_EMAIL || 'fundariscredit0@gmail.com',
    subject: 'New customer enquiry',
    message: `New enquiry from ${cleanName} (${cleanEmail}) - ${cleanPhone}: ${cleanMessage}`
  });

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    sendSmtpEmail({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || 'noreply@fundariscredit.com',
      to: process.env.SMTP_TO || process.env.ADMIN_EMAIL || 'fundariscredit0@gmail.com',
      subject: 'New customer enquiry',
      text: `New enquiry from ${cleanName} (${cleanEmail}) - ${cleanPhone}: ${cleanMessage}`
    }).catch(() => {});
  }

  return res.status(201).json({
    success: true,
    message: 'Your message has been received. Our team will contact you soon.',
    data: submission
  });
});

app.get('/api/chat/messages', (req, res) => {
  const { adminUsername, adminPassword } = req.query || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const db = getDb();
  const chats = [...(db.chatMessages || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({ success: true, data: chats });
});

app.post('/api/chat/message', (req, res) => {
  const { visitorName, visitorEmail, message, sourcePage } = req.body || {};
  const cleanName = sanitizeString(visitorName);
  const cleanEmail = sanitizeString(visitorEmail).toLowerCase();
  const cleanMessage = sanitizeString(message);

  if (!cleanName || !cleanEmail || !cleanMessage) {
    return res.status(400).json({ success: false, message: 'Please provide your name, email, and a message.' });
  }

  const db = getDb();
  const entry = {
    id: (db.chatMessages.at(-1)?.id || 0) + 1,
    visitorName: cleanName,
    visitorEmail: cleanEmail,
    sourcePage: sanitizeString(sourcePage) || 'homepage',
    status: 'new',
    createdAt: new Date().toISOString(),
    message: cleanMessage,
    messages: [
      {
        id: 1,
        sender: 'visitor',
        text: cleanMessage,
        createdAt: new Date().toISOString()
      }
    ]
  };

  db.chatMessages.unshift(entry);
  writeDb(db);

  sendNotificationEmail({
    to: process.env.SMTP_TO || process.env.ADMIN_EMAIL || 'fundariscredit0@gmail.com',
    subject: 'New live chat message',
    message: `Live chat from ${cleanName} (${cleanEmail}) on ${entry.sourcePage}: ${cleanMessage}`
  });

  return res.status(201).json({
    success: true,
    message: 'Your message has been sent to our support team.',
    data: entry
  });
});

app.post('/api/chat/reply', (req, res) => {
  const { adminUsername, adminPassword, chatId, replyText } = req.body || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const cleanReply = sanitizeString(replyText);
  if (!chatId || !cleanReply) {
    return res.status(400).json({ success: false, message: 'Please provide a chat ID and a reply.' });
  }

  const db = getDb();
  const chatIndex = db.chatMessages.findIndex((chat) => String(chat.id) === String(chatId));

  if (chatIndex === -1) {
    return res.status(404).json({ success: false, message: 'Chat conversation not found.' });
  }

  const chat = db.chatMessages[chatIndex];
  chat.messages = chat.messages || [];
  chat.messages.push({
    id: (chat.messages.at(-1)?.id || 0) + 1,
    sender: 'admin',
    text: cleanReply,
    createdAt: new Date().toISOString()
  });
  chat.status = 'replied';
  chat.repliedAt = new Date().toISOString();
  writeDb(db);

  return res.json({ success: true, message: 'Reply sent to visitor.', data: chat });
});

app.post('/api/loan-application', (req, res) => {
  const { name, product, amount, term, email, phone } = req.body || {};
  const cleanName = sanitizeString(name);
  const cleanProduct = sanitizeString(product);
  const cleanAmount = sanitizeString(amount);
  const cleanTerm = sanitizeString(term);
  const cleanEmail = sanitizeString(email).toLowerCase();
  const cleanPhone = sanitizeString(phone);

  if (!cleanName || !cleanProduct || !cleanAmount || !cleanTerm || !cleanEmail || !cleanPhone) {
    return res.status(400).json({
      success: false,
      message: 'Please complete all loan fields.'
    });
  }

  const createdAt = new Date().toISOString();
  const db = getDb();
  const application = {
    id: (db.loanApplications.at(-1)?.id || 0) + 1,
    name: cleanName,
    product: cleanProduct,
    amount: cleanAmount,
    term: cleanTerm,
    email: cleanEmail,
    phone: cleanPhone,
    status: 'Pending review',
    createdAt
  };

  db.loanApplications.push(application);
  writeDb(db);

  if (DB_MODE === 'sqlite') {
    addLoanApplication({
      name: cleanName,
      product: cleanProduct,
      amount: cleanAmount,
      term: cleanTerm,
      email: cleanEmail,
      phone: cleanPhone,
      status: 'Pending review',
      createdAt
    }).catch(() => {});
  }

  if (DB_MODE === 'mongo') {
    saveSubmission('loan_applications', {
      name: cleanName,
      product: cleanProduct,
      amount: cleanAmount,
      term: cleanTerm,
      email: cleanEmail,
      phone: cleanPhone,
      status: 'Pending review',
      createdAt
    }).catch(() => {});
  }

  sendNotificationEmail({
    to: process.env.SMTP_TO || process.env.ADMIN_EMAIL || 'fundariscredit0@gmail.com',
    subject: 'New loan application',
    message: `New loan application from ${cleanName} (${cleanEmail}) for ${cleanProduct} amount ${cleanAmount} over ${cleanTerm}.`
  });

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    sendSmtpEmail({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || 'noreply@fundariscredit.com',
      to: process.env.SMTP_TO || process.env.ADMIN_EMAIL || 'fundariscredit0@gmail.com',
      subject: 'New loan application',
      text: `New loan application from ${cleanName} (${cleanEmail}) for ${cleanProduct} amount ${cleanAmount} over ${cleanTerm}.`
    }).catch(() => {});
  }

  return res.status(201).json({
    success: true,
    message: 'Your loan request has been submitted successfully.',
    data: application
  });
});

app.get('/api/contact-submissions', (req, res) => {
  const db = getDb();
  res.json({ success: true, count: db.contactSubmissions.length, data: db.contactSubmissions });
});

app.get('/api/dashboard', async (req, res) => {
  const db = getDb();

  let contactSubmissions = db.contactSubmissions;
  let loanApplications = db.loanApplications;

  if (DB_MODE === 'sqlite') {
    try {
      contactSubmissions = await getAllSubmissions();
    } catch (error) {
      contactSubmissions = db.contactSubmissions;
    }
  }

  if (DB_MODE === 'mongo') {
    try {
      contactSubmissions = await getSubmissions('contact_submissions');
      loanApplications = await getSubmissions('loan_applications');
    } catch (error) {
      contactSubmissions = db.contactSubmissions;
      loanApplications = db.loanApplications;
    }
  }

  const users = db.users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    balance: user.balance || 0,
    availableBalance: user.availableBalance || 0,
    loanStatus: user.loanStatus,
    totalWithdrawn: user.totalWithdrawn || 0
  }));

  const depositRequests = [];
  db.users.forEach((user) => {
    (user.depositHistory || []).forEach((item) => {
      if (item.type === 'deposit_request') {
        depositRequests.push({
          id: item.id,
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          amount: item.amount,
          method: item.method,
          reference: item.reference,
          walletAddress: item.walletAddress,
          status: item.status || 'pending',
          createdAt: item.createdAt
        });
      }
    });
  });

  const withdrawalRequests = [];
  db.users.forEach((user) => {
    (user.withdrawalHistory || []).forEach((item) => {
      if (item.type === 'withdrawal_request') {
        withdrawalRequests.push({
          id: item.id,
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          amount: item.amount,
          method: item.method,
          walletAddress: item.walletAddress,
          status: item.status || 'pending',
          adminNote: item.adminNote || '',
          createdAt: item.createdAt
        });
      }
    });
  });

  const payoutSummary = withdrawalRequests.reduce((summary, item) => {
    if (item.status === 'approved') {
      summary.approved += Number(item.amount || 0);
      summary.count += 1;
    }
    if (item.status === 'pending') {
      summary.pending += Number(item.amount || 0);
    }
    return summary;
  }, { approved: 0, pending: 0, count: 0 });

  res.json({
    success: true,
    contactCount: contactSubmissions.length,
    loanCount: loanApplications.length,
    totalCount: contactSubmissions.length + loanApplications.length,
    contactSubmissions,
    loanApplications,
    users,
    depositRequests,
    withdrawalRequests,
    payoutSummary
  });
});

app.get('/api/admin/users', (req, res) => {
  const { adminUsername, adminPassword } = req.query || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const db = getDb();
  return res.json({
    success: true,
    data: db.users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      balance: user.balance || 0,
      availableBalance: user.availableBalance || 0,
      loanStatus: user.loanStatus,
      totalWithdrawn: user.totalWithdrawn || 0
    }))
  });
});

app.post('/api/admin/update-loan-status', (req, res) => {
  const { adminUsername, adminPassword, applicationId, status } = req.body || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const cleanStatus = sanitizeString(status);
  if (!ALLOWED_STATUSES.includes(cleanStatus)) {
    return res.status(400).json({ success: false, message: 'Invalid status selected.' });
  }

  const db = getDb();
  const appIndex = db.loanApplications.findIndex((application) => String(application.id) === String(applicationId));

  if (appIndex === -1) {
    return res.status(404).json({ success: false, message: 'Loan application not found.' });
  }

  db.loanApplications[appIndex].status = cleanStatus;
  if (db.loanApplications[appIndex].userId) {
    const userIndex = db.users.findIndex((user) => String(user.id) === String(db.loanApplications[appIndex].userId));
    if (userIndex !== -1) {
      db.users[userIndex].loanStatus = cleanStatus;
      db.users[userIndex].lastUpdated = new Date().toISOString();
    }
  }
  writeDb(db);

  return res.json({ success: true, message: 'Loan status updated.', data: db.loanApplications[appIndex] });
});

app.post('/api/register', (req, res) => {
  const { fullName, email, phone, password } = req.body || {};
  const cleanName = sanitizeString(fullName);
  const cleanEmail = normalizedEmail(email);
  const cleanPhone = sanitizeString(phone);
  const cleanPassword = sanitizeString(password);

  if (!cleanName || !cleanEmail || !cleanPhone || !cleanPassword) {
    return res.status(400).json({ success: false, message: 'Please provide your full name, email, phone number, and password.' });
  }

  if (cleanPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
  }

  const db = getDb();
  const existingUser = db.users.find((user) => user.email === cleanEmail);
  if (existingUser) {
    return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
  }

  const newUser = {
    id: (db.users.at(-1)?.id || 0) + 1,
    fullName: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    passwordHash: hashValue(cleanPassword),
    createdAt: new Date().toISOString(),
    loanStatus: 'Not submitted',
    balance: 0,
    availableBalance: 0,
    totalWithdrawn: 0,
    verificationItems: [],
    withdrawalHistory: [],
    depositHistory: []
  };

  db.users.push(newUser);
  writeDb(db);

  return res.status(201).json({
    success: true,
    message: 'Account created successfully.',
    user: {
      id: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      phone: newUser.phone,
      loanStatus: newUser.loanStatus
    }
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = normalizedEmail(email);
  const cleanPassword = sanitizeString(password);

  if (!cleanEmail || !cleanPassword) {
    return res.status(400).json({ success: false, message: 'Please provide your email and password.' });
  }

  const db = getDb();
  const user = db.users.find((entry) => entry.email === cleanEmail && entry.passwordHash === hashValue(cleanPassword));

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  return res.json({
    success: true,
    message: 'Login successful.',
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      loanStatus: user.loanStatus,
      balance: user.balance || 0,
      availableBalance: user.availableBalance || 0,
      totalWithdrawn: user.totalWithdrawn || 0,
      verificationItems: user.verificationItems || [],
      withdrawalHistory: user.withdrawalHistory || [],
      depositHistory: user.depositHistory || []
    }
  });
});

app.get('/api/user/dashboard', (req, res) => {
  const userId = sanitizeString(req.query.userId || req.query.id || '');
  const db = getDb();
  const user = db.users.find((entry) => String(entry.id) === String(userId));

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const userLoanApplications = db.loanApplications.filter((application) => String(application.userId) === String(user.id));
  const userUploads = db.verificationUploads.filter((upload) => String(upload.userId) === String(user.id));

  return res.json({
    success: true,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      loanStatus: user.loanStatus,
      balance: user.balance || 0,
      availableBalance: user.availableBalance || 0,
      totalWithdrawn: user.totalWithdrawn || 0,
      verificationItems: user.verificationItems || [],
      withdrawalHistory: user.withdrawalHistory || [],
      depositHistory: user.depositHistory || []
    },
    loanApplications: userLoanApplications,
    verificationUploads: userUploads
  });
});

app.get('/api/admin/deposit-wallets', (req, res) => {
  const { adminUsername, adminPassword } = req.query || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const db = getDb();
  const wallets = Array.isArray(db.depositWallets) && db.depositWallets.length ? db.depositWallets : DEFAULT_DEPOSIT_WALLETS;

  return res.json({ success: true, data: wallets });
});

app.post('/api/admin/deposit-wallets', (req, res) => {
  const { adminUsername, adminPassword, method, label, address, note } = req.body || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const cleanMethod = sanitizeString(method).toLowerCase();
  if (!depositMethods.includes(cleanMethod)) {
    return res.status(400).json({ success: false, message: 'Invalid deposit method.' });
  }

  const cleanAddress = sanitizeString(address);
  if (!cleanAddress) {
    return res.status(400).json({ success: false, message: 'Please provide the wallet address or banking details.' });
  }

  const db = getDb();
  const safeWallets = Array.isArray(db.depositWallets) && db.depositWallets.length ? db.depositWallets : [...DEFAULT_DEPOSIT_WALLETS];
  const walletIndex = safeWallets.findIndex((wallet) => String(wallet.method) === String(cleanMethod));
  const updatedWallet = {
    method: cleanMethod,
    label: sanitizeString(label) || (DEFAULT_DEPOSIT_WALLETS.find((wallet) => wallet.method === cleanMethod)?.label || cleanMethod),
    address: cleanAddress,
    note: sanitizeString(note) || (DEFAULT_DEPOSIT_WALLETS.find((wallet) => wallet.method === cleanMethod)?.note || '')
  };

  if (walletIndex === -1) {
    safeWallets.push(updatedWallet);
  } else {
    safeWallets[walletIndex] = updatedWallet;
  }

  db.depositWallets = safeWallets;
  writeDb(db);

  return res.json({ success: true, message: 'Deposit wallet updated successfully.', data: updatedWallet });
});

app.post('/api/user/deposit-request', (req, res) => {
  const { userId, method, amount, reference } = req.body || {};
  const db = getDb();
  const user = db.users.find((entry) => String(entry.id) === String(userId));

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const cleanMethod = sanitizeString(method).toLowerCase();
  const cleanAmount = Number(amount);
  const cleanReference = sanitizeString(reference);
  const walletConfig = (db.depositWallets || DEFAULT_DEPOSIT_WALLETS).find((wallet) => String(wallet.method) === String(cleanMethod));

  if (!depositMethods.includes(cleanMethod) || Number.isNaN(cleanAmount) || cleanAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Please provide a valid deposit amount and supported method.' });
  }

  if (!walletConfig || !walletConfig.address) {
    return res.status(400).json({ success: false, message: 'Deposit wallet is currently unavailable. Please contact administration.' });
  }

  user.depositHistory = user.depositHistory || [];
  const request = {
    id: Date.now(),
    type: 'deposit_request',
    method: cleanMethod,
    amount: cleanAmount,
    reference: cleanReference || `DEP-${Date.now()}`,
    walletAddress: walletConfig.address,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };

  user.depositHistory.unshift(request);
  writeDb(db);

  return res.status(201).json({ success: true, message: 'Deposit request submitted for admin review.', data: request });
});

app.post('/api/admin/process-deposit', (req, res) => {
  const { adminUsername, adminPassword, userId, depositId, status } = req.body || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const cleanStatus = sanitizeString(status).toLowerCase();
  if (!['approved', 'rejected'].includes(cleanStatus)) {
    return res.status(400).json({ success: false, message: 'Invalid deposit decision.' });
  }

  const db = getDb();
  const user = db.users.find((entry) => String(entry.id) === String(userId));

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const history = user.depositHistory || [];
  const itemIndex = history.findIndex((entry) => String(entry.id) === String(depositId));

  if (itemIndex === -1) {
    return res.status(404).json({ success: false, message: 'Deposit request not found.' });
  }

  const item = history[itemIndex];
  item.status = cleanStatus === 'approved' ? 'approved' : 'rejected';
  item.reviewedAt = new Date().toISOString();
  item.adminReviewed = true;

  if (cleanStatus === 'approved') {
    user.balance = Number(user.balance || 0) + Number(item.amount || 0);
    user.availableBalance = Number(user.availableBalance || 0) + Number(item.amount || 0);
  }

  writeDb(db);

  return res.json({ success: true, message: 'Deposit request processed.', data: item });
});

app.post('/api/admin/fund-user-account', (req, res) => {
  const { adminUsername, adminPassword, userId, amount } = req.body || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const cleanAmount = Number(amount);
  if (!userId || Number.isNaN(cleanAmount) || cleanAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Please provide a valid user and funding amount.' });
  }

  const db = getDb();
  const userIndex = db.users.findIndex((entry) => String(entry.id) === String(userId));

  if (userIndex === -1) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const user = db.users[userIndex];
  user.balance = Number(user.balance || 0) + cleanAmount;
  user.availableBalance = Number(user.availableBalance || 0) + cleanAmount;
  user.loanStatus = user.loanStatus === 'Approved' || user.loanStatus === 'Pending review' ? user.loanStatus : 'Approved';
  user.withdrawalHistory = user.withdrawalHistory || [];
  user.withdrawalHistory.unshift({
    id: Date.now(),
    type: 'admin_funding',
    amount: cleanAmount,
    createdAt: new Date().toISOString(),
    status: 'completed'
  });

  writeDb(db);

  return res.json({
    success: true,
    message: 'Loan funds were credited to the user account.',
    data: { userId: user.id, balance: user.balance, availableBalance: user.availableBalance }
  });
});

app.get('/api/admin/deposits', (req, res) => {
  const { adminUsername, adminPassword } = req.query || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const db = getDb();
  const deposits = [];

  db.users.forEach((user) => {
    (user.depositHistory || []).forEach((item) => {
      if (item.type === 'deposit_request') {
        deposits.push({
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          ...item
        });
      }
    });
  });

  return res.json({ success: true, data: deposits });
});

app.get('/api/admin/withdrawals', (req, res) => {
  const { adminUsername, adminPassword } = req.query || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const db = getDb();
  const withdrawals = [];

  db.users.forEach((user) => {
    (user.withdrawalHistory || []).forEach((item) => {
      if (item.type === 'withdrawal_request') {
        withdrawals.push({
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          ...item
        });
      }
    });
  });

  return res.json({ success: true, data: withdrawals });
});

app.post('/api/admin/process-withdrawal', (req, res) => {
  const { adminUsername, adminPassword, userId, withdrawalId, status, adminNote } = req.body || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const cleanStatus = sanitizeString(status).toLowerCase();
  const cleanNote = sanitizeString(adminNote || '').slice(0, 300);
  if (!['approved', 'rejected'].includes(cleanStatus)) {
    return res.status(400).json({ success: false, message: 'Invalid withdrawal decision.' });
  }

  const db = getDb();
  const user = db.users.find((entry) => String(entry.id) === String(userId));

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const history = user.withdrawalHistory || [];
  const itemIndex = history.findIndex((entry) => String(entry.id) === String(withdrawalId));

  if (itemIndex === -1) {
    return res.status(404).json({ success: false, message: 'Withdrawal request not found.' });
  }

  const item = history[itemIndex];
  item.status = cleanStatus === 'approved' ? 'approved' : 'rejected';
  item.reviewedAt = new Date().toISOString();
  item.adminReviewed = true;
  item.adminNote = cleanNote || (cleanStatus === 'approved' ? 'Approved by admin.' : 'Rejected by admin.');

  if (cleanStatus === 'approved') {
    user.balance = Number(user.balance || 0) - Number(item.amount || 0);
    user.totalWithdrawn = Number(user.totalWithdrawn || 0) + Number(item.amount || 0);
    user.availableBalance = Math.max(Number(user.availableBalance || 0) - Number(item.amount || 0), 0);
  }

  writeDb(db);

  return res.json({ success: true, message: 'Withdrawal request processed.', data: item });
});

app.post('/api/user/withdrawal-request', (req, res) => {
  const { userId, amount, method, walletAddress } = req.body || {};
  const db = getDb();
  const user = db.users.find((entry) => String(entry.id) === String(userId));

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const cleanAmount = Number(amount);
  const cleanMethod = sanitizeString(method).toLowerCase();
  const cleanWallet = sanitizeString(walletAddress);

  if (!withdrawalMethods.includes(cleanMethod) || Number.isNaN(cleanAmount) || cleanAmount <= 0 || !cleanWallet) {
    return res.status(400).json({ success: false, message: 'Please provide a valid withdrawal amount, method, and wallet address.' });
  }

  if (Number(user.availableBalance || 0) < cleanAmount) {
    return res.status(400).json({ success: false, message: 'Insufficient available balance for withdrawal.' });
  }

  const request = {
    id: Date.now(),
    type: 'withdrawal_request',
    method: cleanMethod,
    amount: cleanAmount,
    walletAddress: cleanWallet,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };

  user.withdrawalHistory = user.withdrawalHistory || [];
  user.withdrawalHistory.unshift(request);
  writeDb(db);

  return res.status(201).json({ success: true, message: 'Withdrawal request submitted for admin approval.', data: request });
});

app.post('/api/user/loan-application', (req, res) => {
  const { userId, product, amount, term } = req.body || {};
  const db = getDb();
  const user = db.users.find((entry) => String(entry.id) === String(userId));

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const cleanProduct = sanitizeString(product);
  const cleanAmount = sanitizeString(amount);
  const cleanTerm = sanitizeString(term);
  if (!cleanProduct || !cleanAmount || !cleanTerm) {
    return res.status(400).json({ success: false, message: 'Please provide product, amount, and term.' });
  }

  const application = {
    id: (db.loanApplications.at(-1)?.id || 0) + 1,
    userId: user.id,
    name: user.fullName,
    email: user.email,
    phone: user.phone,
    product: cleanProduct,
    amount: cleanAmount,
    term: cleanTerm,
    status: 'Pending review',
    createdAt: new Date().toISOString()
  };

  db.loanApplications.push(application);
  user.loanStatus = 'Pending review';
  writeDb(db);

  return res.status(201).json({ success: true, message: 'Loan application submitted successfully.', data: application });
});

app.post('/api/user/upload-verification', (req, res) => {
  const { userId, documentType, fileName, fileUrl } = req.body || {};
  const db = getDb();
  const user = db.users.find((entry) => String(entry.id) === String(userId));

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const cleanDocumentType = sanitizeString(documentType);
  const cleanFileName = sanitizeString(fileName);
  const cleanFileUrl = sanitizeString(fileUrl);

  if (!verificationDocs.includes(cleanDocumentType) || !cleanFileName || !cleanFileUrl) {
    return res.status(400).json({ success: false, message: 'Please provide a valid document type and file details.' });
  }

  const upload = {
    id: (db.verificationUploads.at(-1)?.id || 0) + 1,
    userId: user.id,
    documentType: cleanDocumentType,
    fileName: cleanFileName,
    fileUrl: cleanFileUrl,
    uploadedAt: new Date().toISOString(),
    reviewed: false,
    reviewDecision: 'Pending review'
  };

  db.verificationUploads.push(upload);
  user.verificationItems = user.verificationItems || [];
  user.verificationItems.push({
    id: upload.id,
    documentType: cleanDocumentType,
    fileName: cleanFileName,
    fileUrl: cleanFileUrl,
    reviewed: false,
    reviewDecision: 'Pending review'
  });
  writeDb(db);

  return res.status(201).json({ success: true, message: 'Verification document uploaded.', data: upload });
});

app.post('/api/admin/review-verification', (req, res) => {
  const { adminUsername, adminPassword, uploadId, decision } = req.body || {};

  if (!adminUsername || !adminPassword) {
    return res.status(401).json({ success: false, message: 'Admin authentication required.' });
  }

  if (adminUsername !== ADMIN_USERNAME || hashValue(adminPassword) !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const cleanDecision = sanitizeString(decision).toLowerCase();
  if (!['approved', 'rejected', 'pending'].includes(cleanDecision)) {
    return res.status(400).json({ success: false, message: 'Invalid review decision.' });
  }

  const db = getDb();
  const uploadIndex = db.verificationUploads.findIndex((upload) => String(upload.id) === String(uploadId));

  if (uploadIndex === -1) {
    return res.status(404).json({ success: false, message: 'Verification document not found.' });
  }

  const decisionLabel = cleanDecision === 'approved' ? 'Approved' : cleanDecision === 'rejected' ? 'Rejected' : 'Pending review';
  db.verificationUploads[uploadIndex].reviewed = cleanDecision === 'approved' || cleanDecision === 'rejected';
  db.verificationUploads[uploadIndex].reviewDecision = decisionLabel;
  db.verificationUploads[uploadIndex].reviewedAt = new Date().toISOString();

  const user = db.users.find((entry) => String(entry.id) === String(db.verificationUploads[uploadIndex].userId));
  if (user) {
    user.verificationItems = user.verificationItems || [];
    const itemIndex = user.verificationItems.findIndex((item) => String(item.id) === String(uploadId));
    if (itemIndex !== -1) {
      user.verificationItems[itemIndex].reviewed = db.verificationUploads[uploadIndex].reviewed;
      user.verificationItems[itemIndex].reviewDecision = decisionLabel;
    }
  }

  writeDb(db);

  return res.json({
    success: true,
    message: `Verification document ${decisionLabel.toLowerCase()}.`,
    data: db.verificationUploads[uploadIndex]
  });
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const suppliedUsername = sanitizeString(username);
  const suppliedPassword = sanitizeString(password);

  if (suppliedUsername === ADMIN_USERNAME && hashValue(suppliedPassword) === ADMIN_PASSWORD_HASH) {
    return res.json({ success: true, redirectTo: '/admin' });
  }

  return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/account/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/account/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/account/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'customer-dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  initSqlDatabase().catch(() => {});

  app.listen(PORT, () => {
    console.log(`FUNDARIS CREDIT app running on http://localhost:${PORT}`);
  });
}

module.exports = app;

